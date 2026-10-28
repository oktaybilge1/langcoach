import { beforeEach, describe, expect, test } from 'vitest';
import { Coach } from '../src/coach.js';
import { addDays, isoWeek, toLocalDate } from '../src/dates.js';
import { MemoryStore } from '../src/store.js';
import { progressOf } from '../src/summary.js';
import type { State } from '../src/types.js';

let now = new Date(2026, 9, 22, 10, 0); // Thursday, local time
const profile = {
  nativeLanguage: 'Turkish',
  targetLanguage: 'Spanish',
  level: 'A2' as const,
  goal: 'travel',
  minutesPerDay: 20,
  daysPerWeek: 7,
};
const lesson = (...terms: string[]) => ({
  kind: 'tiny_lesson' as const,
  situation: 'cafe',
  items: terms.map((term) => ({ term, translation: `${term}-en`, example: '' })),
});

let store: MemoryStore;
let coach: Coach;
let ids: string[];
beforeEach(async () => {
  now = new Date(2026, 9, 22, 10, 0);
  store = new MemoryStore();
  let n = 0;
  coach = new Coach(store, () => now, () => `id${++n}`);
  ids = (await coach.saveLesson(lesson('uno', 'dos', 'tres', 'cuatro'))).newCardIds;
});
const state = () => coach.exportData();

describe('recordPractice perfect rule (every card ends correct)', () => {
  test('a hard outcome is not perfect and earns no perfect bonus', async () => {
    const r = await coach.recordPractice({
      sessionId: 'h',
      results: [
        { cardId: ids[0]!, outcome: 'correct' },
        { cardId: ids[1]!, outcome: 'hard' },
      ],
    });
    expect(r).toEqual({ xp: 1 + 5, correct: 1, total: 2, perfect: false });
  });

  test('all correct is perfect (+5 bonus), and the stored session reports perfect again', async () => {
    const input = {
      sessionId: 'p',
      results: [
        { cardId: ids[0]!, outcome: 'correct' as const },
        { cardId: ids[1]!, outcome: 'correct' as const },
      ],
    };
    const r = await coach.recordPractice(input);
    expect(r).toEqual({ xp: 2 + 5 + 5, correct: 2, total: 2, perfect: true });
    expect(await coach.recordPractice(input)).toEqual(r);
  });

  test("a card's final outcome decides: wrong then correct for the same card is perfect", async () => {
    const r = await coach.recordPractice({
      sessionId: 'f',
      results: [
        { cardId: ids[0]!, outcome: 'wrong' },
        { cardId: ids[0]!, outcome: 'correct' },
      ],
    });
    expect(r.perfect).toBe(true);
  });

  test('replayed hard session is still not perfect', async () => {
    const input = { sessionId: 'h2', results: [{ cardId: ids[0]!, outcome: 'hard' as const }] };
    const r = await coach.recordPractice(input);
    expect(r.perfect).toBe(false);
    expect(await coach.recordPractice(input)).toEqual(r);
  });
});

describe('undoLesson takes back the XP its capture earned', () => {
  test('unplanned: log entry for that lesson removed, other XP kept', async () => {
    await coach.autoComplete('review', { cardsReviewed: 2 }); // unrelated XP
    const r = await coach.saveLesson(lesson('cinco'));
    await coach.autoComplete('tiny_lesson', { lessonId: r.lesson.id });
    expect((await coach.progress()).totalXp).toBe(12 + 20);
    const u = await coach.undoLesson(r.lesson.id);
    expect(u.xpRemoved).toBe(20);
    const s = await state();
    expect(s.log).toHaveLength(1);
    expect((await coach.progress()).totalXp).toBe(12);
  });

  test('planned: task returns to todo; capture → undo → capture awards once', async () => {
    await coach.setProfile(profile);
    await coach.weekPlan('food');
    const s0 = await state();
    const date = toLocalDate(now);
    const plan = s0.plans[isoWeek(now)]!;
    if (!plan.tasks.some((t) => t.date === date && t.type === 'tiny_lesson' && t.status === 'todo')) {
      plan.tasks.push({ id: 'tl', date, type: 'tiny_lesson', minutes: 10, status: 'todo' });
      await store.save(s0);
    }
    const a = await coach.saveLesson(lesson('cinco'));
    const c1 = await coach.autoComplete('tiny_lesson', { lessonId: a.lesson.id });
    expect(c1.task).not.toBeNull();
    const taskId = c1.task!.id;

    await coach.undoLesson(a.lesson.id);
    let s = await state();
    const t = s.plans[isoWeek(now)]!.tasks.find((x) => x.id === taskId)!;
    expect(t.status).toBe('todo');
    expect(t.completedAt).toBeUndefined();
    expect(t.lessonId).toBeUndefined();
    expect(s.log).toEqual([]);

    const b = await coach.saveLesson(lesson('cinco'));
    const c2 = await coach.autoComplete('tiny_lesson', { lessonId: b.lesson.id });
    expect(c2.task?.id).toBe(taskId);
    s = await state();
    expect(s.log).toHaveLength(1);
    expect((await coach.progress()).totalXp).toBe(20);
  });

  test('reviewed cards stay; practice XP for them stays', async () => {
    const r = await coach.saveLesson(lesson('cinco', 'seis'));
    await coach.autoComplete('tiny_lesson', { lessonId: r.lesson.id });
    await coach.recordPractice({ sessionId: 'x', results: [{ cardId: r.newCardIds[0]!, outcome: 'correct' }] });
    const u = await coach.undoLesson(r.lesson.id);
    expect(u.removedCards).toBe(1);
    const s = await state();
    expect(s.cards.some((c) => c.id === r.newCardIds[0])).toBe(true);
    expect(s.log.map((e) => e.taskId)).toEqual(['practice:x']);
  });

  test('log entries of another lesson are untouched', async () => {
    const a = await coach.saveLesson(lesson('cinco'));
    const b = await coach.saveLesson(lesson('seis'));
    await coach.autoComplete('tiny_lesson', { lessonId: a.lesson.id });
    await coach.autoComplete('tiny_lesson', { lessonId: b.lesson.id });
    await coach.undoLesson(a.lesson.id);
    expect((await state()).log.map((e) => e.lessonId)).toEqual([b.lesson.id]);
  });
});

