import { beforeEach, describe, expect, test } from 'vitest';
import { Coach } from '../src/coach.js';
import { addDays, toLocalDate } from '../src/dates.js';
import { InvalidDataError, NotFoundError } from '../src/errors.js';
import { parseState } from '../src/schema.js';
import { MemoryStore } from '../src/store.js';
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
const card = async (id: string) => (await state()).cards.find((c) => c.id === id)!;

describe('schema accepts and validates v2 fields', () => {
  test('valid v2 data round-trips; version stays 1', async () => {
    const s = await state();
    const v2: State = {
      ...s,
      profile: { ...profile, dailyGoalXp: 30, createdAt: now.toISOString() },
      cards: s.cards.map((c) => ({ ...c, nativeTranslation: 'bir', favorite: true, mastered: false })),
      streakFreezes: 2,
      freezeUsedDates: ['2026-10-01'],
      sessions: [{ id: 's', at: now.toISOString(), date: '2026-10-22', exercises: 10, correct: 9, xp: 14 }],
    };
    expect(parseState(JSON.parse(JSON.stringify(v2)))).toEqual(v2);
    expect(v2.version).toBe(1);
  });
  test.each([
    ['dailyGoalXp', (s: any) => (s.profile = { ...profile, createdAt: 'x', dailyGoalXp: 15 })],
    ['nativeTranslation', (s: any) => (s.cards[0].nativeTranslation = 5)],
    ['favorite', (s: any) => (s.cards[0].favorite = 'yes')],
    ['mastered', (s: any) => (s.cards[0].mastered = 1)],
    ['streakFreezes', (s: any) => (s.streakFreezes = -1)],
    ['freezeUsedDates', (s: any) => (s.freezeUsedDates = [3])],
    ['freezeAward', (s: any) => (s.freezeAward = { start: '2026-10-01', highestMilestone: -7 })],
    ['sessions', (s: any) => (s.sessions = [{ id: 's' }])],
  ])('rejects invalid %s', async (field, mutate) => {
    const s = JSON.parse(JSON.stringify(await state()));
    mutate(s);
    expect(() => parseState(s)).toThrow(new RegExp(field));
  });
});

describe('setProfile dailyGoalXp', () => {
  test('accepts 10/20/30/50 and keeps it when omitted later', async () => {
    for (const g of [10, 20, 30, 50] as const) {
      expect((await coach.setProfile({ ...profile, dailyGoalXp: g })).dailyGoalXp).toBe(g);
    }
    expect((await coach.setProfile(profile)).dailyGoalXp).toBe(50);
  });
  test.each([0, 15, 25, 100, '20', 20.5])('rejects %s', async (g) => {
    await expect(coach.setProfile({ ...profile, dailyGoalXp: g as never })).rejects.toThrow(/dailyGoalXp/);
  });
});

describe('setFavorite', () => {
  test('sets and clears', async () => {
    await coach.setFavorite(ids[0]!, true);
    expect((await card(ids[0]!)).favorite).toBe(true);
    const c = await coach.setFavorite(ids[0]!, false);
    expect(c.favorite).toBe(false);
  });
  test('validates', async () => {
    await expect(coach.setFavorite('nope', true)).rejects.toBeInstanceOf(NotFoundError);
    await expect(coach.setFavorite(ids[0]!, 'yes' as never)).rejects.toThrow(/favorite/);
  });
});

describe('setNativeTranslations', () => {
  test('updates known cards (trimmed), skips unknown ids', async () => {
    const r = await coach.setNativeTranslations([
      { cardId: ids[0]!, text: '  bir ' },
      { cardId: ids[1]!, text: 'iki' },
      { cardId: 'ghost', text: 'hayalet' },
    ]);
    expect(r).toEqual({ updated: 2 });
    expect((await card(ids[0]!)).nativeTranslation).toBe('bir');
    expect((await card(ids[1]!)).nativeTranslation).toBe('iki');
  });
  test('empty list is fine', async () => {
    expect(await coach.setNativeTranslations([])).toEqual({ updated: 0 });
  });
  test('validates size and text', async () => {
    const many = Array.from({ length: 501 }, () => ({ cardId: ids[0]!, text: 'a' }));
    await expect(coach.setNativeTranslations(many)).rejects.toBeInstanceOf(InvalidDataError);
    await expect(coach.setNativeTranslations('x' as never)).rejects.toThrow(/entries/);
    await expect(coach.setNativeTranslations([{ cardId: ids[0]!, text: '   ' }])).rejects.toThrow(/entries\[0\]\.text/);
    await expect(coach.setNativeTranslations([{ cardId: ids[0]!, text: 'a'.repeat(501) }])).rejects.toThrow(/text/);
    await expect(coach.setNativeTranslations([{ cardId: 3, text: 'a' } as never])).rejects.toThrow(/cardId/);
    expect((await card(ids[0]!)).nativeTranslation).toBeUndefined();
  });
  test('500 entries and 500 chars are allowed', async () => {
    const many = Array.from({ length: 500 }, () => ({ cardId: ids[0]!, text: 'a'.repeat(500) }));
    expect((await coach.setNativeTranslations(many)).updated).toBe(500);
  });
});

