import {
  CorruptDataError,
  InvalidDataError,
  isDue,
  isoWeek,
  progressOf,
  toLocalDate,
  type Coach,
  type State,
  type Store,
} from '@langcoach/core/browser';
import { suggestThemes, type Goal } from '../lib/themes';
import {
  DEFAULT_SETTINGS,
  type Banner,
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
/** Pending one-time rollover banners (Banner[]), removed when dismissed. */
export const BANNERS_KEY = 'langcoach:banners';
/** Local date (YYYY-MM-DD) of the last rollover, so the panel triggers it at most once per day. */
export const ROLLOVER_KEY = 'langcoach:rolloverDate';
const MAX_BANNERS = 10;

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
  /** Browser UI language, used for auto-created plan themes when the UI language setting is 'auto'. */
  uiLanguage?: () => string;
}

export function toErrorInfo(e: unknown): ErrorInfo {
  if (e instanceof CorruptDataError) return { name: e.name, message: e.message, preservedAt: e.preservedAt };
  if (e instanceof InvalidDataError) return { name: e.name, message: e.message, code: 'invalid' };
  if (e instanceof Error) return { name: e.name, message: e.message };
  return { name: 'Error', message: String(e) };
}

const MAX_NATIVE_ENTRIES = 500;
const MAX_PRACTICE_CARDS = 500;
const DEFAULT_PRACTICE_CARDS = 200;
const MAX_PRACTICE_RESULTS = 50;
const PRACTICE_OUTCOMES = ['correct', 'hard', 'wrong'];
const MAX_NATIVE_CHARS = 500;
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
      if (m.theme !== undefined) id(m.theme, 'theme');
      break;
    case 'dismissBanner':
      id(m.id, 'id');
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
    case 'getPracticeCards':
      if (
        m.limit !== undefined &&
        (!Number.isInteger(m.limit) || (m.limit as number) < 1 || (m.limit as number) > MAX_PRACTICE_CARDS)
      ) {
        bad(`limit must be an integer from 1 to ${MAX_PRACTICE_CARDS}`);
      }
      break;
    case 'recordPractice':
      if (typeof m.sessionId !== 'string' || m.sessionId.trim() === '' || m.sessionId.length > 100) {
        bad('sessionId must be a non-empty string of at most 100 characters');
      }
      if (!Array.isArray(m.results) || m.results.length < 1 || m.results.length > MAX_PRACTICE_RESULTS) {
        bad(`results must be an array of 1 to ${MAX_PRACTICE_RESULTS} items`);
      }
      (m.results as unknown[]).forEach((r, i) => {
        if (!isObj(r)) bad(`results[${i}] must be an object`);
        id((r as Record<string, unknown>).cardId, `results[${i}].cardId`);
        if (!PRACTICE_OUTCOMES.includes((r as Record<string, unknown>).outcome as string)) {
          bad(`results[${i}].outcome must be one of ${PRACTICE_OUTCOMES.join(', ')}`);
        }
      });
      break;
    case 'setNativeTranslations':
      if (!Array.isArray(m.entries) || m.entries.length > MAX_NATIVE_ENTRIES) {
        bad(`entries must be an array of at most ${MAX_NATIVE_ENTRIES} items`);
      }
      (m.entries as unknown[]).forEach((e, i) => {
        if (!isObj(e)) bad(`entries[${i}] must be an object`);
        id((e as Record<string, unknown>).cardId, `entries[${i}].cardId`);
        const text = (e as Record<string, unknown>).text;
        const len = typeof text === 'string' ? text.trim().length : 0;
        if (len < 1 || len > MAX_NATIVE_CHARS) bad(`entries[${i}].text must be 1 to ${MAX_NATIVE_CHARS} characters`);
      });
      break;
  }
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const PAIR_RE = /^[a-z]{2,3}(?:-[A-Za-z]{2,4})?:[a-z]{2,3}(?:-[A-Za-z]{2,4})?$/;
const MAX_DISMISSED_PAIRS = 20;
const isPairList = (v: unknown): v is string[] =>
  Array.isArray(v) && v.length <= MAX_DISMISSED_PAIRS && v.every((x) => typeof x === 'string' && PAIR_RE.test(x));

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
  if (patch.showNativeOnPage !== undefined) {
    if (typeof patch.showNativeOnPage !== 'boolean') throw new InvalidDataError('showNativeOnPage must be a boolean');
    next.showNativeOnPage = patch.showNativeOnPage;
  }
  if (patch.dismissedNativePairs !== undefined) {
    if (!isPairList(patch.dismissedNativePairs)) {
      throw new InvalidDataError(`dismissedNativePairs must be up to ${MAX_DISMISSED_PAIRS} pair keys like "en:tr"`);
    }
    next.dismissedNativePairs = [...new Set(patch.dismissedNativePairs)];
  }
  if (patch.soundEffects !== undefined) {
    if (typeof patch.soundEffects !== 'boolean') throw new InvalidDataError('soundEffects must be a boolean');
    next.soundEffects = patch.soundEffects;
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
      showNativeOnPage:
        typeof st.showNativeOnPage === 'boolean' ? st.showNativeOnPage : DEFAULT_SETTINGS.showNativeOnPage,
      soundEffects: typeof st.soundEffects === 'boolean' ? st.soundEffects : DEFAULT_SETTINGS.soundEffects,
      ...(isPairList(st.dismissedNativePairs) && st.dismissedNativePairs.length
        ? { dismissedNativePairs: st.dismissedNativePairs }
        : {}),
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
    getShowNativeOnPage: async () => (await readSettings()).showNativeOnPage,
    notePendingTarget: (targetLanguage) =>
      serialized(async () => {
        const cur = await readSettings();
        if (cur.pendingTargetLanguage) return;
        await area.set({ [SETTINGS_KEY]: { ...cur, pendingTargetLanguage: targetLanguage } });
      }),
  });

  const browserUiLanguage =
    deps.uiLanguage ??
    (() => (typeof chrome !== 'undefined' && chrome.i18n?.getUILanguage?.()) || 'en');

  /**
   * Creates the current ISO week's plan when a profile exists and the week has none (a new week started).
   * Returns the state as it is afterwards, so callers need not load it again.
   */
  async function ensurePlan(): Promise<State> {
    const state = await store.load();
    const week = isoWeek(clock());
    if (!state.profile || state.plans[week]) return state;
    const settings = await readSettings();
    const uiLang = settings.uiLanguage === 'auto' ? browserUiLanguage() : settings.uiLanguage;
    const seed = Number(week.split('-W')[1]) || 0;
    const theme = suggestThemes(state.profile.goal as Goal, state.profile.level, uiLang, seed)[0] ?? 'everyday conversation';
    try {
      await coach.weekPlan(theme); // returns the existing plan if one was created meanwhile
    } catch (e) {
      log('LangCoach: could not create the weekly plan', e);
      return state;
    }
    return store.load();
  }

  const isBanner = (b: unknown): b is Banner =>
    isObj(b) &&
    typeof b.id === 'string' &&
    ((b.kind === 'freezeUsed' && typeof b.date === 'string') ||
      (b.kind === 'freezeEarned' && typeof b.count === 'number'));

  async function readBanners(): Promise<Banner[]> {
    const raw = (await area.get(BANNERS_KEY))[BANNERS_KEY];
    return Array.isArray(raw) ? raw.filter(isBanner) : [];
  }

  /**
   * Applies streak freezes for today (Coach.rollover) and queues one-time banners for what changed.
   * Idempotent per day; never throws (startup/alarm callers must not crash the worker).
   */
  async function rollover(): Promise<Banner[]> {
    try {
      const today = toLocalDate(clock());
      const r = await coach.rollover();
      const added: Banner[] = [
        ...r.consumed.map((date): Banner => ({ id: `freezeUsed:${date}`, kind: 'freezeUsed', date })),
        ...(r.earned > 0 ? [{ id: `freezeEarned:${today}`, kind: 'freezeEarned', count: r.earned } as Banner] : []),
      ];
      await serialized(async () => {
        const items: Record<string, unknown> = { [ROLLOVER_KEY]: today };
        if (added.length > 0) {
          const cur = await readBanners();
          const ids = new Set(cur.map((b) => b.id));
          items[BANNERS_KEY] = [...cur, ...added.filter((b) => !ids.has(b.id))].slice(-MAX_BANNERS);
        }
        await area.set(items);
      });
      return added;
    } catch (e) {
      log('LangCoach: daily rollover failed', e);
      return [];
    }
  }

  async function snapshot(): Promise<Snapshot> {
    const now0 = clock();
    if ((await area.get(ROLLOVER_KEY))[ROLLOVER_KEY] !== toLocalDate(now0)) await rollover();
    const [state, lc, banners] = await Promise.all([ensurePlan(), area.get(LAST_CAPTURE_KEY), readBanners()]);
    // Everything below is computed from this one load (Coach.today/progress would each load and validate again).
    const now = clock();
    const date = toLocalDate(now);
    const plan = state.plans[isoWeek(now)] ?? null;
    const p = progressOf(state, now);
    return {
      profile: state.profile,
      today: state.profile
        ? { date, tasks: plan ? plan.tasks.filter((t) => t.date === date) : [], planExists: plan !== null }
        : null,
      plan,
      progress: {
        streak: p.streak,
        totalXp: p.totalXp,
        weekly: p.weekly,
        dueCount: p.dueCount,
        todayXp: p.todayXp,
        dailyGoalXp: p.dailyGoalXp,
        streakFreezes: p.streakFreezes,
        weekXp: p.weekXp,
      },
      dueCount: p.dueCount,
      lastCapture: (lc[LAST_CAPTURE_KEY] as LastCapture | undefined) ?? null,
      banners,
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
    setProfile: (m) =>
      // With a theme, the plan is created in the same transaction: no ensurePlan race in onboarding.
      coach.setProfile(m.profile, m.theme !== undefined ? { theme: m.theme } : {}),
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
    setNativeTranslations: (m) => coach.setNativeTranslations(m.entries),
    getPracticeCards: async (m) => {
      const state = await store.load();
      const now = clock();
      const rank = (c: State['cards'][number]) => (isDue(c.srs, now) ? (c.srs.reps > 0 ? 0 : 1) : 2);
      return state.cards
        .map((c, i) => ({ c, i, r: rank(c) }))
        .sort((a, b) => a.r - b.r || (a.r === 0 ? Date.parse(a.c.srs.due) - Date.parse(b.c.srs.due) : 0) || a.i - b.i)
        .slice(0, m.limit ?? DEFAULT_PRACTICE_CARDS)
        .map((x) => x.c);
    },
    recordPractice: (m) => coach.recordPractice({ sessionId: m.sessionId, results: m.results }),
    dismissBanner: (m) =>
      serialized(async () => {
        const cur = await readBanners();
        await area.set({ [BANNERS_KEY]: cur.filter((b) => b.id !== m.id) });
        return null;
      }),
  };

  return {
    /** Applies streak freezes for today and queues one-time banners. Never throws. */
    rollover,
    /** Creates this week's plan if a profile exists and the week has none (startup, alarms). Never throws. */
    async ensurePlan(): Promise<void> {
      try {
        await ensurePlan();
      } catch (e) {
        log('LangCoach: weekly plan check failed', e);
      }
    },
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