describe('progressOf: one source of truth for progress numbers', () => {
  test('matches Coach.progress() on the same state', async () => {
    await coach.setProfile({ ...profile, dailyGoalXp: 30 });
    now = new Date(2026, 9, 20, 9, 0);
    await coach.recordPractice({ sessionId: 'a', results: [{ cardId: ids[0]!, outcome: 'correct' }] });
    now = new Date(2026, 9, 22, 9, 0);
    await coach.markMastered(ids[1]!);
    const s = await state();
    s.freezeUsedDates = ['2026-10-21'];
    s.streakFreezes = 1;
    await store.save(s);
    const p = await coach.progress();
    const { profile: _p, ...rest } = p;
    expect(progressOf(await state(), now)).toEqual(rest);
    expect(rest.streak).toBe(3); // 20 (practice), 21 (freeze), 22 (mastered)
    expect(rest.todayXp).toBe(2);
    expect(rest.dailyGoalXp).toBe(30);
    expect(rest.streakFreezes).toBe(1);
    expect(rest.weekXp).toHaveLength(7);
    expect(rest.weekXp[0]!.date).toBe(addDays('2026-10-22', -6));
  });

  test('empty state', () => {
    const empty: State = { version: 1, profile: null, plans: {}, lessons: [], cards: [], log: [] };
    expect(progressOf(empty, now)).toMatchObject({
      streak: 0,
      totalXp: 0,
      todayXp: 0,
      dailyGoalXp: 20,
      streakFreezes: 0,
      dueCount: 0,
      weekly: { done: 0, planned: 0 },
    });
  });
});

describe('setProfile with a theme creates the week plan atomically', () => {
  test('profile and plan land in the same save, with the chosen theme', async () => {
    const saves: State[] = [];
    const origSave = store.save.bind(store);
    store.save = async (s: State) => {
      saves.push(structuredClone(s));
      return origSave(s);
    };
    await coach.setProfile(profile, { theme: 'ordering tapas' });
    expect(saves).toHaveLength(1);
    expect(saves[0]!.profile).not.toBeNull();
    expect(saves[0]!.plans[isoWeek(now)]!.theme).toBe('ordering tapas');
  });

  test('an existing week plan is kept (no second plan, theme unchanged)', async () => {
    await coach.setProfile(profile);
    await coach.weekPlan('first');
    await coach.setProfile(profile, { theme: 'second' });
    expect((await state()).plans[isoWeek(now)]!.theme).toBe('first');
  });

  test('a blank theme is rejected before anything is saved', async () => {
    await expect(coach.setProfile(profile, { theme: ' ' })).rejects.toThrow(/theme/);
    expect((await state()).profile).toBeNull();
  });
});

describe('recordPractice stores perfect and match games on the session (achievements)', () => {
  test('perfect flag and matchGames are kept; matchGames is validated', async () => {
    await coach.recordPractice({
      sessionId: 'm',
      results: [{ cardId: ids[0]!, outcome: 'correct' }],
      matchGames: 1,
    });
    await coach.recordPractice({ sessionId: 'n', results: [{ cardId: ids[1]!, outcome: 'hard' }] });
    const s = await state();
    expect(s.sessions!.map((x) => [x.id, x.perfect, x.matchGames])).toEqual([
      ['m', true, 1],
      ['n', false, undefined],
    ]);
    await expect(
      coach.recordPractice({ sessionId: 'o', results: [{ cardId: ids[0]!, outcome: 'correct' }], matchGames: -1 }),
    ).rejects.toThrow(/matchGames/);
  });
});