describe('markMastered', () => {
  test('first call: FSRS Easy, mastered, 2 XP; later calls award nothing and change nothing', async () => {
    const before = await card(ids[0]!);
    const r = await coach.markMastered(ids[0]!);
    expect(r).toEqual({ xpAwarded: 2 });
    const after = await card(ids[0]!);
    expect(after.mastered).toBe(true);
    expect(after.srs.reps).toBe(before.srs.reps + 1);
    const s1 = await state();
    expect(s1.log).toEqual([
      { at: now.toISOString(), date: '2026-10-22', taskId: `mastered:${ids[0]}`, type: 'review', xp: 2 },
    ]);
    now = new Date(2026, 9, 23, 10, 0);
    expect(await coach.markMastered(ids[0]!)).toEqual({ xpAwarded: 0 });
    expect(await coach.markMastered(ids[0]!)).toEqual({ xpAwarded: 0 });
    expect(await state()).toEqual(s1);
  });
  test('concurrent spam awards XP once', async () => {
    const rs = await Promise.all(Array.from({ length: 5 }, () => coach.markMastered(ids[1]!)));
    expect(rs.map((r) => r.xpAwarded).sort()).toEqual([0, 0, 0, 0, 2]);
    expect((await state()).log).toHaveLength(1);
  });
  test('unknown card → NotFoundError; bad id → InvalidDataError', async () => {
    await expect(coach.markMastered('nope')).rejects.toBeInstanceOf(NotFoundError);
    await expect(coach.markMastered('' as never)).rejects.toBeInstanceOf(InvalidDataError);
  });
});

