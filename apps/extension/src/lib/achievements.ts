import { streak, type State } from '@langcoach/core/browser';

export type AchievementId =
  | 'first_lesson'
  | 'streak_3'
  | 'streak_7'
  | 'streak_30'
  | 'cards_50'
  | 'cards_100'
  | 'cards_500'
  | 'reviews_100';

export interface Achievement {
  id: AchievementId;
  unlocked: boolean;
  progress: number;
  goal: number;
}

export function achievements(state: State, today: string): Achievement[] {
  const lessons = state.lessons.length;
  const curStreak = streak(state.log, today);
  const cards = state.cards.length;
  const reviews = state.cards.reduce((sum, c) => sum + c.srs.reps, 0);

  const specs: readonly { id: AchievementId; raw: number; goal: number }[] = [
    { id: 'first_lesson', raw: lessons, goal: 1 },
    { id: 'streak_3', raw: curStreak, goal: 3 },
    { id: 'streak_7', raw: curStreak, goal: 7 },
    { id: 'streak_30', raw: curStreak, goal: 30 },
    { id: 'cards_50', raw: cards, goal: 50 },
    { id: 'cards_100', raw: cards, goal: 100 },
    { id: 'cards_500', raw: cards, goal: 500 },
    { id: 'reviews_100', raw: reviews, goal: 100 },
  ];

  return specs.map(({ id, raw, goal }) => ({
    id,
    unlocked: raw >= goal,
    progress: Math.min(raw, goal),
    goal,
  }));
}
