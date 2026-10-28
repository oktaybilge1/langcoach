import type {
  PlanTask,
  PracticeResult,
  PracticeSummary,
  Profile,
  Rating,
  ReviewCard,
  State,
  WeekPlan,
} from '@langcoach/core/browser';
import type { CaptureKind } from '../lib/parse';

export type ProfileInput = Omit<Profile, 'createdAt'>;

export interface Settings {
  autoSave: boolean;
  /** Local "HH:MM" or null for no reminder. */
  reminderTime: string | null;
  /** UI language code, or 'auto' to follow the browser. */
  uiLanguage: string;
  hasCamera: boolean;
  /** Target language (LLL API name) seen in the first capture before onboarding; prefills onboarding. */
  pendingTargetLanguage?: string;
  /** Show the on-device native translation under LLL's own meanings on the lesson page. */
  showNativeOnPage: boolean;
  /** Translator pairs ("en:tr") whose "can't translate on-device" note the learner dismissed (max 20). */
  dismissedNativePairs?: string[];
  /** Short practice sound effects (Web Audio tones). */
  soundEffects: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  autoSave: true,
  reminderTime: null,
  uiLanguage: 'auto',
  hasCamera: false,
  showNativeOnPage: true,
  soundEffects: true,
};

/** Persisted marker of the most recent saved capture (key `langcoach:lastCapture`); Undo is checked against it. */
export interface LastCapture {
  lessonIds: string[];
  newCards: number;
  duplicates: number;
  /** ISO time of the capture. */
  at: string;
  tabId: number | null;
}

export interface Snapshot {
  profile: Profile | null;
  today: { date: string; tasks: PlanTask[]; planExists: boolean } | null;
  plan: WeekPlan | null;
  progress: {
    streak: number;
    totalXp: number;
    weekly: { done: number; planned: number };
    dueCount: number;
    /** XP earned today and the learner's daily goal (for the goal ring). */
    todayXp?: number;
    dailyGoalXp?: number;
    /** Streak freezes held (0..2). */
    streakFreezes?: number;
    /** XP of the last 7 local days, oldest first, ending today. */
    weekXp?: { date: string; xp: number }[];
  };
  dueCount: number;
  lastCapture: LastCapture | null;
  /** One-time notices from the daily rollover, shown until dismissed. */
  banners?: Banner[];
  /** Full learner state for Progress/Achievements/Today grammar display in the side panel. */
  state?: State;
}

/** One-time rollover notice: a freeze protected `date`, or `count` freezes were earned. */
export type Banner =
  | { id: string; kind: 'freezeUsed'; date: string }
  | { id: string; kind: 'freezeEarned'; count: number };

/** Translator pair (BCP-47 base codes) plus whether the page overlay is on; absent = translation off. */
export interface NativePair {
  source: string;
  target: string;
  overlay: boolean;
}

/** Cards of a saved capture (new and already-known), for capture-time translation in the content script. */
export interface NativeCaptureHint extends NativePair {
  items: { cardId: string; term: string; meaning: string; native?: string }[];
}

/** Outcome of a `capture` message (null data = unknown shape, ignored). */
export type CaptureResult =
  | {
      status: 'saved';
      lessonIds: string[];
      newCards: number;
      duplicates: number;
      xp: number;
      native?: NativeCaptureHint;
    }
  /** autoSave is off: nothing saved; the page may re-send the capture with `force: true`. */
  | { status: 'pending'; count: number }
  /** Grammar topics attached to their lesson or held until the lesson arrives; no toast. */
  | { status: 'grammar'; native?: NativePair & { examples: string[] } };

/** Background → content script (chrome.tabs.sendMessage), e.g. after a context-menu save. */
export interface ToastMessage {
  type: 'toast';
  variant: 'manual' | 'already';
}

/** Request payload and response data for every message the background handles. */
export interface MessageMap {
  capture: {
    request: { kind: CaptureKind; request: unknown; response: unknown; pageUrl: string; force?: boolean };
    response: CaptureResult | null;
  };
  undo: { request: { lessonIds: string[] }; response: { removedCards: number } };
  openPanel: { request: Record<never, never>; response: null };
  getSnapshot: { request: Record<never, never>; response: Snapshot };
  /** With `theme` (onboarding), this week's plan is created with it in the same transaction. */
  setProfile: { request: { profile: ProfileInput; theme?: string }; response: Profile };
  createPlan: { request: { theme: string }; response: WeekPlan };
  completeReview: {
    request: { cardsReviewed: number };
    response: { task: PlanTask | null; xpAwarded: number };
  };
  getDue: { request: { limit: number }; response: ReviewCard[] };
  review: { request: { cardId: string; rating: Rating }; response: ReviewCard };
  updateCard: {
    request: { cardId: string; patch: { translation?: string; example?: string } };
    response: ReviewCard;
  };
  saveManual: {
    request: { term: string; translation?: string; example?: string; pronunciation?: string };
    response: { card: ReviewCard | null; duplicate: boolean };
  };
  exportData: { request: Record<never, never>; response: { json: string } };
  importData: { request: { json: string }; response: { lessons: number; cards: number } };
  reset: { request: Record<never, never>; response: null };
  getSettings: { request: Record<never, never>; response: Settings };
  setSettings: { request: { settings: Partial<Settings> }; response: Settings };
  setNativeTranslations: {
    request: { entries: { cardId: string; text: string }[] };
    response: { updated: number };
  };
  /** The deck for a practice session: due cards first, then new, then the rest (default limit 200). */
  getPracticeCards: { request: { limit?: number }; response: ReviewCard[] };
  /** Records a finished practice session once (idempotent by sessionId). */
  recordPractice: {
    request: { sessionId: string; results: PracticeResult[] };
    response: PracticeSummary;
  };
  /** Hides a rollover banner for good. */
  dismissBanner: { request: { id: string }; response: null };
}

export type MessageType = keyof MessageMap;

/** Discriminated union of all requests: `{ type: 'review', cardId, rating }`. */
export type Message = {
  [K in MessageType]: { type: K } & MessageMap[K]['request'];
}[MessageType];

export type ResponseOf<K extends MessageType> = MessageMap[K]['response'];

export interface ErrorInfo {
  name: string;
  message: string;
  /** Machine-readable class: 'forbidden' (sender policy) or 'invalid' (bad payload / data). */
  code?: 'forbidden' | 'invalid';
  preservedAt?: string;
}

export type Response<T> = { ok: true; data: T } | { ok: false; error: ErrorInfo };

export const MESSAGE_TYPES: readonly MessageType[] = [
  'capture',
  'undo',
  'openPanel',
  'getSnapshot',
  'setProfile',
  'createPlan',
  'completeReview',
  'getDue',
  'review',
  'updateCard',
  'saveManual',
  'exportData',
  'importData',
  'reset',
  'getSettings',
  'setSettings',
  'setNativeTranslations',
  'getPracticeCards',
  'recordPractice',
  'dismissBanner',
];

export const isMessage = (v: unknown): v is Message =>
  typeof v === 'object' && v !== null && MESSAGE_TYPES.includes((v as { type: MessageType }).type);

/** Typed request helper for extension pages (side panel, content scripts). */
export async function send<K extends MessageType>(
  msg: { type: K } & MessageMap[K]['request'],
): Promise<ResponseOf<K>> {
  const res = (await chrome.runtime.sendMessage(msg)) as Response<ResponseOf<K>> | undefined;
  if (!res) throw new Error('No response from the background worker');
  if (!res.ok) throw Object.assign(new Error(res.error.message), res.error);
  return res.data;
}
