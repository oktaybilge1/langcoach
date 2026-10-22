import { describe, expect, test } from 'vitest';
import { addDays } from '../src/dates.js';
import { applyFreezes, computeStreak, dailyXp, goalMet } from '../src/streak.js';
import { emptyState, type LogEntry, type State } from '../src/types.js';

const e = (date: string, xp: number, taskId = 't'): LogEntry => ({
  at: `${date}T10:00:00.000Z`,
  date,
  taskId,
  type: 'quiz',
  xp,
});
const TODAY = '2026-10-22';
const day = (n: number) => addDays(TODAY, n); // day(-1) = yesterday

function stateWith(log: LogEntry[], extra: Partial<State> = {}): State {
  return { ...emptyState(), log, ...extra };
}

describe('addDays', () => {
  test('crosses month/year and DST boundaries', () => {
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDays('2026-03-29', 1)).toBe('2026-03-30');
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDays('2026-10-22', 0)).toBe('2026-10-22');
  });
});

describe('dailyXp / goalMet', () => {
  test('sums only that date', () => {
    const log = [e(TODAY, 5), e(TODAY, 7), e(day(-1), 100)];
    expect(dailyXp(log, TODAY)).toBe(12);
    expect(goalMet(log, TODAY, 12)).toBe(true);
    expect(goalMet(log, TODAY, 20)).toBe(false);
  });
});

describe('computeStreak', () => {
  test('counts goal-met days ending today', () => {
    const log = [e(day(-2), 20), e(day(-1), 30), e(TODAY, 20)];
    expect(computeStreak({ log, today: TODAY, goal: 20, freezeUsedDates: [] })).toBe(3);
  });
  test('today not yet met does not break the streak', () => {
    const log = [e(day(-2), 20), e(day(-1), 30), e(TODAY, 5)];
    expect(computeStreak({ log, today: TODAY, goal: 20, freezeUsedDates: [] })).toBe(2);
  });
  test('a day below goal breaks it', () => {
    const log = [e(day(-3), 20), e(day(-2), 5), e(day(-1), 30)];
    expect(computeStreak({ log, today: TODAY, goal: 20, freezeUsedDates: [] })).toBe(1);
  });
  test('a practice session counts even below goal', () => {
    const log = [e(day(-2), 50), e(day(-3), 5), e(day(-1), 6, 'practice:s1')];
    expect(computeStreak({ log, today: TODAY, goal: 50, freezeUsedDates: [] })).toBe(2);
  });
  test('freeze-used dates count', () => {
    const log = [e(day(-3), 20), e(day(-1), 20)];
    expect(computeStreak({ log, today: TODAY, goal: 20, freezeUsedDates: [day(-2)] })).toBe(3);
  });
  test('future-dated entries (timezone change) are ignored', () => {
    const log = [e(day(1), 50), e(day(-1), 20)];
    expect(computeStreak({ log, today: TODAY, goal: 20, freezeUsedDates: [] })).toBe(1);
  });
  test('empty log → 0', () => {
    expect(computeStreak({ log: [], today: TODAY, goal: 20, freezeUsedDates: [] })).toBe(0);
  });
});

