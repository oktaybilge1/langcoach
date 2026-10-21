import {
  InvalidDataError,
  NotFoundError,
  type Coach,
  type GrammarPoint,
  type LessonSource,
  type Store,
} from '@langcoach/core/browser';
import { parseCapture, type ParsedCapture } from '../lib/parse';
import type { CaptureResult, LastCapture, MessageMap } from '../shared/messages';
import type { StorageAreaLike } from './store';

export const LAST_CAPTURE_KEY = 'langcoach:lastCapture';
export const PENDING_GRAMMAR_KEY = 'langcoach:pendingGrammar';
/** Grammar and terms of one Tiny Lesson are requested in parallel; pair them within this window. */
export const GRAMMAR_WINDOW_MS = 5 * 60_000;
export const UNDO_WINDOW_MS = 10 * 60_000;
/** core saveLesson accepts at most this many items per lesson. */
export const MAX_ITEMS_PER_LESSON = 50;

export interface CaptureContext {
  tabId?: number;
}

export interface CaptureDeps {
  coach: Coach;
  store: Store;
  area: StorageAreaLike;
  clock: () => Date;
  getAutoSave: () => Promise<boolean>;
  /** Sets settings.pendingTargetLanguage unless one is already stored (serialized with other settings writes). */
  notePendingTarget: (targetLanguage: string) => Promise<void>;
  /** Extension-console logger (never the page). */
  log: (...args: unknown[]) => void;
}

