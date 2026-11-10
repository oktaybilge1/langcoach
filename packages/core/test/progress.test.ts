import { describe, expect, test } from 'vitest';
import { streak, weeklyGoal, xpFor } from '../src/progress.js';
import type { LogEntry, PlanTask, WeekPlan } from '../src/types.js';

const entry = (date: string, taskId = 't'): LogEntry => ({
  at: `${date}T10:00:00.000Z`,
  date,
  taskId,
  type: 'quiz',
  xp: 30,
});

const task = (id: string, date: string, status: 'todo' | 'done'): PlanTask => ({
  id,
  date,
  type: 'tiny_lesson',
  minutes: 10,
  status,
});

describe('xpFor', () => {
  test('per task type', () => {
    expect(xpFor('tiny_lesson')).toBe(20);
    expect(xpFor('slang_hang')).toBe(20);
    expect(xpFor('quiz')).toBe(30);
    expect(xpFor('review', 12)).toBe(22);
    expect(xpFor('review')).toBe(10);
  });
});

describe('streak', () => {
  test('streak counts consecutive days ending today', () => {
    const log = [entry('2026-10-18'), entry('2026-10-19'), entry('2026-10-20')];
    expect(streak(log, '2026-10-20')).toBe(3);
  });
  test('streak still counts up to yesterday when today has no activity yet', () => {
    expect(streak([entry('2026-10-18'), entry('2026-10-19')], '2026-10-20')).toBe(2);
  });
  test('gap of one full day resets streak to 0', () => {
    expect(streak([entry('2026-10-18')], '2026-10-20')).toBe(0);
  });
  test('several entries on one day count once', () => {
    const log = [entry('2026-10-19', 'a'), entry('2026-10-19', 'b'), entry('2026-10-20', 'c')];
    expect(streak(log, '2026-10-20')).toBe(2);
  });
  test('is DST-safe across month/year and DST boundaries', () => {
    const log = [entry('2026-03-28'), entry('2026-03-29'), entry('2026-03-30'), entry('2025-12-31'), entry('2026-01-01')];
    expect(streak(log, '2026-03-30')).toBe(3);
    expect(streak(log, '2026-01-01')).toBe(2);
  });
});

describe('weeklyGoal', () => {
  test('a study day is done when all its tasks are done; undefined plan → {0,0}', () => {
    expect(weeklyGoal(undefined)).toEqual({ done: 0, planned: 0 });
    const plan: WeekPlan = {
      week: '2026-W43',
      theme: 'x',
      tasks: [
        task('1', '2026-10-19', 'done'),
        task('2', '2026-10-19', 'done'),
        task('3', '2026-10-20', 'done'),
        task('4', '2026-10-20', 'todo'),
        task('5', '2026-10-21', 'todo'),
      ],
    };
    expect(weeklyGoal(plan)).toEqual({ done: 1, planned: 3 });
  });
});
