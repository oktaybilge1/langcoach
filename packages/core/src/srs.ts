import { createEmptyCard, fsrs, type Card, type Grade } from 'ts-fsrs';
import type { SrsState } from './types.js';

/** 1 = Again, 2 = Hard, 3 = Good, 4 = Easy */
export type Rating = 1 | 2 | 3 | 4;

const scheduler = fsrs();

function toCard(s: SrsState): Card {
  return {
    ...s,
    due: new Date(s.due),
    last_review: s.last_review === undefined ? undefined : new Date(s.last_review),
  } as Card;
}

function fromCard(c: Card): SrsState {
  const { due, last_review, ...rest } = c;
  const out: SrsState = { ...rest, due: due.toISOString() };
  if (last_review) out.last_review = last_review.toISOString();
  return out;
}

export function newSrs(now: Date): SrsState {
  return fromCard(createEmptyCard(now));
}

export function reviewSrs(s: SrsState, rating: Rating, now: Date): SrsState {
  if (!Number.isInteger(rating) || rating < 1 || rating > 4) {
    throw new Error(`Invalid rating ${String(rating)}: must be an integer from 1 (Again) to 4 (Easy)`);
  }
  return fromCard(scheduler.next(toCard(s), now, rating as Grade).card);
}

export function isDue(s: SrsState, now: Date): boolean {
  return new Date(s.due).getTime() <= now.getTime();
}
