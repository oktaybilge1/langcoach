import { emptyState, newSrs, type ReviewCard, type State } from '@langcoach/core/browser';
import { describe, expect, it } from 'vitest';
import { achievements } from '../src/lib/achievements';

const TODAY = '2026-03-10';

function makeCards(count: number, repsEach = 0): ReviewCard[] {
  const srs = { ...newSrs(new Date('2026-03-01T00:00:00Z')), reps: repsEach };
  return Array.from({ length: count }, (_, i) => ({
    id: `c-${i}`,
    lessonId: 'l-1',
    term: `term-${i}`,
    translation: `trans-${i}`,
    example: '',
    srs,
  }));
}

function makeStreakLog(days: number, endDay = TODAY): State['log'] {
  const [y, m, d] = endDay.split('-').map(Number) as [number, number, number];
  return Array.from({ length: days }, (_, i) => {
    const dt = new Date(Date.UTC(y, m - 1, d - i));
    const iso = dt.toISOString().slice(0, 10);
    return { at: `${iso}T10:00:00Z`, date: iso, taskId: `t-${i}`, type: 'tiny_lesson' as const, xp: 20 };
  });
}

describe('achievements', () => {
  it('returns all 8 achievements locked on empty state', () => {
    const list = achievements(emptyState(), TODAY);
    expect(list.map((a) => a.id)).toEqual([
      'first_lesson',
      'streak_3',
      'streak_7',
      'streak_30',
      'cards_50',
      'cards_100',
      'cards_500',
      'reviews_100',
    ]);
    expect(list.every((a) => !a.unlocked && a.progress === 0)).toBe(true);
  });

  it('unlocks first_lesson at 1 lesson', () => {
    const s = emptyState();
    s.lessons.push({
      id: 'l1',
      kind: 'tiny_lesson',
      situation: 'coffee',
      items: [{ term: 'hola', translation: 'hello', example: '' }],
      createdAt: '2026-03-10T10:00:00Z',
    });
    const byId = Object.fromEntries(achievements(s, TODAY).map((a) => [a.id, a]));
    expect(byId.first_lesson).toEqual({ id: 'first_lesson', unlocked: true, progress: 1, goal: 1 });
  });

  it('unlocks streak_3, streak_7, streak_30 at exact thresholds', () => {
    for (const [days, expectedIds] of [
      [2, []],
      [3, ['streak_3']],
      [7, ['streak_3', 'streak_7']],
      [30, ['streak_3', 'streak_7', 'streak_30']],
    ] as const) {
      const s = emptyState();
      s.log = makeStreakLog(days);
      const unlocked = achievements(s, TODAY)
        .filter((a) => a.id.startsWith('streak_') && a.unlocked)
        .map((a) => a.id);
      expect(unlocked, `${days} days`).toEqual(expectedIds);
    }
  });

  it('unlocks cards_50, cards_100, cards_500 at exact thresholds', () => {
    for (const [count, expectedIds] of [
      [49, []],
      [50, ['cards_50']],
      [100, ['cards_50', 'cards_100']],
      [500, ['cards_50', 'cards_100', 'cards_500']],
    ] as const) {
      const s = emptyState();
      s.cards = makeCards(count);
      const unlocked = achievements(s, TODAY)
        .filter((a) => a.id.startsWith('cards_') && a.unlocked)
        .map((a) => a.id);
      expect(unlocked, `${count} cards`).toEqual(expectedIds);
    }
  });

  it('unlocks reviews_100 when total card reps reach 100', () => {
    const s = emptyState();
    s.cards = makeCards(20, 4); // 80 reps
    expect(achievements(s, TODAY).find((a) => a.id === 'reviews_100')).toEqual({
      id: 'reviews_100',
      unlocked: false,
      progress: 80,
      goal: 100,
    });
    s.cards = makeCards(25, 4); // 100 reps
    expect(achievements(s, TODAY).find((a) => a.id === 'reviews_100')).toEqual({
      id: 'reviews_100',
      unlocked: true,
      progress: 100,
      goal: 100,
    });
  });
});
