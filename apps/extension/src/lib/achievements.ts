import { computeStreak, type PracticeSession, type State } from '@langcoach/core/browser';

export type AchievementId =
  | 'first_lesson'
  | 'streak_3'
  | 'streak_7'
  | 'streak_30'
  | 'cards_50'
  | 'cards_100'
  | 'cards_500'
  | 'reviews_100'
  | 'perfect_session'
  | 'xp_100_day'
  | 'sessions_10'
  | 'first_match';

export interface Achievement {
  id: AchievementId;
  unlocked: boolean;
  progress: number;
  goal: number;
}

/** Sessions recorded before the `perfect` flag existed: perfect iff XP = correct + 5 + 5. */
const wasPerfect = (s: PracticeSession) => s.perfect ?? (s.exercises > 0 && s.xp === s.correct + 10);

function bestDayXp(log: State['log']): number {
  const byDate = new Map<string, number>();
  for (const e of log) byDate.set(e.date, (byDate.get(e.date) ?? 0) + e.xp);
  return Math.max(0, ...byDate.values());
}

export function achievements(state: State, today: string): Achievement[] {
  const lessons = state.lessons.length;
  // Same streak as the panel header (freeze-protected days count).
  const curStreak = computeStreak({ log: state.log, today, freezeUsedDates: state.freezeUsedDates ?? [] });
  const cards = state.cards.length;
  const reviews = state.cards.reduce((sum, c) => sum + c.srs.reps, 0);
  const sessions = state.sessions ?? [];
  // The log keeps every rewarded session even after the 500 kept session records.
  const sessionCount = Math.max(sessions.length, state.log.filter((e) => e.taskId.startsWith('practice:')).length);

  const specs: readonly { id: AchievementId; raw: number; goal: number }[] = [
    { id: 'first_lesson', raw: lessons, goal: 1 },
    { id: 'streak_3', raw: curStreak, goal: 3 },
    { id: 'streak_7', raw: curStreak, goal: 7 },
    { id: 'streak_30', raw: curStreak, goal: 30 },
    { id: 'cards_50', raw: cards, goal: 50 },
    { id: 'cards_100', raw: cards, goal: 100 },
    { id: 'cards_500', raw: cards, goal: 500 },
    { id: 'reviews_100', raw: reviews, goal: 100 },
    { id: 'perfect_session', raw: sessions.some(wasPerfect) ? 1 : 0, goal: 1 },
    { id: 'xp_100_day', raw: bestDayXp(state.log), goal: 100 },
    { id: 'sessions_10', raw: sessionCount, goal: 10 },
    { id: 'first_match', raw: sessions.some((s) => (s.matchGames ?? 0) > 0) ? 1 : 0, goal: 1 },
  ];

  return specs.map(({ id, raw, goal }) => ({
    id,
    unlocked: raw >= goal,
    progress: Math.min(raw, goal),
    goal,
  }));
}
