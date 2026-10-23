import {
  InvalidDataError,
  NotFoundError,
  type Coach,
  type GrammarPoint,
  type LessonSource,
  type Store,
} from '@langcoach/core/browser';
import { parseCapture, type ParsedCapture } from '../lib/parse';
import { translationPair } from '../lib/translate';
import type { CaptureResult, LastCapture, MessageMap, NativeCaptureHint, NativePair } from '../shared/messages';
import type { StorageAreaLike } from './store';

export const LAST_CAPTURE_KEY = 'langcoach:lastCapture';
export const PENDING_GRAMMAR_KEY = 'langcoach:pendingGrammar';
/** Grammar and terms of one Tiny Lesson are requested in parallel; pair them within this window. */
export const GRAMMAR_WINDOW_MS = 5 * 60_000;
export const UNDO_WINDOW_MS = 10 * 60_000;
/** core saveLesson accepts at most this many items per lesson. */
export const MAX_ITEMS_PER_LESSON = 50;
/** Captures beyond these bounds are ignored (logged only): real LLL responses are far smaller. */
export const MAX_CAPTURE_JSON_BYTES = 2 * 1024 * 1024;
export const MAX_CAPTURE_ITEMS = 500;

function jsonSize(v: unknown): number {
  try {
    return JSON.stringify(v)?.length ?? 0;
  } catch {
    return Infinity;
  }
}

export interface CaptureContext {
  tabId?: number;
}

export interface CaptureDeps {
  coach: Coach;
  store: Store;
  area: StorageAreaLike;
  clock: () => Date;
  getAutoSave: () => Promise<boolean>;
  /** settings.showNativeOnPage (default true). */
  getShowNativeOnPage?: () => Promise<boolean>;
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

  /** The translation pair for this capture, or null (no profile, unknown/same native language). */
  async function nativePair(p: ParsedCapture, nativeLanguage: string | undefined): Promise<NativePair | null> {
    try {
      const pair = translationPair(p.sourceLanguage, nativeLanguage);
      if (!pair) return null;
      const overlay = deps.getShowNativeOnPage ? await deps.getShowNativeOnPage() : true;
      return { ...pair, overlay };
    } catch (e) {
      log('LangCoach: native translation hint failed', e);
      return null;
    }
  }

  /** Card id, term and English meaning of every item of the capture (new or already in the deck). One load. */
  async function nativeHint(p: ParsedCapture): Promise<NativeCaptureHint | undefined> {
    const s = await store.load();
    const pair = await nativePair(p, s.profile?.nativeLanguage);
    if (!pair) return undefined;
    const byKey = new Map(s.cards.map((c) => [c.term.trim().toLocaleLowerCase(), c]));
    const seen = new Set<string>();
    const items: NativeCaptureHint['items'] = [];
    for (const it of p.items) {
      const card = byKey.get(it.term.trim().toLocaleLowerCase());
      if (!card || seen.has(card.id)) continue;
      seen.add(card.id);
      items.push({
        cardId: card.id,
        term: card.term,
        meaning: card.translation,
        ...(card.nativeTranslation ? { native: card.nativeTranslation } : {}),
      });
    }
    return items.length ? { ...pair, items: items.slice(0, MAX_CAPTURE_ITEMS) } : undefined;
  }

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
      return grammarResult(p, s.profile?.nativeLanguage);
    }
    const { map } = await readPending(now);
    map[pairKey(p.targetLanguage, p.purpose)] = { grammar, at: new Date(now).toISOString() };
    await writePending(map);
    return grammarResult(p, s.profile?.nativeLanguage);
  }

  async function grammarResult(p: ParsedCapture, nativeLanguage: string | undefined): Promise<CaptureResult> {
    const pair = await nativePair(p, nativeLanguage);
    const examples = [
      ...new Set((p.grammar ?? []).flatMap((g) => g.examples.map((x) => x.translation.trim()).filter(Boolean))),
    ].slice(0, 100);
    return pair && pair.overlay && examples.length ? { status: 'grammar', native: { ...pair, examples } } : { status: 'grammar' };
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
    let native: NativeCaptureHint | undefined;
    try {
      native = await nativeHint(p);
    } catch (e) {
      log('LangCoach: native translation hint failed', e); // the capture itself is saved
    }
    return { status: 'saved', lessonIds, newCards, duplicates, xp, ...(native ? { native } : {}) };
  }

  return {
    capture(msg: MessageMap['capture']['request'], ctx: CaptureContext = {}): Promise<CaptureResult | null> {
      if (jsonSize(msg.response) > MAX_CAPTURE_JSON_BYTES) {
        log(`LangCoach: ignored a ${msg.kind} response larger than 2 MB`);
        return Promise.resolve(null);
      }
      const parsed = parseCapture(msg.kind, msg.request, msg.response);
      if (parsed && parsed.items.length > MAX_CAPTURE_ITEMS) {
        log(`LangCoach: ignored a ${msg.kind} response with more than ${MAX_CAPTURE_ITEMS} items`);
        return Promise.resolve(null);
      }
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
