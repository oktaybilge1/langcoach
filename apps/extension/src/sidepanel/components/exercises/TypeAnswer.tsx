import { useEffect, useRef, useState } from 'preact/hooks';
import { checkTyped, type CheckResult } from '../../../lib/practice/check';
import type { Exercise } from '../../../lib/practice/generate';
import type { TranslateFn } from '../../i18n';

export interface TypeAnswerProps {
  exercise: Exercise;
  lang: string;
  rtl?: boolean;
  /** The card's pronunciation/romanization: typing it also counts. */
  pronunciation?: string;
  t: TranslateFn;
  onAnswer: (result: CheckResult, given: string) => void;
  active: boolean;
}

const RANK: Record<CheckResult, number> = { wrong: 0, almost: 1, correct: 2 };

/** Best result of the typed text against the term's variants and its pronunciation. */
export function checkWithPronunciation(input: string, expected: string, lang: string, pronunciation?: string): CheckResult {
  let best = checkTyped(input, expected, lang);
  if (best !== 'correct' && pronunciation && pronunciation.trim()) {
    // Romanizations are Latin script: compare them language-neutrally.
    const p = checkTyped(input, pronunciation, 'und');
    if (RANK[p] > RANK[best]) best = p;
  }
  return best;
}

/** Type the word for a meaning. Enter checks; tolerant of case, accents and one-letter slips ("almost"). */
export function TypeAnswer({ exercise, lang, rtl, pronunciation, t, onAnswer, active }: TypeAnswerProps) {
  const [value, setValue] = useState('');
  const [checked, setChecked] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const langAttr = lang && lang !== 'und' ? lang : undefined;

  useEffect(() => {
    if (active) input.current?.focus();
  }, [active, exercise.id]);

  const checkedRef = useRef(false);
  function check() {
    // Read the field itself: a fast Enter right after typing must not see a stale value.
    const typed = input.current?.value ?? value;
    if (checkedRef.current || !typed.trim()) return;
    checkedRef.current = true;
    setChecked(true);
    onAnswer(checkWithPronunciation(typed, exercise.answer as string, lang, pronunciation), typed);
  }

  return (
    <div class="ex ex-type">
      <p class="ex-ask">{t('pxAskType')}</p>
      <div class="ex-prompt">
        <span class="prompt-term prompt-meaning" data-testid="prompt-meaning" dir="auto">
          {exercise.prompt.meaning}
        </span>
      </div>
      <input
        ref={input}
        type="text"
        class="type-input"
        data-testid="type-input"
        lang={langAttr}
        dir="auto"
        style={rtl ? { textAlign: 'right' } : undefined}
        autocomplete="off"
        autocapitalize="off"
        spellcheck={false}
        aria-label={t('pxTypePlaceholder')}
        placeholder={t('pxTypePlaceholder')}
        value={value}
        disabled={checked}
        onInput={(e) => setValue((e.currentTarget as HTMLInputElement).value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.repeat) {
            e.preventDefault();
            check();
          }
        }}
      />
      <button type="button" class="primary btn-check" data-testid="btn-check" disabled={checked || !value.trim()} onClick={check}>
        {t('pxCheck')}
      </button>
    </div>
  );
}
