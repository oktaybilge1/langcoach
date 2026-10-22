import { addDays, isoWeek, toLocalDate } from './dates.js';
import { InvalidDataError, NoProfileError, NotFoundError, ThemeRequiredError } from './errors.js';
import { buildWeekPlan } from './planner.js';
import { weeklyGoal, xpFor } from './progress.js';
import { parseState } from './schema.js';
import { isDue, newSrs, reviewSrs, type Rating } from './srs.js';
import type { Store } from './store-memory.js';
import { applyFreezes, computeStreak, dailyXp } from './streak.js';
import {
  DAILY_GOALS,
  DEFAULT_DAILY_GOAL,
  emptyState,
  type Cefr,
  type DailyGoalXp,
  type GrammarPoint,
  type Lesson,
  type LessonItem,
  type LessonSource,
  type PlanTask,
  type PracticeSession,
  type Profile,
  type ReviewCard,
  type State,
  type TaskType,
  type WeekPlan,
} from './types.js';

const LEVELS: readonly Cefr[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const KINDS = ['tiny_lesson', 'slang_hang', 'word_cam'] as const;
const TASK_TYPES: readonly TaskType[] = ['tiny_lesson', 'slang_hang', 'review', 'quiz', 'word_cam'];
const MANUAL_SITUATION = 'Saved manually';
const OUTCOMES = ['correct', 'hard', 'wrong'] as const;
const PRACTICE_BONUS = 5;
const PERFECT_BONUS = 5;
const MASTERED_XP = 2;
const KEEP_SESSIONS = 500;
const MAX_TRANSLATIONS = 500;
const MAX_TRANSLATION_CHARS = 500;

export type PracticeOutcome = (typeof OUTCOMES)[number];
const OUTCOME_RATING: Record<PracticeOutcome, Rating> = { correct: 3, hard: 2, wrong: 1 };

export interface PracticeResult {
  cardId: string;
  outcome: PracticeOutcome;
}

export interface PracticeSummary {
  xp: number;
  correct: number;
  total: number;
  perfect: boolean;
}

const blank = (v: unknown) => typeof v !== 'string' || v.trim() === '';
const dupKey = (term: string) => term.trim().toLocaleLowerCase();

function requireProfile(s: State): Profile {
  if (!s.profile) throw new NoProfileError();
  return s.profile;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const optStr = (v: unknown) => v === undefined || typeof v === 'string';

function validateGrammar(g: unknown): void {
  if (!Array.isArray(g)) throw new InvalidDataError('grammar must be an array');
  g.forEach((p, i) => {
    if (!isObj(p)) throw new InvalidDataError(`grammar[${i}] must be an object`);
    if (typeof p.topic !== 'string') throw new InvalidDataError(`grammar[${i}].topic must be a string`);
    if (typeof p.description !== 'string') throw new InvalidDataError(`grammar[${i}].description must be a string`);
    if (!Array.isArray(p.examples)) throw new InvalidDataError(`grammar[${i}].examples must be an array`);
    p.examples.forEach((e: unknown, j: number) => {
      const at = `grammar[${i}].examples[${j}]`;
      if (!isObj(e)) throw new InvalidDataError(`${at} must be an object`);
      if (typeof e.sentence !== 'string') throw new InvalidDataError(`${at}.sentence must be a string`);
      if (typeof e.translation !== 'string') throw new InvalidDataError(`${at}.translation must be a string`);
      if (!optStr(e.transliteration)) throw new InvalidDataError(`${at}.transliteration must be a string`);
      if (!optStr(e.explanation)) throw new InvalidDataError(`${at}.explanation must be a string`);
    });
  });
}

function validateSource(s: unknown): void {
  if (!isObj(s)) throw new InvalidDataError('source must be an object');
  if (s.app !== 'lll') throw new InvalidDataError("source.app must be 'lll'");
  if (typeof s.targetLanguage !== 'string') throw new InvalidDataError('source.targetLanguage must be a string');
  if (typeof s.sourceLanguage !== 'string') throw new InvalidDataError('source.sourceLanguage must be a string');
  if (!optStr(s.purpose)) throw new InvalidDataError('source.purpose must be a string');
}

function requireId(v: unknown, field: string): void {
  if (typeof v !== 'string' || v === '') throw new InvalidDataError(`${field} must be a non-empty string`);
}

const goalOf = (s: State): number => s.profile?.dailyGoalXp ?? DEFAULT_DAILY_GOAL;

function intIn(v: unknown, min: number, max: number): boolean {
  return typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
}

export class Coach {
  constructor(
    private readonly store: Store,
    private readonly clock: () => Date = () => new Date(),
    private readonly newId: () => string = () => globalThis.crypto.randomUUID(),
  ) {}

  async setProfile(input: Omit<Profile, 'createdAt'>): Promise<Profile> {
    if (input.dailyGoalXp !== undefined && !DAILY_GOALS.includes(input.dailyGoalXp)) {
      throw new InvalidDataError(`dailyGoalXp must be one of ${DAILY_GOALS.join(', ')}`);
    }
    if (blank(input.nativeLanguage)) throw new InvalidDataError('nativeLanguage must be a non-empty string');
    if (blank(input.targetLanguage)) throw new InvalidDataError('targetLanguage must be a non-empty string');
    if (!LEVELS.includes(input.level)) {
      throw new InvalidDataError(`level must be one of ${LEVELS.join(', ')}`);
    }
    if (typeof input.goal !== 'string') throw new InvalidDataError('goal must be a string');
    if (!intIn(input.minutesPerDay, 5, 180)) {
      throw new InvalidDataError('minutesPerDay must be an integer from 5 to 180');
    }
    if (!intIn(input.daysPerWeek, 1, 7)) {
      throw new InvalidDataError('daysPerWeek must be an integer from 1 to 7');
    }
    return this.store.transaction((s) => {
      const profile: Profile = {
        nativeLanguage: input.nativeLanguage,
        targetLanguage: input.targetLanguage,
        level: input.level,
        goal: input.goal,
        minutesPerDay: input.minutesPerDay,
        daysPerWeek: input.daysPerWeek,
        createdAt: s.profile?.createdAt ?? this.clock().toISOString(),
      };
      // Omitted → keep the current goal (MCP set_profile does not send it).
      const goal: DailyGoalXp | undefined = input.dailyGoalXp ?? s.profile?.dailyGoalXp;
      if (goal !== undefined) profile.dailyGoalXp = goal;
      s.profile = profile;
      return { state: s, result: profile };
    });
  }

  async weekPlan(theme?: string): Promise<WeekPlan> {
    if (theme !== undefined && typeof theme !== 'string') throw new InvalidDataError('theme must be a string');
    return this.store.transaction((s) => {
      const profile = requireProfile(s);
      const now = this.clock();
      const week = isoWeek(now);
      const existing = s.plans[week];
      if (existing) return { result: existing };
      if (theme === undefined || theme.trim() === '') throw new ThemeRequiredError();
      const plan = buildWeekPlan(profile, week, theme, this.newId, toLocalDate(now));
      s.plans[week] = plan;
      return { state: s, result: plan };
    });
  }

  async today(): Promise<{ date: string; tasks: PlanTask[]; planExists: boolean }> {
    const s = await this.store.load();
    requireProfile(s);
    const now = this.clock();
    const date = toLocalDate(now);
    const plan = s.plans[isoWeek(now)];
    if (!plan) return { date, tasks: [], planExists: false };
    return { date, tasks: plan.tasks.filter((t) => t.date === date), planExists: true };
  }

  async saveLesson(input: {
    kind: 'tiny_lesson' | 'slang_hang' | 'word_cam';
    situation: string;
    items: LessonItem[];
    grammar?: GrammarPoint[];
    source?: LessonSource;
  }): Promise<{ lesson: Lesson; newCards: number; duplicates: string[]; newCardIds: string[] }> {
    if (!KINDS.includes(input.kind)) throw new InvalidDataError(`kind must be one of ${KINDS.join(', ')}`);
    if (blank(input.situation)) throw new InvalidDataError('situation must be a non-empty string');
    if (!Array.isArray(input.items) || input.items.length < 1 || input.items.length > 50) {
      throw new InvalidDataError('items must contain between 1 and 50 entries');
    }
    input.items.forEach((it, i) => {
      if (!it || blank(it.term)) throw new InvalidDataError(`items[${i}].term must be a non-empty string`);
      if (blank(it.translation)) throw new InvalidDataError(`items[${i}].translation must be a non-empty string`);
      if (typeof it.example !== 'string') throw new InvalidDataError(`items[${i}].example must be a string`);
      if (it.note !== undefined && typeof it.note !== 'string') {
        throw new InvalidDataError(`items[${i}].note must be a string`);
      }
      if (it.pronunciation !== undefined && typeof it.pronunciation !== 'string') {
        throw new InvalidDataError(`items[${i}].pronunciation must be a string`);
      }
    });
    if (input.grammar !== undefined) validateGrammar(input.grammar);
    if (input.source !== undefined) validateSource(input.source);

    return this.store.transaction((s) => {
      const now = this.clock();
      const lesson: Lesson = {
        id: this.newId(),
        kind: input.kind,
        situation: input.situation,
        items: input.items.map((it) => {
          const item: LessonItem = { term: it.term, translation: it.translation, example: it.example };
          if (it.note !== undefined) item.note = it.note;
          if (it.pronunciation !== undefined) item.pronunciation = it.pronunciation;
          return item;
        }),
        createdAt: now.toISOString(),
      };
      if (input.grammar !== undefined) lesson.grammar = input.grammar;
      if (input.source !== undefined) lesson.source = input.source;
      const seen = new Set(s.cards.map((c) => dupKey(c.term)));
      const duplicates: string[] = [];
      const newCardIds: string[] = [];
      for (const it of lesson.items) {
        const key = dupKey(it.term);
        if (seen.has(key)) {
          duplicates.push(it.term);
          continue;
        }
        seen.add(key);
        const card: ReviewCard = {
          id: this.newId(),
          lessonId: lesson.id,
          term: it.term,
          translation: it.translation,
          example: it.example,
          srs: newSrs(now),
        };
        if (it.pronunciation !== undefined) card.pronunciation = it.pronunciation;
        s.cards.push(card);
        newCardIds.push(card.id);
      }
      s.lessons.push(lesson);
      return { state: s, result: { lesson, newCards: newCardIds.length, duplicates, newCardIds } };
    });
  }

  /** Remove a lesson and its never-reviewed cards; reviewed cards are kept. */
  async undoLesson(lessonId: string): Promise<{ removedCards: number }> {
    return this.store.transaction((s) => {
      const idx = s.lessons.findIndex((l) => l.id === lessonId);
      if (idx < 0) throw new NotFoundError('Lesson', lessonId);
      const before = s.cards.length;
      s.cards = s.cards.filter((c) => !(c.lessonId === lessonId && c.srs.reps === 0));
      s.lessons.splice(idx, 1);
      return { state: s, result: { removedCards: before - s.cards.length } };
    });
  }

  /** Set (replace) the grammar topics of an existing lesson; used when grammar arrives separately from terms. */
  async attachGrammar(lessonId: string, grammar: GrammarPoint[]): Promise<Lesson> {
    validateGrammar(grammar);
    return this.store.transaction((s) => {
      const lesson = s.lessons.find((l) => l.id === lessonId);
      if (!lesson) throw new NotFoundError('Lesson', lessonId);
      lesson.grammar = grammar;
      return { state: s, result: lesson };
    });
  }

  async saveManualCard(input: {
    term: string;
    translation?: string;
    example?: string;
    pronunciation?: string;
  }): Promise<{ card: ReviewCard | null; duplicate: boolean }> {
    if (!input || blank(input.term)) throw new InvalidDataError('term must be a non-empty string');
    for (const f of ['translation', 'example', 'pronunciation'] as const) {
      if (input[f] !== undefined && typeof input[f] !== 'string') throw new InvalidDataError(`${f} must be a string`);
    }
    return this.store.transaction<{ card: ReviewCard | null; duplicate: boolean }>((s) => {
      if (s.cards.some((c) => dupKey(c.term) === dupKey(input.term))) {
        return { result: { card: null, duplicate: true } };
      }
      const now = this.clock();
      const day = toLocalDate(now);
      let lesson = s.lessons.find(
        (l) =>
          l.kind === 'tiny_lesson' && l.situation === MANUAL_SITUATION && toLocalDate(new Date(l.createdAt)) === day,
      );
      if (!lesson) {
        lesson = {
          id: this.newId(),
          kind: 'tiny_lesson',
          situation: MANUAL_SITUATION,
          items: [],
          createdAt: now.toISOString(),
        };
        s.lessons.push(lesson);
      }
      const item: LessonItem = { term: input.term, translation: input.translation ?? '', example: input.example ?? '' };
      if (input.pronunciation !== undefined) item.pronunciation = input.pronunciation;
      lesson.items.push(item);
      const card: ReviewCard = {
        id: this.newId(),
        lessonId: lesson.id,
        term: item.term,
        translation: item.translation,
        example: item.example,
        srs: newSrs(now),
      };
      if (item.pronunciation !== undefined) card.pronunciation = item.pronunciation;
      s.cards.push(card);
      return { state: s, result: { card, duplicate: false } };
    });
  }

  async updateCard(cardId: string, patch: { translation?: string; example?: string }): Promise<ReviewCard> {
    if (!isObj(patch)) throw new InvalidDataError('patch must be an object');
    for (const f of ['translation', 'example'] as const) {
      if (patch?.[f] !== undefined && typeof patch[f] !== 'string') throw new InvalidDataError(`${f} must be a string`);
    }
    return this.store.transaction((s) => {
      const card = s.cards.find((c) => c.id === cardId);
      if (!card) throw new NotFoundError('Card', cardId);
      if (patch.translation !== undefined) card.translation = patch.translation;
      if (patch.example !== undefined) card.example = patch.example;
      return { state: s, result: card };
    });
  }

  /**
   * Complete today's first matching todo task, or log unplanned practice (XP + streak).
   * Works without a profile (then it only logs).
   */
  async autoComplete(
    type: TaskType,
    opts: { lessonId?: string; cardsReviewed?: number } = {},
  ): Promise<{ task: PlanTask | null; xpAwarded: number }> {
    if (!TASK_TYPES.includes(type)) throw new InvalidDataError(`type must be one of ${TASK_TYPES.join(', ')}`);
    const cardsReviewed = opts.cardsReviewed;
    if (cardsReviewed !== undefined && !intIn(cardsReviewed, 0, Number.MAX_SAFE_INTEGER)) {
      throw new InvalidDataError('cardsReviewed must be an integer >= 0');
    }
    if (opts.lessonId !== undefined && typeof opts.lessonId !== 'string') {
      throw new InvalidDataError('lessonId must be a string');
    }
    return this.store.transaction<{ task: PlanTask | null; xpAwarded: number }>((s) => {
      const now = this.clock();
      const date = toLocalDate(now);
      const xp = xpFor(type, cardsReviewed);
      const task = s.profile
        ? s.plans[isoWeek(now)]?.tasks.find((t) => t.type === type && t.date === date && t.status === 'todo')
        : undefined;
      if (task) {
        task.status = 'done';
        task.completedAt = now.toISOString();
        if (opts.lessonId !== undefined) task.lessonId = opts.lessonId;
        s.log.push({ at: now.toISOString(), date, taskId: task.id, type, xp });
        return { state: s, result: { task, xpAwarded: xp } };
      }
      s.log.push({ at: now.toISOString(), date, taskId: 'unplanned', type, xp });
      return { state: s, result: { task: null, xpAwarded: xp } };
    });
  }

  /** Reset everything. The store backs up the previous data file first. */
  async deleteAll(): Promise<void> {
    await this.store.replace(emptyState());
  }

  async completeTask(
    taskId: string,
    opts: { lessonId?: string; cardsReviewed?: number } = {},
  ): Promise<{ task: PlanTask; xpAwarded: number; alreadyDone: boolean }> {
    const cardsReviewed = opts.cardsReviewed;
    if (cardsReviewed !== undefined && !intIn(cardsReviewed, 0, Number.MAX_SAFE_INTEGER)) {
      throw new InvalidDataError('cardsReviewed must be an integer >= 0');
    }
    if (opts.lessonId !== undefined && typeof opts.lessonId !== 'string') {
      throw new InvalidDataError('lessonId must be a string');
    }
    return this.store.transaction<{ task: PlanTask; xpAwarded: number; alreadyDone: boolean }>((s) => {
      requireProfile(s);
      let task: PlanTask | undefined;
      for (const plan of Object.values(s.plans)) {
        task = plan.tasks.find((t) => t.id === taskId);
        if (task) break;
      }
      if (!task) throw new NotFoundError('Task', taskId);
      if (task.status === 'done') return { result: { task, xpAwarded: 0, alreadyDone: true } };

      const now = this.clock();
      const xp = xpFor(task.type, cardsReviewed);
      task.status = 'done';
      task.completedAt = now.toISOString();
      if (opts.lessonId !== undefined) task.lessonId = opts.lessonId;
      s.log.push({ at: now.toISOString(), date: toLocalDate(now), taskId, type: task.type, xp });
      return { state: s, result: { task, xpAwarded: xp, alreadyDone: false } };
    });
  }

  async setFavorite(cardId: string, favorite: boolean): Promise<ReviewCard> {
    requireId(cardId, 'cardId');
    if (typeof favorite !== 'boolean') throw new InvalidDataError('favorite must be a boolean');
    return this.store.transaction((s) => {
      const card = s.cards.find((c) => c.id === cardId);
      if (!card) throw new NotFoundError('Card', cardId);
      card.favorite = favorite;
      return { state: s, result: card };
    });
  }

  /** Cache native-language meanings on cards. Unknown card ids are skipped. */
  async setNativeTranslations(entries: { cardId: string; text: string }[]): Promise<{ updated: number }> {
    if (!Array.isArray(entries) || entries.length > MAX_TRANSLATIONS) {
      throw new InvalidDataError(`entries must be an array of at most ${MAX_TRANSLATIONS} items`);
    }
    const clean = entries.map((e: unknown, i) => {
      if (!isObj(e)) throw new InvalidDataError(`entries[${i}] must be an object`);
      requireId(e.cardId, `entries[${i}].cardId`);
      const text = typeof e.text === 'string' ? e.text.trim() : '';
      if (text === '' || text.length > MAX_TRANSLATION_CHARS) {
        throw new InvalidDataError(
          `entries[${i}].text must be a non-empty string of at most ${MAX_TRANSLATION_CHARS} characters`,
        );
      }
      return { cardId: e.cardId as string, text };
    });
    if (clean.length === 0) return { updated: 0 };
    return this.store.transaction<{ updated: number }>((s) => {
      const byId = new Map(s.cards.map((c) => [c.id, c]));
      let updated = 0;
      for (const e of clean) {
        const card = byId.get(e.cardId);
        if (!card) continue;
        card.nativeTranslation = e.text;
        updated++;
      }
      return updated > 0 ? { state: s, result: { updated } } : { result: { updated } };
    });
  }

  /** "I know this": one FSRS Easy review and 2 XP, only the first time for a card. */
  async markMastered(cardId: string): Promise<{ xpAwarded: number }> {
    requireId(cardId, 'cardId');
    return this.store.transaction<{ xpAwarded: number }>((s) => {
      const card = s.cards.find((c) => c.id === cardId);
      if (!card) throw new NotFoundError('Card', cardId);
      const taskId = `mastered:${cardId}`;
      if (card.mastered === true || s.log.some((e) => e.taskId === taskId)) return { result: { xpAwarded: 0 } };
      const now = this.clock();
      card.srs = reviewSrs(card.srs, 4, now);
      card.mastered = true;
      s.log.push({ at: now.toISOString(), date: toLocalDate(now), taskId, type: 'review', xp: MASTERED_XP });
      return { state: s, result: { xpAwarded: MASTERED_XP } };
    });
  }

  /**
   * Record a finished practice session once (idempotent by sessionId): one FSRS review per
   * answered card (last outcome wins), one log entry carrying the session XP, and today's
   * review task marked done (without extra XP).
   */
  async recordPractice(input: { sessionId: string; results: PracticeResult[] }): Promise<PracticeSummary> {
    if (!isObj(input)) throw new InvalidDataError('input must be an object');
    const { sessionId, results } = input as { sessionId: unknown; results: unknown };
    if (typeof sessionId !== 'string' || sessionId.trim() === '' || sessionId.length > 100) {
      throw new InvalidDataError('sessionId must be a non-empty string of at most 100 characters');
    }
    if (!Array.isArray(results) || results.length < 1 || results.length > 50) {
      throw new InvalidDataError('results must contain between 1 and 50 entries');
    }
    results.forEach((r: unknown, i) => {
      if (!isObj(r)) throw new InvalidDataError(`results[${i}] must be an object`);
      requireId(r.cardId, `results[${i}].cardId`);
      if (!OUTCOMES.includes(r.outcome as PracticeOutcome)) {
        throw new InvalidDataError(`results[${i}].outcome must be one of ${OUTCOMES.join(', ')}`);
      }
    });
    const answers = results as PracticeResult[];
    const taskId = `practice:${sessionId}`;
    return this.store.transaction<PracticeSummary>((s) => {
      const prior = s.sessions?.find((x) => x.id === sessionId);
      if (prior) {
        const perfect = prior.exercises > 0 && prior.xp === prior.correct + PRACTICE_BONUS + PERFECT_BONUS;
        return { result: { xp: prior.xp, correct: prior.correct, total: prior.exercises, perfect } };
      }
      // Session record aged out of the 500 kept: the log entry still proves it was rewarded.
      const logged = s.log.find((e) => e.taskId === taskId);
      if (logged) return { result: { xp: logged.xp, correct: 0, total: 0, perfect: false } };

      const now = this.clock();
      const date = toLocalDate(now);
      const cards = new Map(s.cards.map((c) => [c.id, c]));
      const known = answers.filter((r) => cards.has(r.cardId));
      const total = known.length;
      const correct = known.filter((r) => r.outcome === 'correct').length;
      const perfect = total > 0 && known.every((r) => r.outcome !== 'wrong');
      const xp = total > 0 ? correct + PRACTICE_BONUS + (perfect ? PERFECT_BONUS : 0) : 0;

      const lastOutcome = new Map<string, PracticeOutcome>();
      for (const r of known) lastOutcome.set(r.cardId, r.outcome);
      for (const [id, outcome] of lastOutcome) {
        const card = cards.get(id)!;
        card.srs = reviewSrs(card.srs, OUTCOME_RATING[outcome], now);
      }

      if (xp > 0) s.log.push({ at: now.toISOString(), date, taskId, type: 'review', xp });
      const session: PracticeSession = { id: sessionId, at: now.toISOString(), date, exercises: total, correct, xp };
      s.sessions = [...(s.sessions ?? []), session].slice(-KEEP_SESSIONS);

      if (total > 0 && s.profile) {
        const task = s.plans[isoWeek(now)]?.tasks.find(
          (t) => t.type === 'review' && t.date === date && t.status === 'todo',
        );
        if (task) {
          task.status = 'done'; // the practice log entry above is the XP record
          task.completedAt = now.toISOString();
        }
      }
      return { state: s, result: { xp, correct, total, perfect } };
    });
  }

  /** Apply streak freezes for today: protect missed days, award freezes for 7-day milestones. */
  async rollover(): Promise<{ consumed: string[]; earned: number }> {
    return this.store.transaction<{ consumed: string[]; earned: number }>((s) => {
      const r = applyFreezes(s, toLocalDate(this.clock()));
      if (r.state === s) return { result: { consumed: [], earned: 0 } };
      return { state: r.state, result: { consumed: r.consumed, earned: r.earned } };
    });
  }

  async dueReviews(limit = 20): Promise<ReviewCard[]> {
    if (!intIn(limit, 1, Number.MAX_SAFE_INTEGER)) throw new InvalidDataError('limit must be a positive integer');
    const s = await this.store.load();
    requireProfile(s);
    const now = this.clock();
    return s.cards
      .filter((c) => isDue(c.srs, now))
      .sort((a, b) => new Date(a.srs.due).getTime() - new Date(b.srs.due).getTime())
      .slice(0, limit);
  }

  async submitReview(cardId: string, rating: Rating): Promise<ReviewCard> {
    return this.store.transaction((s) => {
      requireProfile(s);
      const card = s.cards.find((c) => c.id === cardId);
      if (!card) throw new NotFoundError('Card', cardId);
      card.srs = reviewSrs(card.srs, rating, this.clock());
      return { state: s, result: card };
    });
  }

  async progress(): Promise<{
    profile: Profile | null;
    streak: number;
    totalXp: number;
    weekly: { done: number; planned: number };
    dueCount: number;
    todayXp: number;
    dailyGoalXp: number;
    streakFreezes: number;
    weekXp: { date: string; xp: number }[];
  }> {
    const s = await this.store.load();
    const now = this.clock();
    const today = toLocalDate(now);
    // Persisted numbers only: rollover() is what applies and saves freezes.
    return {
      profile: s.profile,
      streak: computeStreak({ log: s.log, today, freezeUsedDates: s.freezeUsedDates ?? [] }),
      totalXp: s.log.reduce((sum, e) => sum + e.xp, 0),
      weekly: weeklyGoal(s.plans[isoWeek(now)]),
      dueCount: s.cards.filter((c) => isDue(c.srs, now)).length,
      todayXp: dailyXp(s.log, today),
      dailyGoalXp: goalOf(s),
      streakFreezes: s.streakFreezes ?? 0,
      weekXp: Array.from({ length: 7 }, (_, i) => {
        const date = addDays(today, i - 6);
        return { date, xp: dailyXp(s.log, date) };
      }),
    };
  }

  async exportData(): Promise<State> {
    return this.store.load();
  }

  async importData(raw: unknown): Promise<{ lessons: number; cards: number }> {
    const parsed = parseState(raw);
    // replace() never loads the current file, so a corrupt or invalid data.json can be restored over.
    await this.store.replace(parsed);
    return { lessons: parsed.lessons.length, cards: parsed.cards.length };
  }
}
