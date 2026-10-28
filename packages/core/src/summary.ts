import { addDays, isoWeek, toLocalDate } from './dates.js';
import { weeklyGoal } from './progress.js';
import { isDue } from './srs.js';
import { computeStreak, dailyXp } from './streak.js';
import { DEFAULT_DAILY_GOAL, type State } from './types.js';

export interface ProgressNumbers {
  /** Consecutive counted days (any XP, a practice session, or a used freeze). */
  streak: number;
  totalXp: number;
  weekly: { done: number; planned: number };
  dueCount: number;
  todayXp: number;
  dailyGoalXp: number;
  streakFreezes: number;
  /** The last 7 local days, oldest first, ending today. */
  weekXp: { date: string; xp: number }[];
}

/**
 * Progress numbers of a state at `now` (local calendar). The single source of truth for the MCP
 * `progress()` and the extension's snapshot, so both always show the same streak and XP.
 * Persisted numbers only: freezes are applied by `Coach.rollover()`.
 */
export function progressOf(state: State, now: Date): ProgressNumbers {
  const today = toLocalDate(now);
  return {
    streak: computeStreak({ log: state.log, today, freezeUsedDates: state.freezeUsedDates ?? [] }),
    totalXp: state.log.reduce((sum, e) => sum + e.xp, 0),
    weekly: weeklyGoal(state.plans[isoWeek(now)]),
    dueCount: state.cards.filter((c) => isDue(c.srs, now)).length,
    todayXp: dailyXp(state.log, today),
    dailyGoalXp: state.profile?.dailyGoalXp ?? DEFAULT_DAILY_GOAL,
    streakFreezes: state.streakFreezes ?? 0,
    weekXp: Array.from({ length: 7 }, (_, i) => {
      const date = addDays(today, i - 6);
      return { date, xp: dailyXp(state.log, date) };
    }),
  };
}