interface PendingGrammar {
  grammar: GrammarPoint[];
  at: string;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const pairKey = (targetLanguage: string, purpose: string | undefined) => JSON.stringify([targetLanguage, purpose ?? '']);

function asLastCapture(v: unknown): LastCapture | null {
  if (!isObj(v) || !Array.isArray(v.lessonIds) || typeof v.at !== 'string') return null;
  if (!v.lessonIds.every((x) => typeof x === 'string')) return null;
  return v as unknown as LastCapture;
}

/** Promise-chain mutex: captures and undos run one at a time (terms and grammar arrive in parallel). */
function serializer() {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(task: () => Promise<T>): Promise<T> => {
    const next = tail.then(task, task);
    tail = next.catch(() => undefined);
    return next;
  };
}

export function createCaptureService(deps: CaptureDeps) {
  const { coach, store, area, clock, log } = deps;
  const run = serializer();

  /** Pending grammar entries that have not expired. */
  async function readPending(now: number): Promise<{ map: Record<string, PendingGrammar>; pruned: boolean }> {
    const raw = (await area.get(PENDING_GRAMMAR_KEY))[PENDING_GRAMMAR_KEY];
    const map: Record<string, PendingGrammar> = {};
    let pruned = false;
    if (isObj(raw)) {
      for (const [k, e] of Object.entries(raw)) {
        const fresh =
          isObj(e) && Array.isArray(e.grammar) && typeof e.at === 'string' && now - Date.parse(e.at) <= GRAMMAR_WINDOW_MS;
        if (fresh) map[k] = e as unknown as PendingGrammar;
        else pruned = true;
      }
    }
    return { map, pruned };
  }

  async function writePending(map: Record<string, PendingGrammar>): Promise<void> {
    if (Object.keys(map).length === 0) await area.remove(PENDING_GRAMMAR_KEY);
    else await area.set({ [PENDING_GRAMMAR_KEY]: map });
  }

  async function handleGrammar(p: ParsedCapture): Promise<CaptureResult> {
    const grammar = p.grammar ?? [];
    const now = clock().getTime();
    const s = await store.load();
    let match: (typeof s.lessons)[number] | undefined;
    for (const l of s.lessons) {
      const age = now - Date.parse(l.createdAt);
      if (
        l.kind === 'tiny_lesson' &&
        l.source?.targetLanguage === p.targetLanguage &&
        l.source?.purpose === p.purpose &&
        age >= 0 &&
        age <= GRAMMAR_WINDOW_MS
      ) {
        match = l; // keep the most recent (lessons are appended in time order)
      }
    }
    if (match) {
      // A split capture is several lessons; grammar belongs on the first one.
      const lc = asLastCapture((await area.get(LAST_CAPTURE_KEY))[LAST_CAPTURE_KEY]);
      const id = lc?.lessonIds.includes(match.id) ? lc.lessonIds[0]! : match.id;
      await coach.attachGrammar(id, grammar);
      return { status: 'grammar' };
    }
    const { map } = await readPending(now);
    map[pairKey(p.targetLanguage, p.purpose)] = { grammar, at: new Date(now).toISOString() };
    await writePending(map);
    return { status: 'grammar' };
  }

  async function saveItems(p: ParsedCapture, ctx: CaptureContext): Promise<CaptureResult> {
    const kind = p.lessonKind as 'tiny_lesson' | 'slang_hang' | 'word_cam';
    const now = clock().getTime();

    let grammar: GrammarPoint[] | undefined;
    let pending: Record<string, PendingGrammar> | undefined;
    let pendingDirty = false;
    if (kind === 'tiny_lesson') {
      const r = await readPending(now);
      pending = r.map;
      pendingDirty = r.pruned;
      const key = pairKey(p.targetLanguage, p.purpose);
      if (pending[key]) {
        grammar = pending[key].grammar;
        delete pending[key];
        pendingDirty = true;
      }
    }

    const source: LessonSource = {
      app: 'lll',
      targetLanguage: p.targetLanguage,
      sourceLanguage: p.sourceLanguage,
      ...(p.purpose ? { purpose: p.purpose } : {}),
    };
    const saved: { id: string; newCards: number; duplicates: number }[] = [];
    try {
      for (let i = 0; i * MAX_ITEMS_PER_LESSON < p.items.length; i++) {
        const items = p.items.slice(i * MAX_ITEMS_PER_LESSON, (i + 1) * MAX_ITEMS_PER_LESSON);
        const r = await coach.saveLesson({
          kind,
          situation: i === 0 ? p.situation : `${p.situation} (${i + 1})`,
          items,
          ...(i === 0 && grammar ? { grammar } : {}),
          source,
        });
        saved.push({ id: r.lesson.id, newCards: r.newCards, duplicates: r.duplicates.length });
      }
    } catch (e) {
      // All or nothing: remove the chunks that did save, so the learner never gets a capture they cannot undo.
      for (const s of saved) {
        try {
          await coach.undoLesson(s.id);
        } catch (e2) {
          log('LangCoach: rollback failed', e2);
        }
      }
      throw e;
    }
    if (pending && pendingDirty) await writePending(pending);

    const lessonIds = saved.map((s) => s.id);
    const newCards = saved.reduce((n, s) => n + s.newCards, 0);
    const duplicates = saved.reduce((n, s) => n + s.duplicates, 0);
    let xp = 0;
    try {
      xp = (await coach.autoComplete(kind, { lessonId: lessonIds[0] })).xpAwarded;
    } catch (e) {
      log('LangCoach: could not record the activity', e); // cards are saved; only XP/task is missing
    }
    const lc: LastCapture = {
      lessonIds,
      newCards,
      duplicates,
      at: new Date(now).toISOString(),
      tabId: ctx.tabId ?? null,
    };
    await area.set({ [LAST_CAPTURE_KEY]: lc });
    return { status: 'saved', lessonIds, newCards, duplicates, xp };
  }

  return {
    capture(msg: MessageMap['capture']['request'], ctx: CaptureContext = {}): Promise<CaptureResult | null> {
      const parsed = parseCapture(msg.kind, msg.request, msg.response);
      if (!parsed) {
        log(`LangCoach: ignored a ${msg.kind} response with an unknown shape`);
        return Promise.resolve(null);
      }
      return run(async () => {
        try {
          if (!(await store.load()).profile) await deps.notePendingTarget(parsed.targetLanguage);
          if (parsed.lessonKind === 'grammar') return await handleGrammar(parsed);
          if (!msg.force && !(await deps.getAutoSave())) return { status: 'pending', count: parsed.items.length };
          return await saveItems(parsed, ctx);
        } catch (e) {
          log('LangCoach: capture failed', e);
          throw e;
        }
      });
    },

    undo(lessonIds: string[]): Promise<{ removedCards: number }> {
      return run(async () => {
        const lc = asLastCapture((await area.get(LAST_CAPTURE_KEY))[LAST_CAPTURE_KEY]);
        const age = lc ? clock().getTime() - Date.parse(lc.at) : NaN;
        if (!lc || !(age >= 0 && age <= UNDO_WINDOW_MS)) {
          throw new InvalidDataError('Nothing to undo: the last capture is gone or older than 10 minutes');
        }
        if (!lessonIds.every((id) => lc.lessonIds.includes(id))) {
          throw new InvalidDataError('Only the most recent capture can be undone');
        }
        let removedCards = 0;
        for (const id of lessonIds) {
          try {
            removedCards += (await coach.undoLesson(id)).removedCards;
          } catch (e) {
            if (!(e instanceof NotFoundError)) throw e;
          }
        }
        const rest = lc.lessonIds.filter((id) => !lessonIds.includes(id));
        if (rest.length) await area.set({ [LAST_CAPTURE_KEY]: { ...lc, lessonIds: rest } });
        else await area.remove(LAST_CAPTURE_KEY);
        return { removedCards };
      });
    },
  };
}
