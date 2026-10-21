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
import { LAST_CAPTURE_KEY, createCaptureService, type CaptureContext } from './capture';
import type { StorageAreaLike } from './store';

export { LAST_CAPTURE_KEY, PENDING_GRAMMAR_KEY } from './capture';
export const SETTINGS_KEY = 'langcoach:settings';

export interface RouterDeps {
  coach: Coach;
  store: Store;
  /** Storage area for settings and the last-capture marker (never the learning state). */
  area: StorageAreaLike;
  clock?: () => Date;
  /** chrome.sidePanel (injected in tests). Must be called synchronously inside the message handler. */
  sidePanel?: { open(options: { tabId: number }): Promise<void> };
  /** Optional hook notified whenever settings change (e.g. to reschedule reminders). */
  onSettingsChanged?: (settings: Settings) => void | Promise<void>;
  /** Extension-console logger; defaults to console.warn. */
  log?: (...args: unknown[]) => void;
}

export function toErrorInfo(e: unknown): ErrorInfo {
  if (e instanceof CorruptDataError) return { name: e.name, message: e.message, preservedAt: e.preservedAt };
  if (e instanceof InvalidDataError) return { name: e.name, message: e.message, code: 'invalid' };
  if (e instanceof Error) return { name: e.name, message: e.message };
  return { name: 'Error', message: String(e) };
}

const CAPTURE_KINDS = ['terms', 'grammar', 'conversation', 'object-descriptors'];
const MAX_JSON = 20 * 1024 * 1024;
const bad = (m: string): never => {
  throw new InvalidDataError(m);
};
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const id = (v: unknown, name: string) => {
  if (typeof v !== 'string' || v === '' || v.length > 200) bad(`${name} must be a non-empty string up to 200 characters`);
};
const optStr = (v: unknown, name: string) => {
  if (v !== undefined && typeof v !== 'string') bad(`${name} must be a string`);
};

