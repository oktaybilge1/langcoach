import {
  CorruptDataError,
  InvalidDataError,
  isoWeek,
  type Coach,
  type Store,
} from '@langcoach/core/browser';
import {
  DEFAULT_SETTINGS,
  type ErrorInfo,
  type LastCapture,
  type Message,
  type MessageMap,
  type MessageType,
  type Response,
  type ResponseOf,
  type Settings,
  type Snapshot,
} from '../shared/messages';
import type { StorageAreaLike } from './store';

export const SETTINGS_KEY = 'langcoach:settings';
export const LAST_CAPTURE_KEY = 'langcoach:lastCapture';

export interface RouterDeps {
  coach: Coach;
  store: Store;
  /** Storage area for settings and the last-capture marker (never the learning state). */
  area: StorageAreaLike;
  clock?: () => Date;
}

export function toErrorInfo(e: unknown): ErrorInfo {
  if (e instanceof CorruptDataError) return { name: e.name, message: e.message, preservedAt: e.preservedAt };
  if (e instanceof Error) return { name: e.name, message: e.message };
  return { name: 'Error', message: String(e) };
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function mergeSettings(current: Settings, patch: Partial<Settings>): Settings {
  const next: Settings = { ...current };
  if (patch.autoSave !== undefined) {
    if (typeof patch.autoSave !== 'boolean') throw new InvalidDataError('autoSave must be a boolean');
    next.autoSave = patch.autoSave;
  }
  if (patch.reminderTime !== undefined) {
    if (patch.reminderTime !== null && !(typeof patch.reminderTime === 'string' && TIME_RE.test(patch.reminderTime))) {
      throw new InvalidDataError('reminderTime must be "HH:MM" or null');
    }
    next.reminderTime = patch.reminderTime;
  }
  if (patch.uiLanguage !== undefined) {
    if (typeof patch.uiLanguage !== 'string' || patch.uiLanguage === '') {
      throw new InvalidDataError('uiLanguage must be a non-empty string');
    }
    next.uiLanguage = patch.uiLanguage;
  }
  if (patch.hasCamera !== undefined) {
    if (typeof patch.hasCamera !== 'boolean') throw new InvalidDataError('hasCamera must be a boolean');
    next.hasCamera = patch.hasCamera;
  }
  return next;
}

export function createRouter(deps: RouterDeps) {
  const { coach, store, area } = deps;
  const clock = deps.clock ?? (() => new Date());

  async function readSettings(): Promise<Settings> {
    const stored = (await area.get(SETTINGS_KEY))[SETTINGS_KEY];
    return { ...DEFAULT_SETTINGS, ...(typeof stored === 'object' && stored !== null ? stored : {}) };
  }

  async function snapshot(): Promise<Snapshot> {
    const [state, progress, lc] = await Promise.all([store.load(), coach.progress(), area.get(LAST_CAPTURE_KEY)]);
    const today = state.profile ? await coach.today() : null;
    return {
      profile: state.profile,
      today,
      plan: state.plans[isoWeek(clock())] ?? null,
      progress: {
        streak: progress.streak,
        totalXp: progress.totalXp,
        weekly: progress.weekly,
        dueCount: progress.dueCount,
      },
      dueCount: progress.dueCount,
      lastCapture: (lc[LAST_CAPTURE_KEY] as LastCapture | undefined) ?? null,
    };
  }

  const handlers: { [K in MessageType]: (m: { type: K } & MessageMap[K]['request']) => Promise<ResponseOf<K>> } = {
    // Task 5 fills in capture and undo (parse, saveLesson, plan auto-complete, lastCapture marker).
    capture: async () => {
      throw new Error('capture is not implemented yet');
    },
    undo: async () => {
      throw new Error('undo is not implemented yet');
    },
    getSnapshot: () => snapshot(),
    setProfile: (m) => coach.setProfile(m.profile),
    getDue: (m) => coach.dueReviews(m.limit),
    review: (m) => coach.submitReview(m.cardId, m.rating),
    updateCard: (m) => coach.updateCard(m.cardId, m.patch),
    saveManual: (m) =>
      coach.saveManualCard({
        term: m.term,
        translation: m.translation,
        example: m.example,
        pronunciation: m.pronunciation,
      }),
    exportData: async () => ({ json: JSON.stringify(await coach.exportData(), null, 2) }),
    importData: async (m) => {
      let raw: unknown;
      try {
        raw = JSON.parse(m.json);
      } catch {
        throw new InvalidDataError('The file is not valid JSON');
      }
      return coach.importData(raw);
    },
    reset: async () => {
      await coach.deleteAll();
      await area.remove(LAST_CAPTURE_KEY);
      return null;
    },
    getSettings: () => readSettings(),
    setSettings: async (m) => {
      const next = mergeSettings(await readSettings(), m.settings ?? {});
      await area.set({ [SETTINGS_KEY]: next });
      return next;
    },
  };

  return {
    async handle<K extends MessageType>(msg: { type: K } & MessageMap[K]['request']): Promise<Response<ResponseOf<K>>> {
      try {
        const h = handlers[msg.type] as (m: Message) => Promise<ResponseOf<K>>;
        return { ok: true, data: await h(msg as Message) };
      } catch (e) {
        return { ok: false, error: toErrorInfo(e) };
      }
    },
  };
}
