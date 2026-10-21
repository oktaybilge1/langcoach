import { beforeEach, describe, expect, test } from 'vitest';
import { Coach } from '../src/coach.js';
import { InvalidDataError, NotFoundError } from '../src/errors.js';
import { MemoryStore } from '../src/store.js';

const NOW = new Date(2026, 9, 20, 10, 0);
const profile = {
  nativeLanguage: 'English',
  targetLanguage: 'Spanish',
  level: 'A2' as const,
  goal: 'travel',
  minutesPerDay: 20,
  daysPerWeek: 7,
};
const lesson = (...terms: string[]) => ({
  kind: 'word_cam' as const,
  situation: 'cam',
  items: terms.map((term) => ({ term, translation: 'tr', example: '', pronunciation: 'p' })),
});

let store: MemoryStore;
let coach: Coach;
beforeEach(() => {
  store = new MemoryStore();
  let n = 0;
  coach = new Coach(store, () => NOW, () => `id${++n}`);
});

describe('saveLesson (extension)', () => {
  test('works without a profile, accepts word_cam/grammar/source/pronunciation', async () => {
    const grammar = [{ topic: 't', description: 'd', examples: [] }];
    const source = { app: 'lll' as const, targetLanguage: 'es', sourceLanguage: 'en' };
    const r = await coach.saveLesson({ ...lesson('uno', 'dos'), grammar, source });
    expect(r.newCards).toBe(2);
    expect(r.newCardIds).toHaveLength(2);
    expect(r.lesson.grammar).toEqual(grammar);
    expect(r.lesson.source).toEqual(source);
    const s = await coach.exportData();
    expect(s.cards[0]?.pronunciation).toBe('p');
    expect(s.cards.map((c) => c.id)).toEqual(r.newCardIds);
  });
  test('second save of same terms: all duplicates, no ids', async () => {
    await coach.saveLesson(lesson('uno', 'dos'));
    const r = await coach.saveLesson(lesson('UNO ', 'dos'));
    expect(r.newCards).toBe(0);
    expect(r.duplicates).toHaveLength(2);
    expect(r.newCardIds).toEqual([]);
  });
  test('rejects bad grammar/source', async () => {
    await expect(coach.saveLesson({ ...lesson('a'), grammar: 'x' as never })).rejects.toBeInstanceOf(InvalidDataError);
    await expect(coach.saveLesson({ ...lesson('a'), source: 5 as never })).rejects.toBeInstanceOf(InvalidDataError);
  });
});

describe('undoLesson', () => {
  test('removes lesson and unreviewed cards, keeps reviewed', async () => {
    await coach.setProfile(profile);
    const r = await coach.saveLesson(lesson('a', 'b', 'c'));
    await coach.submitReview(r.newCardIds[0]!, 3);
    const u = await coach.undoLesson(r.lesson.id);
    expect(u.removedCards).toBe(2);
    const s = await coach.exportData();
    expect(s.lessons.find((l) => l.id === r.lesson.id)).toBeUndefined();
    expect(s.cards.map((c) => c.id)).toEqual([r.newCardIds[0]]);
  });
  test('unknown id -> NotFoundError', async () => {
    await expect(coach.undoLesson('nope')).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('saveManualCard', () => {
  test('creates card, dedupes case/space-insensitively, shares one lesson per day', async () => {
    const a = await coach.saveManualCard({ term: 'hola' });
    expect(a.duplicate).toBe(false);
    expect(a.card?.translation).toBe('');
    const dup = await coach.saveManualCard({ term: '  HOLA ' });
    expect(dup).toEqual({ card: null, duplicate: true });
    const b = await coach.saveManualCard({ term: 'adios', translation: 'bye', pronunciation: 'x' });
    expect(b.card?.lessonId).toBe(a.card?.lessonId);
    const s = await coach.exportData();
    expect(s.lessons).toHaveLength(1);
    expect(s.lessons[0]).toMatchObject({ kind: 'tiny_lesson', situation: 'Saved manually' });
    expect(s.lessons[0]?.items).toHaveLength(2);
  });
  test('blank term rejected', async () => {
    await expect(coach.saveManualCard({ term: ' ' })).rejects.toBeInstanceOf(InvalidDataError);
  });
});

describe('updateCard', () => {
  test('edits translation and example', async () => {
    const { card } = await coach.saveManualCard({ term: 'hola' });
    const u = await coach.updateCard(card!.id, { translation: 'hello', example: 'Hola!' });
    expect(u.translation).toBe('hello');
    expect(u.example).toBe('Hola!');
    await expect(coach.updateCard('nope', {})).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('autoComplete', () => {
  test('completes matching todo today, then next todo, then logs unplanned', async () => {
    await coach.setProfile(profile);
    const plan = await coach.weekPlan('travel');
    const todays = plan.tasks.filter((t) => t.date === '2026-10-20' && t.type === 'tiny_lesson');
    const r1 = await coach.autoComplete('tiny_lesson', { lessonId: 'L' });
    if (todays.length > 0) {
      expect(r1.task?.status).toBe('done');
      expect(r1.task?.lessonId).toBe('L');
      expect(r1.xpAwarded).toBe(20);
    }
    const s0 = (await coach.exportData()).log.length;
    for (let i = 0; i < todays.length + 1; i++) await coach.autoComplete('tiny_lesson');
    const s = await coach.exportData();
    expect(s.log.length).toBe(s0 + todays.length + 1);
    const last = s.log[s.log.length - 1]!;
    expect(last.taskId).toBe('unplanned');
    expect(last.xp).toBe(20);
  });
  test('no matching todo -> null task, unplanned log with xp', async () => {
    await coach.setProfile(profile);
    await coach.weekPlan('travel');
    const r = await coach.autoComplete('word_cam');
    expect(r).toEqual({ task: null, xpAwarded: 20 });
    expect((await coach.exportData()).log.at(-1)).toMatchObject({ taskId: 'unplanned', type: 'word_cam', xp: 20 });
  });
  test('without profile only logs; streak 1', async () => {
    const r = await coach.autoComplete('review', { cardsReviewed: 3 });
    expect(r.task).toBeNull();
    expect(r.xpAwarded).toBe(13);
    const p = await coach.progress();
    expect(p.streak).toBe(1);
    expect(p.totalXp).toBe(13);
  });
  test('validates cardsReviewed', async () => {
    await expect(coach.autoComplete('review', { cardsReviewed: -1 })).rejects.toBeInstanceOf(InvalidDataError);
  });
});

describe('deleteAll', () => {
  test('empties state', async () => {
    await coach.setProfile(profile);
    await coach.saveLesson(lesson('a'));
    await coach.deleteAll();
    const s = await coach.exportData();
    expect(s).toEqual({ version: 1, profile: null, plans: {}, lessons: [], cards: [], log: [] });
  });
});
