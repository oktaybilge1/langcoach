import { addDays } from './dates.js';
import type { LogEntry, State } from './types.js';

/** Most streak freezes a learner can hold. */
export const MAX_STREAK_FREEZES = 2;
/** A freeze is earned every time the streak reaches a multiple of this. */
export const FREEZE_EVERY_DAYS = 7;
const KEEP_FREEZE_DATES = 60;

const isPractice = (e: LogEntry) => e.taskId.startsWith('practice:');

/** XP earned on a local date. */
export function dailyXp(log: LogEntry[], date: string): number {
  let sum = 0;
  for (const e of log) if (e.date === date) sum += e.xp;
  return sum;
}

export function goalMet(log: LogEntry[], date: string, goal: number): boolean {
  return dailyXp(log, date) >= goal;
}

/**
 * Dates (YYYY-MM-DD) that count for the streak: any XP earned, a practice session, or a freeze.
 * The daily goal deliberately plays no part (it only drives the goal ring), so changing the goal
 * never rewrites past streaks.
 */
function countedDates(log: LogEntry[], freezeUsedDates: readonly string[]): Set<string> {
  const out = new Set<string>(freezeUsedDates);
  for (const e of log) if (e.xp > 0 || isPractice(e)) out.add(e.date);
  return out;
}

function streakFrom(counted: Set<string>, today: string): { length: number; start: string | null } {
  let cursor = counted.has(today) ? today : addDays(today, -1);
  let length = 0;
  let start: string | null = null;
  while (counted.has(cursor)) {
    length++;
    start = cursor;
    cursor = addDays(cursor, -1);
  }
  return { length, start };
}

/**
 * Consecutive counted days ending today, or yesterday when today is not counted yet
 * (an unfinished today never breaks the streak).
 */
export function computeStreak(input: {
  log: LogEntry[];
  today: string;
  /** Accepted for API compatibility; the daily goal does not affect the streak. */
  goal?: number;
  freezeUsedDates?: readonly string[];
}): number {
  return streakFrom(countedDates(input.log, input.freezeUsedDates ?? []), input.today).length;
}

/**
 * Protect missed days with held freezes and award freezes for 7-day milestones.
 * Freezes are used only when the ones held cover the whole gap (day after the last counted day
 * up to yesterday); otherwise none are used and the streak breaks.
 * Pure: returns the same `state` object when nothing changes, so calling it twice for the same
 * `today` changes nothing the second time. `_goal` is accepted for API compatibility only.
 */
export function applyFreezes(
  state: State,
  today: string,
  _goal?: number,
): { state: State; consumed: string[]; earned: number } {
  const used = [...(state.freezeUsedDates ?? [])];
  const counted = countedDates(state.log, used);
  let held = Math.max(0, Math.floor(state.streakFreezes ?? 0));
  const startHeld = held;

  // 1. Missed days between the last counted day before today and yesterday: all or nothing.
  const consumed: string[] = [];
  let last: string | null = null;
  for (const d of counted) if (d < today && (last === null || d > last)) last = d;
  if (last !== null) {
    const gap: string[] = [];
    for (let d = addDays(last, 1); d < today && gap.length <= held; d = addDays(d, 1)) gap.push(d);
    if (gap.length > 0 && gap.length <= held) {
      for (const d of gap) {
        held--;
        used.push(d);
        counted.add(d);
        consumed.push(d);
      }
    }
  }

  // 2. One freeze per 7-day milestone of the current streak. The marker tracks only the current
  //    streak (its start date and the highest milestone rewarded), so it never grows or re-awards.
  const { length, start } = streakFrom(counted, today);
  const reached = Math.floor(length / FREEZE_EVERY_DAYS) * FREEZE_EVERY_DAYS;
  const prev = state.freezeAward;
  const rewarded = prev !== undefined && prev.start === start ? prev.highestMilestone : 0;
  const newAwards = start !== null && reached > rewarded ? (reached - rewarded) / FREEZE_EVERY_DAYS : 0;
  held = Math.min(Math.max(held, MAX_STREAK_FREEZES), held + newAwards);
  const earned = Math.max(0, held - (startHeld - consumed.length));

  if (consumed.length === 0 && newAwards === 0) return { state, consumed, earned: 0 };
  const next: State = { ...state, streakFreezes: held };
  if (consumed.length > 0) next.freezeUsedDates = trimUsed(used, start);
  if (newAwards > 0) next.freezeAward = { start: start!, highestMilestone: reached };
  return { state: next, consumed, earned };
}

/** Keep at most 60 freeze dates, but never drop one inside the current streak (≥ its start). */
function trimUsed(used: string[], start: string | null): string[] {
  if (start === null) return used.slice(-KEEP_FREEZE_DATES);
  const current = used.filter((d) => d >= start);
  const older = used.filter((d) => d < start);
  const room = Math.max(0, KEEP_FREEZE_DATES - current.length);
  return [...(room > 0 ? older.slice(-room) : []), ...current];
}
