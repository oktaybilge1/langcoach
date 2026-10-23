import { Fragment } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { Exercise } from '../../../lib/practice/generate';
import type { TranslateFn } from '../../i18n';
import { isTypingTarget } from './keys';

export interface ChoiceProps {
  exercise: Exercise;
  /** Target-language BCP-47 for `lang` on target text. */
  lang: string;
  t: TranslateFn;
  canSpeak: boolean;
  onSpeak: (text: string) => void;
  onAnswer: (result: 'correct' | 'wrong', given: string) => void;
  /** Keyboard shortcuts only while the Practice tab is visible. */
  active: boolean;
}

const BLANK = '____';

/** Meaning / reverse / listen / blank: pick one of four, then Check. Keys 1–4 select, Enter checks. */
export function Choice({ exercise, lang, t, canSpeak, onSpeak, onAnswer, active }: ChoiceProps) {
  const options = exercise.options ?? [];
  const answer = exercise.answer as string;
  const [selected, setSelectedState] = useState<number | null>(null);
  const [checked, setChecked] = useState(false);
  // Refs mirror the state so key presses in quick succession (1 then Enter) see the latest values.
  const selectedRef = useRef<number | null>(null);
  const checkedRef = useRef(false);
  const setSelected = (i: number | null) => {
    if (checkedRef.current) return;
    selectedRef.current = i;
    setSelectedState(i);
  };
  const { kind, prompt } = exercise;
  const targetOptions = kind !== 'meaning';
  const langAttr = lang && lang !== 'und' ? lang : undefined;

  // Listening exercises play once when they appear.
  useEffect(() => {
    if (kind === 'listen' && prompt.speak) onSpeak(prompt.speak);
  }, [exercise.id]);

  function check() {
    const idx = selectedRef.current;
    if (checkedRef.current || idx === null) return;
    const given = options[idx] ?? '';
    checkedRef.current = true;
    setChecked(true);
    onAnswer(given === answer ? 'correct' : 'wrong', given);
  }

  useLayoutEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (checkedRef.current) return;
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || isTypingTarget(e.target)) return;
      const n = Number(e.key);
      if (Number.isInteger(n) && n >= 1 && n <= options.length) {
        e.preventDefault();
        setSelected(n - 1);
        return;
      }
      if (e.key === 'Enter' && selectedRef.current !== null && !e.repeat) {
        e.preventDefault();
        check();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, exercise.id]);

  const ask =
    kind === 'meaning'
      ? t('pxAskMeaning')
      : kind === 'reverse'
        ? t('pxAskReverse')
        : kind === 'listen'
          ? t('pxAskListen')
          : t('pxAskBlank');

  return (
    <div class="ex ex-choice">
      <p class="ex-ask">{ask}</p>
      <div class="ex-prompt">
        {kind === 'meaning' && (
          <div class="prompt-row">
            <span class="prompt-term" data-testid="prompt-term" lang={langAttr} dir="auto">
              {prompt.term}
            </span>
            {canSpeak && prompt.speak && (
              <button
                type="button"
                class="icon-btn speak-btn"
                aria-label={t('btnListen')}
                title={t('btnListen')}
                onClick={() => onSpeak(prompt.speak!)}
              >
                🔊
              </button>
            )}
          </div>
        )}
        {kind === 'meaning' && prompt.pronunciation && <div class="prompt-pron">{prompt.pronunciation}</div>}
        {kind === 'reverse' && (
          <span class="prompt-term prompt-meaning" data-testid="prompt-meaning" dir="auto">
            {prompt.meaning}
          </span>
        )}
        {kind === 'listen' && (
          <button
            type="button"
            class="play-big"
            data-testid="btn-play"
            aria-label={t('btnListen')}
            onClick={() => prompt.speak && onSpeak(prompt.speak)}
          >
            🔊
          </button>
        )}
        {kind === 'blank' && (
          <>
            <p class="prompt-sentence" data-testid="prompt-sentence" lang={langAttr} dir="auto">
              {(prompt.sentence ?? '').split(BLANK).map((part, i) => (
                <Fragment key={i}>
                  {i > 0 && (
                    <span class="gap" aria-label={t('pxBlankGap')}>
                      {'  '}
                    </span>
                  )}
                  {part}
                </Fragment>
              ))}
            </p>
            {prompt.meaning && (
              <p class="prompt-hint muted" dir="auto">
                {prompt.meaning}
              </p>
            )}
          </>
        )}
      </div>

      <div class="option-grid" role="group" aria-label={ask}>
        {options.map((opt, i) => {
          const isAnswer = opt === answer;
          const state = checked ? (isAnswer ? ' is-correct' : i === selected ? ' is-wrong' : ' is-dim') : '';
          return (
            <button
              key={`${exercise.id}-${i}`}
              type="button"
              class={`option${selected === i ? ' is-selected' : ''}${state}`}
              data-testid={`choice-option-${i}`}
              aria-pressed={selected === i ? 'true' : 'false'}
              disabled={checked}
              onClick={() => setSelected(i)}
            >
              <span class="option-key" aria-hidden="true">
                {i + 1}
              </span>
              <span class="option-text" lang={targetOptions ? langAttr : undefined} dir="auto">
                {opt}
              </span>
            </button>
          );
        })}
      </div>

      <button
        type="button"
        class="primary btn-check"
        data-testid="btn-check"
        disabled={selected === null || checked}
        onClick={() => check()}
      >
        {t('pxCheck')}
      </button>
    </div>
  );
}
