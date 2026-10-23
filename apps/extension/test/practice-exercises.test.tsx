// @vitest-environment jsdom
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Exercise } from '../src/lib/practice/generate';
import { Choice } from '../src/sidepanel/components/exercises/Choice';
import { Match } from '../src/sidepanel/components/exercises/Match';
import { TypeAnswer } from '../src/sidepanel/components/exercises/TypeAnswer';
import { createTranslator } from '../src/sidepanel/i18n';

const { t } = createTranslator('en');
let host: HTMLDivElement;

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
});
afterEach(() => {
  render(null, host);
  host.remove();
});

const $ = (sel: string) => host.querySelector<HTMLElement>(sel);
const $$ = (sel: string) => [...host.querySelectorAll<HTMLElement>(sel)];
const click = async (el: Element | null) => {
  expect(el).not.toBeNull();
  await act(async () => {
    (el as HTMLElement).click();
  });
};
const key = async (k: string, target: EventTarget = window) => {
  await act(async () => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
  });
};

const meaningEx: Exercise = {
  id: 'x1',
  kind: 'meaning',
  cardIds: ['c1'],
  prompt: { term: 'la cuenta', pronunciation: 'lah KWEN-tah', speak: 'la cuenta' },
  options: ['the table', 'the bill', 'the menu', 'the water'],
  answer: 'the bill',
};
const reverseEx: Exercise = {
  id: 'x2',
  kind: 'reverse',
  cardIds: ['c1'],
  prompt: { meaning: 'the bill' },
  options: ['la mesa', 'el menú', 'la cuenta', 'el agua'],
  answer: 'la cuenta',
};

describe('Choice exercise', () => {
  it('renders the prompt in the target language and 4 options; Check is disabled until a choice', async () => {
    const onAnswer = vi.fn();
    await act(async () => {
      render(<Choice exercise={meaningEx} lang="es-ES" t={t} canSpeak={false} onSpeak={() => {}} onAnswer={onAnswer} active />, host);
    });
    const term = $('[data-testid="prompt-term"]')!;
    expect(term.textContent).toContain('la cuenta');
    expect(term.getAttribute('lang')).toBe('es-ES');
    expect(term.getAttribute('dir')).toBe('auto');
    expect($$('[data-testid^="choice-option-"]')).toHaveLength(4);
    expect(($('[data-testid="btn-check"]') as HTMLButtonElement).disabled).toBe(true);
    await click($('[data-testid="btn-check"]'));
    expect(onAnswer).not.toHaveBeenCalled();
  });

  it('select then Check reports correct', async () => {
    const onAnswer = vi.fn();
    await act(async () => {
      render(<Choice exercise={meaningEx} lang="es-ES" t={t} canSpeak={false} onSpeak={() => {}} onAnswer={onAnswer} active />, host);
    });
    await click($('[data-testid="choice-option-1"]'));
    expect($('[data-testid="choice-option-1"]')!.getAttribute('aria-pressed')).toBe('true');
    await click($('[data-testid="btn-check"]'));
    expect(onAnswer).toHaveBeenCalledWith('correct', 'the bill');
    // locked afterwards: the right option is marked, a second Check does nothing
    expect($('[data-testid="choice-option-1"]')!.className).toContain('is-correct');
    await click($('[data-testid="btn-check"]'));
    expect(onAnswer).toHaveBeenCalledTimes(1);
  });

  it('keys 1-4 select and Enter checks; a wrong choice reports wrong and marks the right one', async () => {
    const onAnswer = vi.fn();
    await act(async () => {
      render(<Choice exercise={reverseEx} lang="es-ES" t={t} canSpeak={false} onSpeak={() => {}} onAnswer={onAnswer} active />, host);
    });
    // target-language options carry lang + dir
    expect($('[data-testid="choice-option-0"] .option-text')!.getAttribute('lang')).toBe('es-ES');
    await key('1');
    expect($('[data-testid="choice-option-0"]')!.getAttribute('aria-pressed')).toBe('true');
    await key('Enter');
    expect(onAnswer).toHaveBeenCalledWith('wrong', 'la mesa');
    expect($('[data-testid="choice-option-0"]')!.className).toContain('is-wrong');
    expect($('[data-testid="choice-option-2"]')!.className).toContain('is-correct');
  });

  it('ignores keys while inactive', async () => {
    const onAnswer = vi.fn();
    await act(async () => {
      render(<Choice exercise={reverseEx} lang="es-ES" t={t} canSpeak={false} onSpeak={() => {}} onAnswer={onAnswer} active={false} />, host);
    });
    await key('3');
    await key('Enter');
    expect(onAnswer).not.toHaveBeenCalled();
  });

  it('listen plays the audio on demand and blank shows the sentence', async () => {
    const onSpeak = vi.fn();
    const listen: Exercise = { ...reverseEx, id: 'x3', kind: 'listen', prompt: { speak: 'la cuenta' } };
    await act(async () => {
      render(<Choice exercise={listen} lang="es-ES" t={t} canSpeak onSpeak={onSpeak} onAnswer={() => {}} active />, host);
    });
    expect(onSpeak).toHaveBeenCalledWith('la cuenta'); // auto-plays once
    await click($('[data-testid="btn-play"]'));
    expect(onSpeak).toHaveBeenCalledTimes(2);

    const blank: Exercise = { ...reverseEx, id: 'x4', kind: 'blank', prompt: { sentence: '¿Me trae ____, por favor?', meaning: 'the bill' } };
    await act(async () => {
      render(<Choice exercise={blank} lang="es-ES" t={t} canSpeak={false} onSpeak={() => {}} onAnswer={() => {}} active />, host);
    });
    const s = $('[data-testid="prompt-sentence"]')!;
    expect(s.textContent).toContain('¿Me trae');
    expect(s.getAttribute('lang')).toBe('es-ES');
  });
});

