/** Pure state of one practice session in progress: queue, re-tries, combo and per-card outcomes. */
import type { PracticeOutcome, PracticeResult } from '@langcoach/core/browser';
import type { Exercise } from './generate';

export type Attempt = 'correct' | 'almost' | 'wrong';

export type Answer =
  | { kind: 'single'; result: Attempt }
  | { kind: 'match'; perCard: Record<string, 'correct' | 'hard'> };

export interface RunItem {
  ex: Exercise;
  /** True for the one re-try of an exercise answered wrong. */
  retry: boolean;
}

export interface Run {
  queue: RunItem[];
  /** Index of the exercise on screen. */
  pos: number;
  /** Position whose answer is already applied (guards double answers). */
  answeredPos: number;
  /** Outcome per exercise id and card (a re-try replaces the first attempt). */
  outcomes: Record<string, Record<string, PracticeOutcome>>;
  /** First attempts answered right (match: without a mistake). */
  firstTryCorrect: number;
  /** Correct answers in a row. */
  combo: number;
  bestCombo: number;
  /** Original exercise count (re-tries excluded). */
  total: number;
}

export function startRun(exercises: Exercise[]): Run {
  return {
    queue: exercises.map((ex) => ({ ex, retry: false })),
    pos: 0,
    answeredPos: -1,
    outcomes: {},
    firstTryCorrect: 0,
    combo: 0,
    bestCombo: 0,
    total: exercises.length,
  };
}

export const current = (r: Run): RunItem | undefined => r.queue[r.pos];
export const isDone = (r: Run): boolean => r.pos >= r.queue.length;

const RANK: Record<PracticeOutcome, number> = { wrong: 0, hard: 1, correct: 2 };

export function applyAnswer(r: Run, a: Answer): Run {
  const item = current(r);
  if (!item || r.answeredPos === r.pos) return r;
  const { ex, retry } = item;
  const per: Record<string, PracticeOutcome> = {};
  let clean: boolean;
  let wrong = false;
  if (a.kind === 'match') {
    for (const id of ex.cardIds) per[id] = a.perCard[id] ?? 'hard';
    clean = Object.values(per).every((o) => o === 'correct');
  } else {
    const o: PracticeOutcome =
      a.result === 'wrong' ? 'wrong' : a.result === 'almost' || retry ? 'hard' : 'correct';
    for (const id of ex.cardIds) per[id] = o;
    clean = a.result === 'correct';
    wrong = a.result === 'wrong';
  }
  const queue = wrong && !retry ? [...r.queue, { ex, retry: true }] : r.queue;
  const combo = wrong ? 0 : clean ? r.combo + 1 : r.combo;
  return {
    ...r,
    queue,
    answeredPos: r.pos,
    outcomes: { ...r.outcomes, [ex.id]: per },
    firstTryCorrect: r.firstTryCorrect + (!retry && clean ? 1 : 0),
    combo,
    bestCombo: Math.max(r.bestCombo, combo),
  };
}

export function advance(r: Run): Run {
  return isDone(r) ? r : { ...r, pos: r.pos + 1 };
}

/** One result per card: its worst outcome over the session's exercises (in first-seen order). */
export function results(r: Run): PracticeResult[] {
  const byCard = new Map<string, PracticeOutcome>();
  for (const { ex } of r.queue) {
    const per = r.outcomes[ex.id];
    if (!per) continue;
    for (const id of ex.cardIds) {
      const o = per[id];
      if (!o) continue;
      const prev = byCard.get(id);
      byCard.set(id, prev === undefined || RANK[o] < RANK[prev] ? o : prev);
    }
  }
  return [...byCard].map(([cardId, outcome]) => ({ cardId, outcome }));
}

export function summary(r: Run): { accuracy: number; strengthened: number; total: number; perfect: boolean } {
  const res = results(r);
  const accuracy = r.total > 0 ? Math.round((r.firstTryCorrect / r.total) * 100) : 0;
  return {
    accuracy,
    strengthened: res.filter((x) => x.outcome !== 'wrong').length,
    total: r.total,
    perfect: r.total > 0 && r.firstTryCorrect === r.total,
  };
}
