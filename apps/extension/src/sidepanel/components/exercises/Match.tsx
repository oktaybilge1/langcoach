import { useEffect, useRef, useState } from 'preact/hooks';
import type { Exercise } from '../../../lib/practice/generate';
import type { TranslateFn } from '../../i18n';

export interface MatchProps {
  exercise: Exercise;
  lang: string;
  t: TranslateFn;
  /** Called once when every pair is matched: correct per card unless that card had a mistake. */
  onDone: (perCard: Record<string, 'correct' | 'hard'>) => void;
  /** Each attempted pair (for sounds). */
  onPair?: (ok: boolean) => void;
}

type Side = 'term' | 'meaning';
const SHAKE_MS = 420;

/** Two columns: tap a word, then its meaning (either order). Matched pairs fade out; a wrong pair shakes. */
export function Match({ exercise, lang, t, onDone, onPair }: MatchProps) {
  const pairs = exercise.answer as [string, string][];
  const terms = exercise.prompt.terms ?? [];
  const meanings = exercise.prompt.meanings ?? [];
  const termPair = terms.map((x) => pairs.findIndex((p) => p[0] === x));
  const meaningPair = meanings.map((x) => pairs.findIndex((p) => p[1] === x));

  const [sel, setSel] = useState<{ side: Side; idx: number } | null>(null);
  const [matched, setMatched] = useState<Set<number>>(() => new Set());
  const [shake, setShake] = useState<{ side: Side; idx: number }[]>([]);
  const mistakes = useRef(new Set<string>());
  const done = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const langAttr = lang && lang !== 'und' ? lang : undefined;

  function tap(side: Side, idx: number) {
    const pairOf = side === 'term' ? termPair[idx]! : meaningPair[idx]!;
    if (done.current || matched.has(pairOf)) return;
    if (!sel || sel.side === side) {
      setSel(sel && sel.side === side && sel.idx === idx ? null : { side, idx });
      return;
    }
    const otherPair = sel.side === 'term' ? termPair[sel.idx]! : meaningPair[sel.idx]!;
    if (otherPair === pairOf) {
      const next = new Set(matched);
      next.add(pairOf);
      setMatched(next);
      setSel(null);
      onPair?.(true);
      if (next.size === pairs.length && !done.current) {
        done.current = true;
        const per: Record<string, 'correct' | 'hard'> = {};
        exercise.cardIds.forEach((id) => {
          per[id] = mistakes.current.has(id) ? 'hard' : 'correct';
        });
        onDone(per);
      }
      return;
    }
    // The card the learner started from is the one they got wrong.
    const cardId = exercise.cardIds[otherPair];
    if (cardId) mistakes.current.add(cardId);
    setShake([sel, { side, idx }]);
    setSel(null);
    onPair?.(false);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setShake([]), SHAKE_MS);
  }

  const cls = (side: Side, idx: number, pair: number) =>
    `option match-item${matched.has(pair) ? ' is-matched' : ''}${sel?.side === side && sel.idx === idx ? ' is-selected' : ''}${
      shake.some((s) => s.side === side && s.idx === idx) ? ' is-shake' : ''
    }`;

  return (
    <div class="ex ex-match">
      <p class="ex-ask">{t('pxAskMatch')}</p>
      <div class="match-grid">
        <div class="match-col" role="group" aria-label={t('pxMatchWords')}>
          {terms.map((term, i) => (
            <button
              key={`t-${i}`}
              type="button"
              class={cls('term', i, termPair[i]!)}
              data-testid={`match-term-${i}`}
              aria-pressed={sel?.side === 'term' && sel.idx === i ? 'true' : 'false'}
              disabled={matched.has(termPair[i]!)}
              lang={langAttr}
              dir="auto"
              onClick={() => tap('term', i)}
            >
              {term}
            </button>
          ))}
        </div>
        <div class="match-col" role="group" aria-label={t('pxMatchMeanings')}>
          {meanings.map((m, i) => (
            <button
              key={`m-${i}`}
              type="button"
              class={cls('meaning', i, meaningPair[i]!)}
              data-testid={`match-meaning-${i}`}
              aria-pressed={sel?.side === 'meaning' && sel.idx === i ? 'true' : 'false'}
              disabled={matched.has(meaningPair[i]!)}
              dir="auto"
              onClick={() => tap('meaning', i)}
            >
              {m}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
