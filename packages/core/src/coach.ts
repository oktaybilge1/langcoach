import { isoWeek, toLocalDate } from './dates.js';
import { InvalidDataError, NoProfileError, NotFoundError, ThemeRequiredError } from './errors.js';
import { buildWeekPlan } from './planner.js';
import { streak, weeklyGoal, xpFor } from './progress.js';
import { parseState } from './schema.js';
import { isDue, newSrs, reviewSrs, type Rating } from './srs.js';
import type { Store } from './store-memory.js';
import {
  emptyState,
  type Cefr,
  type GrammarPoint,
  type Lesson,
  type LessonItem,
  type LessonSource,
  type PlanTask,
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

const blank = (v: unknown) => typeof v !== 'string' || v.trim() === '';
const dupKey = (term: string) => term.trim().toLocaleLowerCase();

function requireProfile(s: State): Profile {
  if (!s.profile) throw new NoProfileError();
  return s.profile;
}

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
    if (input.grammar !== undefined && !Array.isArray(input.grammar)) {
      throw new InvalidDataError('grammar must be an array');
    }
    if (input.source !== undefined && (input.source === null || typeof input.source !== 'object')) {
      throw new InvalidDataError('source must be an object');
    }

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
  }> {
    const s = await this.store.load();
    const now = this.clock();
    return {
      profile: s.profile,
      streak: streak(s.log, toLocalDate(now)),
      totalXp: s.log.reduce((sum, e) => sum + e.xp, 0),
      weekly: weeklyGoal(s.plans[isoWeek(now)]),
      dueCount: s.cards.filter((c) => isDue(c.srs, now)).length,
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
