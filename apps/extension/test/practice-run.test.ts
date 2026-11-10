import { describe, expect, it } from 'vitest';
import type { Exercise } from '../src/lib/practice/generate';
import { advance, applyAnswer, current, isDone, results, startRun, summary } from '../src/lib/practice/run';

const single = (id: string, cardId: string, kind: Exercise['kind'] = 'meaning'): Exercise => ({
  id,
  kind,
  cardIds: [cardId],
  prompt: { term: cardId },
  options: ['a', 'b', 'c', 'd'],
  answer: 'a',
});
const match = (id: string, cardIds: string[]): Exercise => ({
  id,
  kind: 'match',
  cardIds,
  prompt: { terms: cardIds, meanings: cardIds },
  answer: cardIds.map((c) => [c, c] as [string, string]),
});

describe('practice run (pure session state)', () => {
  it('walks the exercises in order and ends', () => {
    let r = startRun([single('e1', 'c1'), single('e2', 'c2')]);
    expect(current(r)?.ex.id).toBe('e1');
    r = advance(applyAnswer(r, { kind: 'single', result: 'correct' }));
    expect(current(r)?.ex.id).toBe('e2');
    r = advance(applyAnswer(r, { kind: 'single', result: 'correct' }));
    expect(isDone(r)).toBe(true);
    expect(results(r)).toEqual([
      { cardId: 'c1', outcome: 'correct' },
      { cardId: 'c2', outcome: 'correct' },
    ]);
    expect(summary(r)).toEqual({ accuracy: 100, strengthened: 2, total: 2, perfect: true });
  });

  it('re-queues a wrong answer once at the end; a correct retry counts as hard', () => {
    let r = startRun([single('e1', 'c1'), single('e2', 'c2')]);
    r = advance(applyAnswer(r, { kind: 'single', result: 'wrong' }));
    expect(r.queue).toHaveLength(3);
    r = advance(applyAnswer(r, { kind: 'single', result: 'correct' }));
    const retry = current(r)!;
    expect(retry.ex.id).toBe('e1');
    expect(retry.retry).toBe(true);
    r = advance(applyAnswer(r, { kind: 'single', result: 'correct' }));
    expect(isDone(r)).toBe(true);
    expect(results(r)).toEqual([
      { cardId: 'c1', outcome: 'hard' },
      { cardId: 'c2', outcome: 'correct' },
    ]);
    expect(summary(r)).toEqual({ accuracy: 50, strengthened: 2, total: 2, perfect: false });
  });

  it('a wrong retry stays wrong and is not re-queued again', () => {
    let r = startRun([single('e1', 'c1')]);
    r = advance(applyAnswer(r, { kind: 'single', result: 'wrong' }));
    r = advance(applyAnswer(r, { kind: 'single', result: 'wrong' }));
    expect(isDone(r)).toBe(true);
    expect(r.queue).toHaveLength(2);
    expect(results(r)).toEqual([{ cardId: 'c1', outcome: 'wrong' }]);
    expect(summary(r).strengthened).toBe(0);
  });

  it("'almost' counts as hard and is not re-queued", () => {
    let r = startRun([single('e1', 'c1', 'type')]);
    r = advance(applyAnswer(r, { kind: 'single', result: 'almost' }));
    expect(isDone(r)).toBe(true);
    expect(results(r)).toEqual([{ cardId: 'c1', outcome: 'hard' }]);
    expect(summary(r).accuracy).toBe(0);
  });

  it('a card seen in several exercises keeps its worst final outcome', () => {
    let r = startRun([single('e1', 'c1'), single('e2', 'c1', 'reverse')]);
    r = advance(applyAnswer(r, { kind: 'single', result: 'correct' }));
    r = advance(applyAnswer(r, { kind: 'single', result: 'almost' }));
    expect(results(r)).toEqual([{ cardId: 'c1', outcome: 'hard' }]);
  });

  it('match reports an outcome per card and never re-queues', () => {
    let r = startRun([match('m', ['c1', 'c2', 'c3', 'c4', 'c5'])]);
    r = advance(
      applyAnswer(r, { kind: 'match', perCard: { c1: 'correct', c2: 'hard', c3: 'correct', c4: 'correct', c5: 'correct' } }),
    );
    expect(isDone(r)).toBe(true);
    expect(results(r)).toEqual([
      { cardId: 'c1', outcome: 'correct' },
      { cardId: 'c2', outcome: 'hard' },
      { cardId: 'c3', outcome: 'correct' },
      { cardId: 'c4', outcome: 'correct' },
      { cardId: 'c5', outcome: 'correct' },
    ]);
    expect(summary(r).accuracy).toBe(0); // a match with a mistake is not a first-try success
  });

  it('counts the combo: correct answers in a row, reset by a wrong one', () => {
    let r = startRun([single('e1', 'c1'), single('e2', 'c2'), single('e3', 'c3'), single('e4', 'c4')]);
    r = advance(applyAnswer(r, { kind: 'single', result: 'correct' }));
    r = advance(applyAnswer(r, { kind: 'single', result: 'correct' }));
    r = applyAnswer(r, { kind: 'single', result: 'correct' });
    expect(r.combo).toBe(3);
    r = advance(r);
    r = applyAnswer(r, { kind: 'single', result: 'wrong' });
    expect(r.combo).toBe(0);
    expect(r.bestCombo).toBe(3);
  });

  it('applying an answer twice to the same position is ignored', () => {
    let r = startRun([single('e1', 'c1')]);
    r = applyAnswer(r, { kind: 'single', result: 'correct' });
    const again = applyAnswer(r, { kind: 'single', result: 'wrong' });
    expect(again).toBe(r);
  });
});