describe('Match exercise', () => {
  const pairs: [string, string][] = [
    ['uno', 'one'],
    ['dos', 'two'],
    ['tres', 'three'],
    ['cuatro', 'four'],
    ['cinco', 'five'],
  ];
  const matchEx: Exercise = {
    id: 'm1',
    kind: 'match',
    cardIds: ['c1', 'c2', 'c3', 'c4', 'c5'],
    prompt: { terms: ['tres', 'uno', 'cinco', 'dos', 'cuatro'], meanings: ['five', 'one', 'four', 'three', 'two'] },
    answer: pairs,
  };
  const termBtn = (s: string) => $$('[data-testid^="match-term-"]').find((b) => b.textContent === s)!;
  const meaningBtn = (s: string) => $$('[data-testid^="match-meaning-"]').find((b) => b.textContent === s)!;

  it('pairs fade out when matched; a wrong pair shakes; outcome is per card', async () => {
    const onDone = vi.fn();
    const onPair = vi.fn();
    await act(async () => {
      render(<Match exercise={matchEx} lang="es-ES" t={t} onDone={onDone} onPair={onPair} active />, host);
    });
    expect(termBtn('uno').getAttribute('lang')).toBe('es-ES');
    await click(termBtn('uno'));
    await click(meaningBtn('one'));
    expect(onPair).toHaveBeenLastCalledWith(true);
    expect(termBtn('uno').className).toContain('is-matched');
    expect((termBtn('uno') as HTMLButtonElement).disabled).toBe(true);

    await click(termBtn('dos'));
    await click(meaningBtn('three'));
    expect(onPair).toHaveBeenLastCalledWith(false);
    expect(termBtn('dos').className).toContain('is-shake');
    expect(termBtn('dos').className).not.toContain('is-matched');

    // meaning first works too
    await click(meaningBtn('two'));
    await click(termBtn('dos'));
    await click(termBtn('tres'));
    await click(meaningBtn('three'));
    await click(termBtn('cuatro'));
    await click(meaningBtn('four'));
    expect(onDone).not.toHaveBeenCalled();
    await click(termBtn('cinco'));
    await click(meaningBtn('five'));
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledWith({ c1: 'correct', c2: 'hard', c3: 'correct', c4: 'correct', c5: 'correct' });
  });

  it('tapping the same column twice switches the selection', async () => {
    const onPair = vi.fn();
    await act(async () => {
      render(<Match exercise={matchEx} lang="es-ES" t={t} onDone={() => {}} onPair={onPair} active />, host);
    });
    await click(termBtn('uno'));
    await click(termBtn('dos'));
    expect(termBtn('dos').getAttribute('aria-pressed')).toBe('true');
    expect(termBtn('uno').getAttribute('aria-pressed')).toBe('false');
    expect(onPair).not.toHaveBeenCalled();
  });
});

describe('Type exercise', () => {
  const typeEx: Exercise = { id: 't1', kind: 'type', cardIds: ['c1'], prompt: { meaning: 'the waitress' }, answer: 'la camarera' };
  const typeInto = async (value: string) => {
    const input = $('[data-testid="type-input"]') as HTMLInputElement;
    await act(async () => {
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    return input;
  };

  it('autofocuses the input with lang/dir and checks on Enter', async () => {
    const onAnswer = vi.fn();
    await act(async () => {
      render(<TypeAnswer exercise={typeEx} lang="es-ES" t={t} onAnswer={onAnswer} active />, host);
    });
    const input = $('[data-testid="type-input"]') as HTMLInputElement;
    expect(document.activeElement).toBe(input);
    expect(input.getAttribute('lang')).toBe('es-ES');
    expect(input.getAttribute('dir')).toBe('auto');
    await typeInto('La Camarera');
    await key('Enter', input);
    expect(onAnswer).toHaveBeenCalledWith('correct', 'La Camarera');
    expect(input.disabled).toBe(true);
  });

  it("reports 'almost' for a one-letter slip", async () => {
    const onAnswer = vi.fn();
    await act(async () => {
      render(<TypeAnswer exercise={typeEx} lang="es-ES" t={t} onAnswer={onAnswer} active />, host);
    });
    await typeInto('la camarara');
    await click($('[data-testid="btn-check"]'));
    expect(onAnswer).toHaveBeenCalledWith('almost', 'la camarara');
  });

  it('accepts the pronunciation (romanization) as a correct answer', async () => {
    const onAnswer = vi.fn();
    const ja: Exercise = { id: 't2', kind: 'type', cardIds: ['c2'], prompt: { meaning: 'thank you' }, answer: 'ありがとう' };
    await act(async () => {
      render(<TypeAnswer exercise={ja} lang="ja" pronunciation="arigatou" t={t} onAnswer={onAnswer} active />, host);
    });
    await typeInto('Arigatou');
    await click($('[data-testid="btn-check"]'));
    expect(onAnswer).toHaveBeenCalledWith('correct', 'Arigatou');
  });

  it('a wrong answer reports wrong; an empty answer is not checked', async () => {
    const onAnswer = vi.fn();
    await act(async () => {
      render(<TypeAnswer exercise={typeEx} lang="es-ES" t={t} onAnswer={onAnswer} active />, host);
    });
    await click($('[data-testid="btn-check"]'));
    expect(onAnswer).not.toHaveBeenCalled();
    await typeInto('el perro');
    await click($('[data-testid="btn-check"]'));
    expect(onAnswer).toHaveBeenCalledWith('wrong', 'el perro');
  });
});