describe('applyFreezes', () => {
  test('one missed day with one freeze → consumed, streak kept', () => {
    const s = stateWith([e(day(-3), 20), e(day(-2), 20)], { streakFreezes: 1 });
    const r = applyFreezes(s, TODAY, 20);
    expect(r.consumed).toEqual([day(-1)]);
    expect(r.state.streakFreezes).toBe(0);
    expect(r.state.freezeUsedDates).toEqual([day(-1)]);
    expect(
      computeStreak({ log: r.state.log, today: TODAY, goal: 20, freezeUsedDates: r.state.freezeUsedDates ?? [] }),
    ).toBe(3);
  });

  test('multiple missed days: consumes oldest first, at most what is held, never negative', () => {
    const s = stateWith([e(day(-5), 20)], { streakFreezes: 2 });
    const r = applyFreezes(s, TODAY, 20);
    expect(r.consumed).toEqual([day(-4), day(-3)]);
    expect(r.state.streakFreezes).toBe(0);
    const again = applyFreezes(r.state, TODAY, 20);
    expect(again.consumed).toEqual([]);
    expect(again.state.streakFreezes).toBe(0);
    expect(again.state).toBe(r.state);
  });

  test('two missed days with two freezes → streak protected', () => {
    const s = stateWith([e(day(-3), 20)], { streakFreezes: 2 });
    const r = applyFreezes(s, TODAY, 20);
    expect(r.consumed).toEqual([day(-2), day(-1)]);
    expect(computeStreak({ log: s.log, today: TODAY, goal: 20, freezeUsedDates: r.consumed })).toBe(3);
  });

  test('no freezes held → nothing consumed, state unchanged', () => {
    const s = stateWith([e(day(-3), 20)]);
    const r = applyFreezes(s, TODAY, 20);
    expect(r).toEqual({ state: s, consumed: [], earned: 0 });
    expect(r.state).toBe(s);
  });

  test('no history → nothing happens', () => {
    const s = stateWith([], { streakFreezes: 2 });
    expect(applyFreezes(s, TODAY, 20)).toEqual({ state: s, consumed: [], earned: 0 });
  });

  test('yesterday active → nothing to consume; today missing never consumes', () => {
    const s = stateWith([e(day(-1), 20)], { streakFreezes: 2 });
    expect(applyFreezes(s, TODAY, 20).consumed).toEqual([]);
  });

  test('idempotent for the same today', () => {
    const s = stateWith([e(day(-4), 20)], { streakFreezes: 1 });
    const r1 = applyFreezes(s, TODAY, 20);
    const r2 = applyFreezes(r1.state, TODAY, 20);
    expect(r2.consumed).toEqual([]);
    expect(r2.earned).toBe(0);
    expect(r2.state).toEqual(r1.state);
  });

  test('daily calls give the same result as one late call (midnight crossing)', () => {
    const s = stateWith([e(day(-3), 20)], { streakFreezes: 2 });
    const a = applyFreezes(applyFreezes(s, day(-1), 20).state, TODAY, 20);
    const b = applyFreezes(s, TODAY, 20);
    expect(a.state.freezeUsedDates).toEqual(b.state.freezeUsedDates);
    expect(a.state.streakFreezes).toBe(b.state.streakFreezes);
  });

  test('earns 1 freeze when the streak reaches 7, once', () => {
    const log = Array.from({ length: 7 }, (_, i) => e(day(-i), 20));
    const r = applyFreezes(stateWith(log), TODAY, 20);
    expect(r.earned).toBe(1);
    expect(r.state.streakFreezes).toBe(1);
    const again = applyFreezes(r.state, TODAY, 20);
    expect(again.earned).toBe(0);
    expect(again.state).toBe(r.state);
    // next day, streak 8 → nothing new
    const next = applyFreezes({ ...r.state, log: [...log, e(day(1), 20)] }, day(1), 20);
    expect(next.earned).toBe(0);
  });

  test('earning is capped at 2 held', () => {
    const log = Array.from({ length: 21 }, (_, i) => e(day(-i), 20));
    const r = applyFreezes(stateWith(log), TODAY, 20);
    expect(r.state.streakFreezes).toBe(2);
    expect(r.earned).toBe(2);
    const held = applyFreezes(stateWith(log, { streakFreezes: 2 }), TODAY, 20);
    expect(held.state.streakFreezes).toBe(2);
    expect(held.earned).toBe(0);
  });

  test('a new streak reaching 7 again earns again', () => {
    const old = Array.from({ length: 7 }, (_, i) => e(day(-20 - i), 20));
    const r1 = applyFreezes(stateWith(old), day(-20), 20);
    expect(r1.earned).toBe(1);
    // the old streak broke (freeze used for one day, then gap); a fresh 7-day streak ends today
    const fresh = Array.from({ length: 7 }, (_, i) => e(day(-i), 20));
    const r2 = applyFreezes({ ...r1.state, log: [...old, ...fresh] }, TODAY, 20);
    expect(r2.earned).toBe(1);
    expect(r2.state.streakFreezes).toBe(2);
  });

  test('freezeUsedDates is capped to the last 60', () => {
    const used = Array.from({ length: 60 }, (_, i) => addDays('2025-01-01', i));
    const s = stateWith([e(day(-2), 20)], { streakFreezes: 1, freezeUsedDates: used });
    const r = applyFreezes(s, TODAY, 20);
    expect(r.state.freezeUsedDates).toHaveLength(60);
    expect(r.state.freezeUsedDates?.at(-1)).toBe(day(-1));
    expect(r.state.freezeUsedDates?.[0]).toBe(used[1]);
  });

  test('does not mutate the input state', () => {
    const s = stateWith([e(day(-3), 20)], { streakFreezes: 2 });
    const snapshot = structuredClone(s);
    applyFreezes(s, TODAY, 20);
    expect(s).toEqual(snapshot);
  });
});