describe('recordPractice', () => {
  test('perfect session: XP = correct + 5 + 5, one log entry, session stored, FSRS Good', async () => {
    const r = await coach.recordPractice({
      sessionId: 's1',
      results: [
        { cardId: ids[0]!, outcome: 'correct' },
        { cardId: ids[1]!, outcome: 'correct' },
        { cardId: ids[2]!, outcome: 'correct' },
      ],
    });
    expect(r).toEqual({ xp: 13, correct: 3, total: 3, perfect: true });
    const s = await state();
    expect(s.log).toEqual([{ at: now.toISOString(), date: '2026-10-22', taskId: 'practice:s1', type: 'review', xp: 13 }]);
    expect(s.sessions).toEqual([
      { id: 's1', at: now.toISOString(), date: '2026-10-22', exercises: 3, correct: 3, xp: 13, perfect: true },
    ]);
    for (const id of ids.slice(0, 3)) expect((await card(id)).srs.reps).toBe(1);
    expect((await card(ids[3]!)).srs.reps).toBe(0); // unanswered card untouched
  });

  test('wrong answer: no perfect bonus; outcomes map to Good/Hard/Again; last outcome wins per card', async () => {
    const r = await coach.recordPractice({
      sessionId: 's2',
      results: [
        { cardId: ids[0]!, outcome: 'wrong' },
        { cardId: ids[0]!, outcome: 'correct' },
        { cardId: ids[1]!, outcome: 'hard' },
        { cardId: ids[2]!, outcome: 'wrong' },
      ],
    });
    expect(r).toEqual({ xp: 1 + 5, correct: 1, total: 4, perfect: false });
    // compare with direct FSRS ratings from an identical starting point
    const ref = new MemoryStore();
    let n = 0;
    const refCoach = new Coach(ref, () => now, () => `id${++n}`);
    await refCoach.saveLesson(lesson('uno', 'dos', 'tres', 'cuatro'));
    await refCoach.setProfile(profile);
    await refCoach.submitReview(ids[0]!, 3);
    await refCoach.submitReview(ids[1]!, 2);
    await refCoach.submitReview(ids[2]!, 1);
    const refCards = (await refCoach.exportData()).cards;
    for (const id of ids.slice(0, 3)) {
      expect((await card(id)).srs).toEqual(refCards.find((c) => c.id === id)!.srs);
    }
  });

  test('idempotent by sessionId: same numbers, no changes', async () => {
    const input = { sessionId: 's3', results: [{ cardId: ids[0]!, outcome: 'correct' as const }] };
    const r1 = await coach.recordPractice(input);
    const s1 = await state();
    now = new Date(2026, 9, 22, 11, 0);
    const r2 = await coach.recordPractice({ ...input, results: [{ cardId: ids[1]!, outcome: 'wrong' }] });
    expect(r2).toEqual(r1);
    expect(await state()).toEqual(s1);
  });

  test('concurrent duplicate submissions award once', async () => {
    const input = { sessionId: 's4', results: [{ cardId: ids[0]!, outcome: 'correct' as const }] };
    const rs = await Promise.all([coach.recordPractice(input), coach.recordPractice(input)]);
    expect(rs[0]).toEqual(rs[1]);
    expect((await state()).log).toHaveLength(1);
  });

  test('unknown cardIds are ignored and not counted', async () => {
    const r = await coach.recordPractice({
      sessionId: 's5',
      results: [
        { cardId: 'ghost', outcome: 'wrong' },
        { cardId: ids[0]!, outcome: 'correct' },
      ],
    });
    expect(r).toEqual({ xp: 11, correct: 1, total: 1, perfect: true });
  });

  test('only unknown cards: nothing to reward, session remembered', async () => {
    const r = await coach.recordPractice({ sessionId: 's6', results: [{ cardId: 'ghost', outcome: 'correct' }] });
    expect(r).toEqual({ xp: 0, correct: 0, total: 0, perfect: false });
    expect((await state()).log).toEqual([]);
  });

  test('interrupted session (never recorded) leaves no XP and no FSRS change', async () => {
    const before = await state();
    // a closed panel simply never calls recordPractice; nothing else writes practice data
    expect((await coach.progress()).todayXp).toBe(0);
    expect(await state()).toEqual(before);
  });

  test("completes today's review task without extra XP", async () => {
    await coach.setProfile(profile);
    await coach.weekPlan('food');
    const plan = (await state()).plans['2026-W43']!;
    const date = toLocalDate(now);
    let reviewTask = plan.tasks.find((t) => t.date === date && t.type === 'review');
    if (!reviewTask) {
      // make sure there is one to complete
      const s = await state();
      s.plans['2026-W43']!.tasks.push({ id: 'rt', date, type: 'review', minutes: 5, status: 'todo' });
      await store.save(s);
      reviewTask = { id: 'rt', date, type: 'review', minutes: 5, status: 'todo' };
    }
    const r = await coach.recordPractice({ sessionId: 's7', results: [{ cardId: ids[0]!, outcome: 'correct' }] });
    const s = await state();
    const t = s.plans['2026-W43']!.tasks.find((x) => x.id === reviewTask!.id)!;
    expect(t.status).toBe('done');
    expect(t.completedAt).toBe(now.toISOString());
    expect(s.log).toHaveLength(1);
    expect(s.log.reduce((a, e) => a + e.xp, 0)).toBe(r.xp);
  });

  test('sessions are capped at 500 (oldest dropped)', async () => {
    const s = await state();
    s.sessions = Array.from({ length: 500 }, (_, i) => ({
      id: `old${i}`,
      at: now.toISOString(),
      date: '2026-10-01',
      exercises: 1,
      correct: 1,
      xp: 11,
    }));
    await store.save(s);
    await coach.recordPractice({ sessionId: 'new', results: [{ cardId: ids[0]!, outcome: 'correct' }] });
    const after = (await state()).sessions!;
    expect(after).toHaveLength(500);
    expect(after[0]!.id).toBe('old1');
    expect(after.at(-1)!.id).toBe('new');
  });

  test.each([
    ['sessionId', { sessionId: '', results: [{ cardId: 'a', outcome: 'correct' }] }],
    ['sessionId', { sessionId: 'x'.repeat(101), results: [{ cardId: 'a', outcome: 'correct' }] }],
    ['results', { sessionId: 's', results: [] }],
    ['results', { sessionId: 's', results: Array.from({ length: 51 }, () => ({ cardId: 'a', outcome: 'correct' })) }],
    ['results\\[0\\].cardId', { sessionId: 's', results: [{ cardId: 1, outcome: 'correct' }] }],
    ['results\\[0\\].outcome', { sessionId: 's', results: [{ cardId: 'a', outcome: 'meh' }] }],
  ])('validates %s', async (field, input) => {
    await expect(coach.recordPractice(input as never)).rejects.toThrow(new RegExp(field));
    expect((await state()).log).toEqual([]);
  });
});