/** Runtime payload guard per message type; throws InvalidDataError (code 'invalid'). */
export function validateMessage(m: Record<string, unknown>): void {
  switch (m.type) {
    case 'capture':
      if (!CAPTURE_KINDS.includes(m.kind as string)) bad('kind is not a known capture kind');
      if (typeof m.pageUrl !== 'string') bad('pageUrl must be a string');
      if (m.force !== undefined && typeof m.force !== 'boolean') bad('force must be a boolean');
      break;
    case 'undo':
      if (!Array.isArray(m.lessonIds) || m.lessonIds.length < 1 || m.lessonIds.length > 100) {
        bad('lessonIds must be an array of 1 to 100 ids');
      }
      (m.lessonIds as unknown[]).forEach((x, i) => id(x, `lessonIds[${i}]`));
      break;
    case 'setProfile':
      if (!isObj(m.profile)) bad('profile must be an object');
      break;
    case 'createPlan':
      id(m.theme, 'theme');
      break;
    case 'completeReview':
      if (!Number.isInteger(m.cardsReviewed) || (m.cardsReviewed as number) < 1 || (m.cardsReviewed as number) > 1000) {
        bad('cardsReviewed must be an integer from 1 to 1000');
      }
      break;
    case 'getDue':
      if (!Number.isInteger(m.limit) || (m.limit as number) < 1 || (m.limit as number) > 200) {
        bad('limit must be an integer from 1 to 200');
      }
      break;
    case 'review':
      id(m.cardId, 'cardId');
      if (![1, 2, 3, 4].includes(m.rating as number)) bad('rating must be 1, 2, 3 or 4');
      break;
    case 'updateCard':
      id(m.cardId, 'cardId');
      if (!isObj(m.patch)) bad('patch must be an object');
      optStr((m.patch as Record<string, unknown>).translation, 'translation');
      optStr((m.patch as Record<string, unknown>).example, 'example');
      break;
    case 'saveManual':
      id(m.term, 'term');
      optStr(m.translation, 'translation');
      optStr(m.example, 'example');
      optStr(m.pronunciation, 'pronunciation');
      break;
    case 'importData':
      if (typeof m.json !== 'string') bad('json must be a string');
      else if (m.json.length > MAX_JSON) bad('json is too large (20 MB maximum)');
      break;
    case 'setSettings':
      if (!isObj(m.settings)) bad('settings must be an object');
      break;
  }
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

  let settingsTail: Promise<unknown> = Promise.resolve();
  const serialized = <T>(task: () => Promise<T>): Promise<T> => {
    const next = settingsTail.then(task, task);
    settingsTail = next.catch(() => undefined);
    return next;
  };

  async function readSettings(): Promise<Settings> {
    const raw = (await area.get(SETTINGS_KEY))[SETTINGS_KEY];
    const st = isObj(raw) ? raw : {};
    return {
      autoSave: typeof st.autoSave === 'boolean' ? st.autoSave : DEFAULT_SETTINGS.autoSave,
      reminderTime:
        st.reminderTime === null || (typeof st.reminderTime === 'string' && TIME_RE.test(st.reminderTime))
          ? st.reminderTime
          : DEFAULT_SETTINGS.reminderTime,
      uiLanguage:
        typeof st.uiLanguage === 'string' && st.uiLanguage !== '' ? st.uiLanguage : DEFAULT_SETTINGS.uiLanguage,
      hasCamera: typeof st.hasCamera === 'boolean' ? st.hasCamera : DEFAULT_SETTINGS.hasCamera,
      ...(typeof st.pendingTargetLanguage === 'string' && st.pendingTargetLanguage !== ''
        ? { pendingTargetLanguage: st.pendingTargetLanguage }
        : {}),
    };
  }

  const log = deps.log ?? ((...a: unknown[]) => console.warn(...a));
  const captures = createCaptureService({
    coach,
    store,
    area,
    clock,
    log,
    getAutoSave: async () => (await readSettings()).autoSave,
    notePendingTarget: (targetLanguage) =>
      serialized(async () => {
        const cur = await readSettings();
        if (cur.pendingTargetLanguage) return;
        await area.set({ [SETTINGS_KEY]: { ...cur, pendingTargetLanguage: targetLanguage } });
      }),
  });

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
      state,
    };
  }

  const handlers: {
    [K in MessageType]: (m: { type: K } & MessageMap[K]['request'], ctx: CaptureContext) => Promise<ResponseOf<K>>;
  } = {
    capture: (m, ctx) =>
      captures.capture({ kind: m.kind, request: m.request, response: m.response, pageUrl: m.pageUrl, force: m.force }, ctx),
    undo: (m) => captures.undo(m.lessonIds),
    // No await before open(): Chrome only allows sidePanel.open() while the user gesture is still active.
    openPanel: async (_m, ctx) => {
      if (ctx.tabId === undefined) throw new InvalidDataError('openPanel must come from a tab');
      const sp = deps.sidePanel ?? chrome.sidePanel;
      await sp.open({ tabId: ctx.tabId });
      return null;
    },
    getSnapshot: () => snapshot(),
    setProfile: (m) => coach.setProfile(m.profile),
    createPlan: (m) => coach.weekPlan(m.theme),
    completeReview: (m) => coach.autoComplete('review', { cardsReviewed: m.cardsReviewed }),
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
    setSettings: (m) =>
      serialized(async () => {
        const next = mergeSettings(await readSettings(), m.settings);
        await area.set({ [SETTINGS_KEY]: next });
        if (deps.onSettingsChanged) await deps.onSettingsChanged(next);
        return next;
      }),
  };

  return {
    /** `ctx.tabId` is the sender tab (content-script messages). */
    async handle<K extends MessageType>(
      msg: { type: K } & MessageMap[K]['request'],
      ctx: CaptureContext = {},
    ): Promise<Response<ResponseOf<K>>> {
      try {
        validateMessage(msg as unknown as Record<string, unknown>);
        const h = handlers[msg.type] as (m: Message, c: CaptureContext) => Promise<ResponseOf<K>>;
        return { ok: true, data: await h(msg as Message, ctx) };
      } catch (e) {
        return { ok: false, error: toErrorInfo(e) };
      }
    },
  };
}
