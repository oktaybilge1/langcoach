import type { ReviewCard } from '@langcoach/core/browser';

/** FSRS card states (ts-fsrs `State`). */
const NEW = 0;
const LEARNING = 1;
const RELEARNING = 3;

/**
 * Word strength 0–5 for the strength meter, from the card's FSRS state and stability (days until
 * recall drops to 90%): new 0; (re)learning 1; in review by stability <3 d → 2, <10 → 3, <30 → 4, else 5.
 */
export function strengthOf(card: Pick<ReviewCard, 'srs'>): number {
  const { state, reps } = card.srs;
  if (reps <= 0 || state === NEW) return 0;
  if (state === LEARNING || state === RELEARNING) return 1;
  const s = Number((card.srs as { stability?: unknown }).stability);
  if (!Number.isFinite(s) || s < 3) return 2;
  if (s < 10) return 3;
  if (s < 30) return 4;
  return 5;
}

/** Practised at least once but still fragile (strength ≤ 2). */
export function isWeak(card: Pick<ReviewCard, 'srs'>): boolean {
  return card.srs.reps > 0 && strengthOf(card) <= 2;
}
