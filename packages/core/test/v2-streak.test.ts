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
  test('today without activity yet does not break the streak', () => {
    const log = [e(day(-2), 20), e(day(-1), 30)];
    expect(computeStreak({ log, today: TODAY, goal: 20, freezeUsedDates: [] })).toBe(2);
  });
  test('any XP counts: the daily goal does not affect the streak', () => {
    const log = [e(day(-2), 1), e(day(-1), 5), e(TODAY, 3)];
    for (const goal of [10, 20, 30, 50]) {
      expect(computeStreak({ log, today: TODAY, goal, freezeUsedDates: [] })).toBe(3);
    }
  });
  test('a day without activity breaks it', () => {
    const log = [e(day(-4), 20), e(day(-2), 5), e(day(-1), 30)];
    expect(computeStreak({ log, today: TODAY, goal: 20, freezeUsedDates: [] })).toBe(2);
  });
  test('a practice session counts even with 0 XP', () => {
    const log = [e(day(-2), 50), e(day(-1), 0, 'practice:s1')];
    expect(computeStreak({ log, today: TODAY, freezeUsedDates: [] })).toBe(2);
    expect(computeStreak({ log: [e(day(-1), 0)], today: TODAY })).toBe(0);
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

  test('gap larger than freezes held: none consumed, freezes kept, streak breaks then restarts', () => {
    const s = stateWith([e(day(-4), 20)], { streakFreezes: 2 }); // missed day-3, day-2, day-1
    const r = applyFreezes(s, TODAY, 20);
    expect(r.consumed).toEqual([]);
    expect(r.state.streakFreezes).toBe(2);
    expect(r.state).toBe(s);
    expect(computeStreak({ log: s.log, today: TODAY, freezeUsedDates: r.state.freezeUsedDates ?? [] })).toBe(0);
    const withToday = [...s.log, e(TODAY, 3)];
    expect(computeStreak({ log: withToday, today: TODAY, freezeUsedDates: [] })).toBe(1);
    const again = applyFreezes({ ...s, log: withToday }, TODAY, 20);
    expect(again.consumed).toEqual([]);
    expect(again.state.streakFreezes).toBe(2);
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
    const s = stateWith([e(day(-2), 20)], { streakFreezes: 1 });
    const r1 = applyFreezes(s, TODAY, 20);
    expect(r1.consumed).toEqual([day(-1)]);
    const r2 = applyFreezes(r1.state, TODAY, 20);
    expect(r2.consumed).toEqual([]);
    expect(r2.earned).toBe(0);
    expect(r2.state).toEqual(r1.state);
  });

  test('gap fully covered by freezes held: daily calls and one late call agree', () => {
    const s = stateWith([e(day(-3), 20)], { streakFreezes: 2 });
    const a = applyFreezes(applyFreezes(s, day(-1), 20).state, TODAY, 20);
    const b = applyFreezes(s, TODAY, 20);
    expect(a.state.freezeUsedDates).toEqual(b.state.freezeUsedDates);
    expect(a.state.streakFreezes).toBe(b.state.streakFreezes);
  });

  test('documented divergence: 3-day gap with 2 freezes, daily rollovers vs one late rollover', () => {
    const s = stateWith([e(day(-4), 20)], { streakFreezes: 2 }); // missed day-3, day-2, day-1
    // Daily: each day's gap is 1, so a freeze is used on day-2 and day-1; on TODAY the gap
    // (day-1) is larger than the 0 freezes left, so the streak breaks with both freezes spent.
    let daily = applyFreezes(s, day(-2)).state;
    daily = applyFreezes(daily, day(-1)).state;
    daily = applyFreezes(daily, TODAY).state;
    expect(daily.freezeUsedDates).toEqual([day(-3), day(-2)]);
    expect(daily.streakFreezes).toBe(0);
    expect(computeStreak({ log: daily.log, today: TODAY, freezeUsedDates: daily.freezeUsedDates })).toBe(0);
    // One late call: the 3-day gap exceeds the 2 freezes, so none are spent.
    const late = applyFreezes(s, TODAY).state;
    expect(late.freezeUsedDates).toBeUndefined();
    expect(late.streakFreezes).toBe(2);
    expect(computeStreak({ log: late.log, today: TODAY, freezeUsedDates: [] })).toBe(0);
  });

  test('milestones are tracked per current streak: no re-award on very long streaks (> 427 days)', () => {
    const log: LogEntry[] = [];
    let s = stateWith(log);
    let earnedTotal = 0;
    for (let i = 0; i < 450; i++) {
      const today = addDays('2025-01-01', i);
      s = { ...s, log: [...s.log, e(today, 5)] };
      const r = applyFreezes(s, today);
      earnedTotal += r.earned;
      s = { ...r.state, streakFreezes: 0 }; // spend held freezes so the cap never hides a re-award
    }
    expect(earnedTotal).toBe(Math.floor(450 / 7));
    expect(s.freezeAward).toEqual({ start: '2025-01-01', highestMilestone: 448 });
    // Repeated calls on the last day earn nothing more.
    expect(applyFreezes(s, addDays('2025-01-01', 449)).earned).toBe(0);
  });

  test('a new streak resets the milestone marker', () => {
    const s = stateWith(
      Array.from({ length: 7 }, (_, i) => e(day(-i), 20)),
      { freezeAward: { start: '2025-01-01', highestMilestone: 448 } },
    );
    const r = applyFreezes(s, TODAY);
    expect(r.earned).toBe(1);
    expect(r.state.freezeAward).toEqual({ start: day(-6), highestMilestone: 7 });
  });

  test('freezeUsedDates trimming never drops dates inside the current streak', () => {
    // Current streak day-121..day-2: activity on even offsets, freezes on odd ones (60 freeze days),
    // plus 3 freeze dates from an older, broken streak. Yesterday was missed, 1 freeze held.
    const log: LogEntry[] = [];
    const used = ['2025-01-01', '2025-01-02', '2025-01-03'];
    for (let k = 121; k >= 2; k--) {
      if (k % 2 === 0) log.push(e(day(-k), 5));
      else used.push(day(-k));
    }
    const s = stateWith(log, { streakFreezes: 1, freezeUsedDates: used });
    expect(computeStreak({ log, today: day(-1), freezeUsedDates: used })).toBe(120);
    const r = applyFreezes(s, TODAY);
    expect(r.consumed).toEqual([day(-1)]);
    const kept = r.state.freezeUsedDates!;
    expect(kept).toHaveLength(61);
    expect(kept.some((d) => d.startsWith('2025'))).toBe(false);
    expect(computeStreak({ log, today: TODAY, freezeUsedDates: kept })).toBe(121);
  });

  test('freezeUsedDates trimming drops only dates older than the current streak start', () => {
    const old = Array.from({ length: 70 }, (_, i) => addDays('2025-01-01', i));
    const s = stateWith([e(day(-2), 20)], { streakFreezes: 1, freezeUsedDates: old });
    const r = applyFreezes(s, TODAY);
    expect(r.state.freezeUsedDates).toHaveLength(60);
    expect(r.state.freezeUsedDates!.at(-1)).toBe(day(-1));
    expect(r.state.freezeUsedDates![0]).toBe(old[11]);
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
