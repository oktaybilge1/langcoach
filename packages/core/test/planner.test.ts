import { describe, expect, test } from 'vitest';
import { buildWeekPlan } from '../src/planner.js';
import type { Profile } from '../src/types.js';

const profile = (daysPerWeek: number, minutesPerDay = 20): Profile => ({
  nativeLanguage: 'en',
  targetLanguage: 'es',
  level: 'A2',
  goal: 'travel',
  minutesPerDay,
  daysPerWeek,
  createdAt: '2026-10-19',
});

const WEEK = '2026-W43';
const plan = (n: number, m = 20) => {
  let c = 0;
  return buildWeekPlan(profile(n, m), WEEK, 'Food', () => `id-${++c}`);
};
const dates = (p: ReturnType<typeof plan>) => [...new Set(p.tasks.map((t) => t.date))];
const mainTypes = (p: ReturnType<typeof plan>) => p.tasks.filter((t) => t.type !== 'review').map((t) => t.type);

describe('buildWeekPlan', () => {
  test('3 days/week → Mon, Wed, Fri', () =>
    expect(dates(plan(3))).toEqual(['2026-10-19', '2026-10-21', '2026-10-23']));

  test('7 days/week → every day, last day quiz', () => {
    const p = plan(7);
    expect(dates(p)).toEqual([
      '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25',
    ]);
    expect(mainTypes(p).at(-1)).toBe('quiz');
  });

  test('1 day/week → Monday, single tiny_lesson, no review, no quiz', () => {
    const p = plan(1);
    expect(p.tasks).toHaveLength(1);
    expect(p.tasks[0]).toMatchObject({ date: '2026-10-19', type: 'tiny_lesson' });
  });

  test('main types alternate tiny_lesson, slang_hang; last is quiz', () =>
    expect(mainTypes(plan(4))).toEqual(['tiny_lesson', 'slang_hang', 'tiny_lesson', 'quiz']));

  test('m=20 → review 6, main 14; m=5 → review 5, main 5', () => {
    const a = plan(2, 20).tasks;
    expect(a.map((t) => [t.type, t.minutes])).toEqual([['tiny_lesson', 20], ['review', 6], ['quiz', 14]]);
    const b = plan(2, 5).tasks;
    expect(b.map((t) => [t.type, t.minutes])).toEqual([['tiny_lesson', 5], ['review', 5], ['quiz', 5]]);
  });

  test('first study day has no review task', () => {
    const p = plan(3);
    expect(p.tasks.filter((t) => t.date === '2026-10-19').map((t) => t.type)).toEqual(['tiny_lesson']);
    expect(p.tasks.filter((t) => t.date === '2026-10-21').map((t) => t.type)).toEqual(['review', 'slang_hang']);
  });

  test('all tasks status todo, unique ids, theme and week copied', () => {
    const p = plan(5);
    expect(p.week).toBe(WEEK);
    expect(p.theme).toBe('Food');
    expect(p.tasks.every((t) => t.status === 'todo')).toBe(true);
    expect(new Set(p.tasks.map((t) => t.id)).size).toBe(p.tasks.length);
  });
});
