import { describe, expect, it } from 'vitest';
import { achievements, emptyState, levelFor, strengthOf } from '../src/browser.js';

describe('progress rules in core', () => {
  it('levelFor maps xp to levels', () => {
    expect(levelFor(0).level).toBe(1);
    expect(levelFor(150).level).toBe(3);
    expect(levelFor(99999).toNext).toBe(0);
  });
  it('achievements start locked', () => {
    const list = achievements(emptyState(), '2026-11-10');
    expect(list).toHaveLength(12);
    expect(list.every((a) => !a.unlocked)).toBe(true);
  });
  it('strengthOf a new card is 0', () => {
    expect(strengthOf({ srs: { state: 0, reps: 0 } } as never)).toBe(0);
  });
});
