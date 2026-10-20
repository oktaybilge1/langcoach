import { beforeEach, describe, expect, test } from 'vitest';
import { Coach } from '../src/coach.js';
import { InvalidDataError, NoProfileError, NotFoundError, ThemeRequiredError } from '../src/errors.js';
import { parseState } from '../src/schema.js';
import { MemoryStore } from '../src/store.js';
import type { Profile } from '../src/types.js';

const NOW = new Date(2026, 9, 20, 10, 0);
const profileInput = (over: Partial<Omit<Profile, 'createdAt'>> = {}): Omit<Profile, 'createdAt'> => ({
  nativeLanguage: 'English',
  targetLanguage: 'Spanish',
  level: 'A2',
  goal: 'travel',
  minutesPerDay: 20,
  daysPerWeek: 3,
  ...over,
});

let store: MemoryStore;
let coach: Coach;
beforeEach(() => {
  store = new MemoryStore();
  let n = 0;
  coach = new Coach(store, () => NOW, () => `id${++n}`);
});

const lesson = (...terms: string[]) => ({
  kind: 'tiny_lesson' as const,
  situation: 'cafe',
  items: terms.map((term) => ({ term, translation: 'tr', example: '' })),
});

describe('Coach', () => {
  test('methods needing a profile throw NoProfileError mentioning set_profile', async () => {
    const calls = [
      () => coach.weekPlan('x'),
      () => coach.today(),
      () => coach.saveLesson(lesson('a')),
      () => coach.completeTask('t'),
      () => coach.dueReviews(),
      () => coach.submitReview('c', 3),
    ];
    for (const c of calls) {
      await expect(c()).rejects.toBeInstanceOf(NoProfileError);
      await expect(c()).rejects.toThrow(/set_profile/);
    }
  });

  test('weekPlan theme handling', async () => {
    await coach.setProfile(profileInput());
    await expect(coach.weekPlan()).rejects.toBeInstanceOf(ThemeRequiredError);
    const p = await coach.weekPlan('food');
    expect(p.theme).toBe('food');
    expect(await coach.weekPlan()).toEqual(p);
    expect(await coach.weekPlan('other')).toEqual(p);
  });

  test('today without plan returns planExists false', async () => {
    await coach.setProfile(profileInput());
    expect(await coach.today()).toEqual({ date: '2026-10-20', tasks: [], planExists: false });
  });

  test('setProfile validation', async () => {
    for (const bad of [
      { daysPerWeek: 0 },
      { daysPerWeek: 8 },
      { minutesPerDay: 4 },
      { minutesPerDay: 181 },
      { level: 'Z9' as never },
      { targetLanguage: ' ' },
    ]) {
      await expect(coach.setProfile(profileInput(bad))).rejects.toBeInstanceOf(InvalidDataError);
    }
  });

  test('setProfile update keeps createdAt', async () => {
    const a = await coach.setProfile(profileInput());
    const later = new Coach(store, () => new Date(2026, 10, 1), () => 'x');
    const b = await later.setProfile(profileInput({ goal: 'work' }));
    expect(b.createdAt).toBe(a.createdAt);
    expect(b.goal).toBe('work');
  });

  test('saveLesson creates cards and skips duplicates', async () => {
    await coach.setProfile(profileInput());
    const r = await coach.saveLesson(lesson('  Hola ', 'hola', 'adios'));
    expect(r.newCards).toBe(2);
    expect(r.duplicates).toEqual(['hola']);
    expect(r.lesson.items).toHaveLength(3);
    const again = await coach.saveLesson(lesson('HOLA'));
    expect(again.newCards).toBe(0);
    expect(again.duplicates).toEqual(['HOLA']);
    expect((await coach.exportData()).cards).toHaveLength(2);
  });

  test('saveLesson validation', async () => {
    await coach.setProfile(profileInput());
    await expect(coach.saveLesson({ ...lesson('a'), situation: ' ' })).rejects.toBeInstanceOf(InvalidDataError);
    await expect(coach.saveLesson({ ...lesson('a'), kind: 'quiz' as never })).rejects.toBeInstanceOf(InvalidDataError);
    await expect(coach.saveLesson({ ...lesson(), items: [] })).rejects.toBeInstanceOf(InvalidDataError);
    await expect(
      coach.saveLesson(lesson(...Array.from({ length: 51 }, (_, i) => `t${i}`))),
    ).rejects.toBeInstanceOf(InvalidDataError);
    await expect(coach.saveLesson(lesson(''))).rejects.toBeInstanceOf(InvalidDataError);
    await expect(
      coach.saveLesson({ ...lesson('a'), items: [{ term: 'a', translation: '', example: '' }] }),
    ).rejects.toBeInstanceOf(InvalidDataError);
  });

  test('non-Latin terms round-trip unchanged', async () => {
    await coach.setProfile(profileInput());
    await coach.saveLesson(lesson('東京', 'مرحبا'));
    const s = await coach.exportData();
    expect(s.cards.map((c) => c.term)).toEqual(['東京', 'مرحبا']);
    expect(s.lessons[0]!.items.map((i) => i.term)).toEqual(['東京', 'مرحبا']);
  });

  test('completeTask awards XP once', async () => {
    await coach.setProfile(profileInput());
    const plan = await coach.weekPlan('food');
    const t = plan.tasks[0]!;
    const r = await coach.completeTask(t.id);
    expect(r.alreadyDone).toBe(false);
    expect(r.xpAwarded).toBe(20);
    expect(r.task.status).toBe('done');
    const r2 = await coach.completeTask(t.id);
    expect(r2.alreadyDone).toBe(true);
    expect(r2.xpAwarded).toBe(0);
    expect((await coach.exportData()).log).toHaveLength(1);
  });

  test('completeTask validates cardsReviewed and records lessonId', async () => {
    await coach.setProfile(profileInput());
    const plan = await coach.weekPlan('food');
    const t = plan.tasks[0]!;
    for (const bad of [-1, 1.5, Number.NaN]) {
      await expect(coach.completeTask(t.id, { cardsReviewed: bad })).rejects.toBeInstanceOf(InvalidDataError);
    }
    const r = await coach.completeTask(t.id, { lessonId: 'L1' });
    expect(r.task.lessonId).toBe('L1');
  });

  test('completeTask unknown id throws NotFoundError', async () => {
    await coach.setProfile(profileInput());
    await expect(coach.completeTask('nope')).rejects.toBeInstanceOf(NotFoundError);
    await expect(coach.completeTask('nope')).rejects.toThrow(/nope/);
  });

  test('submitReview moves card out of dueReviews', async () => {
    await coach.setProfile(profileInput());
    await coach.saveLesson(lesson('a', 'b'));
    const due = await coach.dueReviews();
    expect(due).toHaveLength(2);
    expect(await coach.dueReviews(1)).toHaveLength(1);
    const updated = await coach.submitReview(due[0]!.id, 3);
    expect(new Date(updated.srs.due).getTime()).toBeGreaterThan(NOW.getTime());
    expect((await coach.dueReviews()).map((c) => c.id)).toEqual([due[1]!.id]);
    await expect(coach.submitReview('nope', 3)).rejects.toBeInstanceOf(NotFoundError);
  });

  test('unvalidated optional fields are rejected and nothing is saved', async () => {
    await coach.setProfile(profileInput());
    const plan = await coach.weekPlan('food');
    const before = await coach.exportData();
    await expect(
      coach.saveLesson({ ...lesson('a'), items: [{ term: 'a', translation: 't', example: '', note: 42 as never }] }),
    ).rejects.toBeInstanceOf(InvalidDataError);
    await expect(
      coach.saveLesson({ ...lesson('a'), items: [{ term: 'a', translation: 't', example: 5 as never }] }),
    ).rejects.toBeInstanceOf(InvalidDataError);
    await expect(coach.completeTask(plan.tasks[0]!.id, { lessonId: 7 as never })).rejects.toBeInstanceOf(
      InvalidDataError,
    );
    await expect(coach.weekPlan(123 as never)).rejects.toBeInstanceOf(InvalidDataError);
    await expect(coach.dueReviews(0)).rejects.toBeInstanceOf(InvalidDataError);
    await expect(coach.dueReviews(1.5)).rejects.toBeInstanceOf(InvalidDataError);
    const after = await coach.exportData();
    expect(after).toEqual(before);
    expect(after.plans[Object.keys(after.plans)[0]!]!.tasks[0]!.status).toBe('todo');
  });

  test('unknown item keys are dropped and state still parses', async () => {
    await coach.setProfile(profileInput());
    const item = { term: 'a', translation: 't', example: 'e', note: 'n', extra: 'x' };
    const r = await coach.saveLesson({ ...lesson('a'), items: [item] });
    expect(r.lesson.items[0]).toEqual({ term: 'a', translation: 't', example: 'e', note: 'n' });
    const exported = JSON.parse(JSON.stringify(await coach.exportData())) as unknown;
    expect(() => parseState(exported)).not.toThrow();
  });

  test('progress works without profile', async () => {
    expect(await coach.progress()).toEqual({
      profile: null,
      streak: 0,
      totalXp: 0,
      weekly: { done: 0, planned: 0 },
      dueCount: 0,
    });
  });

  test('progress after completing a full study day', async () => {
    // Plan created on Tuesday: study days run Tue..Sun (6 days), Tuesday is the first one.
    await coach.setProfile(profileInput({ daysPerWeek: 7 }));
    await coach.weekPlan('food');
    const { tasks } = await coach.today();
    expect(tasks.map((t) => t.type)).toEqual(['tiny_lesson']);
    for (const t of tasks) await coach.completeTask(t.id, { cardsReviewed: 0 });
    const p = await coach.progress();
    expect(p.streak).toBe(1);
    expect(p.totalXp).toBe(20);
    expect(p.weekly.done).toBe(1);
    expect(p.weekly.planned).toBe(6);
  });

  test('weekPlan created on Tuesday → today() returns tasks for Tuesday', async () => {
    await coach.setProfile(profileInput({ daysPerWeek: 3 }));
    const plan = await coach.weekPlan('food');
    expect(plan.tasks.every((t) => t.date >= '2026-10-20')).toBe(true);
    const t = await coach.today();
    expect(t.date).toBe('2026-10-20');
    expect(t.tasks.length).toBeGreaterThan(0);
    expect(t.tasks.map((x) => x.type)).toEqual(['tiny_lesson']);
  });

  test('importData invalid leaves state untouched', async () => {
    await coach.setProfile(profileInput());
    const before = await coach.exportData();
    await expect(coach.importData({ version: 99 })).rejects.toBeInstanceOf(InvalidDataError);
    expect(await coach.exportData()).toEqual(before);
  });

  test('export then import round-trips', async () => {
    await coach.setProfile(profileInput());
    await coach.weekPlan('food');
    await coach.saveLesson(lesson('a', 'b'));
    const data = await coach.exportData();
    const fresh = new Coach(new MemoryStore(), () => NOW, () => 'z');
    expect(await fresh.importData(data)).toEqual({ lessons: 1, cards: 2 });
    expect(await fresh.exportData()).toEqual(data);
  });
});
