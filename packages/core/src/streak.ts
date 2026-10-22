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

/** Dates (YYYY-MM-DD) that count for the streak: goal met, a practice session, or a freeze. */
function countedDates(log: LogEntry[], goal: number, freezeUsedDates: readonly string[]): Set<string> {
  const xp = new Map<string, number>();
  const out = new Set<string>(freezeUsedDates);
  for (const e of log) {
    xp.set(e.date, (xp.get(e.date) ?? 0) + e.xp);
    if (isPractice(e)) out.add(e.date);
  }
  for (const [date, sum] of xp) if (sum >= goal) out.add(date);
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
  goal: number;
  freezeUsedDates?: readonly string[];
}): number {
  return streakFrom(countedDates(input.log, input.goal, input.freezeUsedDates ?? []), input.today).length;
}

/**
 * Protect missed days with held freezes and award freezes for 7-day milestones.
 * Pure: returns the same `state` object when nothing changes, so calling it twice for the same
 * `today` changes nothing the second time.
 */
export function applyFreezes(
  state: State,
  today: string,
  goal: number,
): { state: State; consumed: string[]; earned: number } {
  const used = [...(state.freezeUsedDates ?? [])];
  const counted = countedDates(state.log, goal, used);
  let held = Math.max(0, Math.floor(state.streakFreezes ?? 0));
  const startHeld = held;

  // 1. Missed days between the last counted day before today and yesterday, oldest first.
  const consumed: string[] = [];
  let last: string | null = null;
  for (const d of counted) if (d < today && (last === null || d > last)) last = d;
  if (last !== null) {
    for (let d = addDays(last, 1); d < today && held > 0; d = addDays(d, 1)) {
      held--;
      used.push(d);
      counted.add(d);
      consumed.push(d);
    }
  }

  // 2. One freeze per 7-day milestone of the current streak, each rewarded once.
  const awards = [...(state.freezeAwards ?? [])];
  const known = new Set(awards);
  let newAwards = 0;
  const { length, start } = streakFrom(counted, today);
  if (start !== null) {
    for (let m = FREEZE_EVERY_DAYS; m <= length; m += FREEZE_EVERY_DAYS) {
      const key = `${start}#${m}`;
      if (known.has(key)) continue;
      known.add(key);
      awards.push(key);
      newAwards++;
      if (held < MAX_STREAK_FREEZES) held++;
    }
  }
  const earned = Math.max(0, held - (startHeld - consumed.length));

  if (consumed.length === 0 && newAwards === 0) return { state, consumed, earned: 0 };
  const next: State = { ...state, streakFreezes: held };
  if (consumed.length > 0) next.freezeUsedDates = used.slice(-KEEP_FREEZE_DATES);
  if (newAwards > 0) next.freezeAwards = awards.slice(-KEEP_FREEZE_DATES);
  return { state: next, consumed, earned };
}