describe('progress v2 fields and rollover', () => {
  test('keeps existing fields and adds the new ones', async () => {
    const p = await coach.progress();
    expect(p).toMatchObject({ profile: null, totalXp: 0, weekly: { done: 0, planned: 0 }, streak: 0 });
    expect(p.dueCount).toBe(4);
    expect(p.todayXp).toBe(0);
    expect(p.dailyGoalXp).toBe(20);
    expect(p.streakFreezes).toBe(0);
    expect(p.weekXp).toEqual(
      Array.from({ length: 7 }, (_, i) => ({ date: addDays('2026-10-22', i - 6), xp: 0 })),
    );
  });

  test('todayXp, weekXp and streak (any XP counts)', async () => {
    await coach.setProfile({ ...profile, dailyGoalXp: 10 });
    now = new Date(2026, 9, 21, 9, 0);
    await coach.recordPractice({ sessionId: 'a', results: [{ cardId: ids[0]!, outcome: 'correct' }] });
    now = new Date(2026, 9, 22, 9, 0);
    await coach.markMastered(ids[1]!);
    const p = await coach.progress();
    expect(p.todayXp).toBe(2);
    expect(p.dailyGoalXp).toBe(10);
    expect(p.streak).toBe(2); // today has some XP (below goal) and yesterday had a session
    expect(p.weekXp.at(-1)).toEqual({ date: '2026-10-22', xp: 2 });
    expect(p.weekXp.at(-2)).toEqual({ date: '2026-10-21', xp: 11 });
  });

  test('raising the daily goal does not change past streaks', async () => {
    await coach.setProfile({ ...profile, dailyGoalXp: 10 });
    const s = await state();
    for (const [date, xp] of [['2026-10-19', 3], ['2026-10-20', 12], ['2026-10-21', 1]] as const) {
      s.log.push({ at: 'x', date, taskId: 't', type: 'quiz', xp });
    }
    await store.save(s);
    const before = await coach.progress();
    expect(before.streak).toBe(3);
    await coach.setProfile({ ...profile, dailyGoalXp: 50 });
    const after = await coach.progress();
    expect(after.dailyGoalXp).toBe(50);
    expect(after.streak).toBe(3);
  });

  test('rollover consumes nothing when the gap is longer than the freezes held', async () => {
    const s = await state();
    s.streakFreezes = 2;
    s.log.push({ at: 'x', date: '2026-10-18', taskId: 't', type: 'quiz', xp: 30 }); // missed 19, 20, 21
    await store.save(s);
    expect(await coach.rollover()).toEqual({ consumed: [], earned: 0 });
    let p = await coach.progress();
    expect(p.streakFreezes).toBe(2);
    expect(p.streak).toBe(0);
    await coach.markMastered(ids[0]!);
    p = await coach.progress();
    expect(p.streak).toBe(1);
  });

  test('rollover consumes a freeze for a missed day and is idempotent', async () => {
    const s = await state();
    s.streakFreezes = 1;
    s.log.push({ at: 'x', date: '2026-10-20', taskId: 't', type: 'quiz', xp: 30 });
    await store.save(s);
    // before rollover: persisted numbers only (the missed day is not yet protected)
    const pre = await coach.progress();
    expect(pre.streak).toBe(0);
    expect(pre.streakFreezes).toBe(1);
    expect(await coach.rollover()).toEqual({ consumed: ['2026-10-21'], earned: 0 });
    const after = await state();
    expect(after.streakFreezes).toBe(0);
    expect(after.freezeUsedDates).toEqual(['2026-10-21']);
    expect(await coach.rollover()).toEqual({ consumed: [], earned: 0 });
    expect(await state()).toEqual(after);
    const p = await coach.progress();
    expect(p.streak).toBe(2);
    expect(p.streakFreezes).toBe(0);
  });

  test('rollover earns a freeze at a 7-day streak', async () => {
    const s = await state();
    for (let i = 0; i < 7; i++) {
      s.log.push({ at: 'x', date: addDays('2026-10-22', -i), taskId: 't', type: 'quiz', xp: 30 });
    }
    await store.save(s);
    expect((await coach.progress()).streakFreezes).toBe(0); // not earned until rollover persists it
    expect(await coach.rollover()).toEqual({ consumed: [], earned: 1 });
    expect(await coach.rollover()).toEqual({ consumed: [], earned: 0 });
    expect((await coach.progress()).streakFreezes).toBe(1);
  });
});
