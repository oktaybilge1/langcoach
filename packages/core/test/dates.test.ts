import { describe, expect, test } from 'vitest';
import { isoWeek, toLocalDate, weekDates } from '../src/dates.js';

describe('dates', () => {
  test('isoWeek', () => {
    expect(isoWeek(new Date(2026, 9, 20))).toBe('2026-W43');
    expect(isoWeek(new Date(2027, 0, 1))).toBe('2026-W53');
    expect(isoWeek(new Date(2027, 0, 4))).toBe('2027-W01');
  });
  test('weekDates', () => {
    expect(weekDates('2026-W43')).toEqual([
      '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25',
    ]);
  });
  test('toLocalDate uses local calendar date', () => {
    expect(toLocalDate(new Date(2026, 9, 20, 23, 59))).toBe('2026-10-20');
  });
});
