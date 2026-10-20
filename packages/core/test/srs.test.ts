import { describe, expect, test } from 'vitest';
import { isDue, newSrs, reviewSrs, type Rating } from '../src/index.js';

const now = new Date('2026-10-20T09:00:00.000Z');
const STATE_REVIEW = 2;

/** Rate Easy from new, then review again at due time until the card is in Review state. */
function toReviewState() {
  let s = reviewSrs(newSrs(now), 4, now);
  for (let i = 0; i < 5 && s.state !== STATE_REVIEW; i++) s = reviewSrs(s, 4, new Date(s.due));
  expect(s.state).toBe(STATE_REVIEW);
  return s;
}

describe('srs', () => {
  test('new card is due immediately', () => {
    expect(isDue(newSrs(now), now)).toBe(true);
  });

  test('Good pushes due into the future', () => {
    const s = reviewSrs(newSrs(now), 3, now);
    expect(isDue(s, now)).toBe(false);
    expect(s.reps).toBe(1);
  });

  test('Again on a Review card increments lapses and is due sooner than Easy', () => {
    const s = toReviewState();
    const at = new Date(s.due);
    const again = reviewSrs(s, 1, at);
    const easy = reviewSrs(s, 4, at);
    expect(again.lapses).toBe(s.lapses + 1);
    expect(new Date(again.due).getTime()).toBeLessThan(new Date(easy.due).getTime());
  });

  test('state survives JSON round trip and can be reviewed again', () => {
    const s = reviewSrs(newSrs(now), 3, now);
    const back = JSON.parse(JSON.stringify(s));
    expect(back).toEqual(s);
    const next = reviewSrs(back, 3, new Date(back.due));
    expect(next.reps).toBe(2);
  });

  test('rating outside 1..4 throws', () => {
    for (const r of [0, 5, 2.5, NaN]) {
      expect(() => reviewSrs(newSrs(now), r as Rating, now)).toThrow(/rating/i);
    }
  });
});
