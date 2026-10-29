// @vitest-environment jsdom
import { emptyState, newSrs, type ReviewCard } from '@langcoach/core/browser';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildSession, type Exercise } from '../src/lib/practice/generate';
import { expectedVariants } from '../src/lib/practice/check';
import type { Message, MessageMap, MessageType, ResponseOf, Snapshot } from '../src/shared/messages';
import type { PanelSend } from '../src/sidepanel/App';
import { createTranslator } from '../src/sidepanel/i18n';
import { Practice, type PracticeDeps } from '../src/sidepanel/views/Practice';

const { t } = createTranslator('en');
const NOW = new Date('2026-03-04T10:00:00Z');
const SEED = 42;

const profile = {
  nativeLanguage: 'English',
  targetLanguage: 'Spanish (Spain)',
  level: 'A2' as const,
  goal: 'travel',
  minutesPerDay: 15,
  daysPerWeek: 5,
  createdAt: '2026-03-01T10:00:00Z',
};

const card = (id: string, term: string, translation: string, example: string): ReviewCard => ({
  id,
  lessonId: 'l1',
  term,
  translation,
  example,
  srs: newSrs(new Date('2026-03-01T00:00:00Z')),
});

const CARDS = [
  card('c1', 'la cuenta', 'the bill', '¿Me trae la cuenta, por favor?'),
  card('c2', 'la mesa', 'the table', 'Una mesa para dos, por favor.'),
  card('c3', 'el menú', 'the menu', '¿Puedo ver el menú?'),
  card('c4', 'el agua', 'the water', 'Quiero el agua con gas.'),
];

function snapshotWith(cards: ReviewCard[]): Snapshot {
  const st = emptyState();
  st.profile = profile;
  st.cards = cards;
  return {
    profile,
    today: { date: '2026-03-04', tasks: [], planExists: true },
    plan: null,
    progress: { streak: 2, totalXp: 50, weekly: { done: 0, planned: 5 }, dueCount: cards.length, todayXp: 3, dailyGoalXp: 20 },
    dueCount: cards.length,
    lastCapture: null,
    state: st,
  };
}

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
const flush = async () => {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
};
const click = async (el: Element | null) => {
  expect(el, 'element to click').not.toBeNull();
  await act(async () => {
    (el as HTMLElement).click();
  });
  await flush();
};
const key = async (k: string) => {
  await act(async () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
  });
  await flush();
};

function harness(cards = CARDS, recordImpl?: () => Promise<unknown>) {
  const calls: Message[] = [];
  const send = vi.fn(async <K extends MessageType>(msg: { type: K } & MessageMap[K]['request']) => {
    calls.push(msg as Message);
    if (msg.type === 'getPracticeCards') return cards as ResponseOf<K>;
    if (msg.type === 'recordPractice') {
      if (recordImpl) return (await recordImpl()) as ResponseOf<K>;
      const r = (msg as MessageMap['recordPractice']['request']).results;
      const correct = r.filter((x) => x.outcome === 'correct').length;
      const perfect = r.length > 0 && r.every((x) => x.outcome === 'correct');
      return { xp: correct + 5 + (perfect ? 5 : 0), correct, total: r.length, perfect } as ResponseOf<K>;
    }
    return null as ResponseOf<K>;
  }) as unknown as PanelSend;
  const sounds = { play: vi.fn() };
  let reduced = false;
  const deps: PracticeDeps = {
    sounds,
    speech: { canSpeak: () => false, speak: vi.fn() },
    seed: () => SEED,
    uuid: () => 'session-uuid-1',
    now: () => NOW,
    reducedMotion: () => reduced,
  };
  const onRefresh = vi.fn(async () => {});
  const onDone = vi.fn();
  const mount = async (snap = snapshotWith(cards), active = true) => {
    await act(async () => {
      render(
        <Practice snapshot={snap} uiLocale="en" t={t} send={send} onRefresh={onRefresh} onDone={onDone} soundEffects active={active} deps={deps} />,
        host,
      );
    });
    await flush();
  };
  const expected = buildSession(cards, { now: NOW, seed: SEED, size: 10, canSpeak: false, nativeFirst: false, lang: 'es-ES' }) as Exercise[];
  const records = () => calls.filter((c) => c.type === 'recordPractice') as (Message & { type: 'recordPractice' })[];
  return {
    calls,
    send,
    sounds,
    deps,
    onRefresh,
    onDone,
    mount,
    expected,
    records,
    setReduced: (v: boolean) => {
      reduced = v;
    },
  };
}

function currentExercise(list: Exercise[]): Exercise {
  const el = $('[data-testid="practice-exercise"]');
  expect(el, 'an exercise on screen').not.toBeNull();
  const id = el!.getAttribute('data-exercise-id');
  const ex = list.find((e) => e.id === id);
  expect(ex, `exercise ${id}`).toBeTruthy();
  return ex!;
}

async function answer(list: Exercise[], correct: boolean) {
  const ex = currentExercise(list);
  if (ex.kind === 'match') {
    const pairs = ex.answer as [string, string][];
    for (const [term, meaning] of pairs) {
      await click($$('[data-testid^="match-term-"]').find((b) => b.textContent === term)!);
      await click($$('[data-testid^="match-meaning-"]').find((b) => b.textContent === meaning)!);
    }
    return ex;
  }
  if (ex.kind === 'type') {
    const input = $('[data-testid="type-input"]') as HTMLInputElement;
    await act(async () => {
      input.value = correct ? expectedVariants(ex.answer as string)[0]! : 'zzzz';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await click($('[data-testid="btn-check"]'));
    return ex;
  }
  const opts = $$('[data-testid^="choice-option-"]');
  const idx = ex.options!.findIndex((o) => o === ex.answer);
  const pick = correct ? idx : (idx + 1) % opts.length;
  await click(opts[pick]!);
  await click($('[data-testid="btn-check"]'));
  return ex;
}

async function runAll(h: ReturnType<typeof harness>, wrongFirst = false) {
  let first = true;
  for (let guard = 0; guard < 40 && !$('[data-testid="practice-end"]'); guard++) {
    await answer(h.expected, !(wrongFirst && first));
    first = false;
    await click($('[data-testid="btn-continue"]'));
  }
  expect($('[data-testid="practice-end"]')).not.toBeNull();
}

describe('Practice view', () => {
  it('start screen shows due and word counts, then starts a session', async () => {
    const h = harness();
    await h.mount();
    expect($('[data-testid="practice-start"]')!.textContent).toContain('4');
    expect(h.calls.some((c) => c.type === 'getPracticeCards')).toBe(false);
    await click($('[data-testid="btn-start-practice"]'));
    expect(h.calls.some((c) => c.type === 'getPracticeCards')).toBe(true);
    expect($('[data-testid="practice-exercise"]')).not.toBeNull();
    const bar = $('[data-testid="practice-progress"]')!;
    expect(bar.getAttribute('aria-valuenow')).toBe('0');
    expect(bar.getAttribute('aria-valuemax')).toBe(String(h.expected.length));
  });

  it('a perfect session records once with per-card outcomes, shows XP, accuracy and confetti', async () => {
    const h = harness();
    await h.mount();
    await click($('[data-testid="btn-start-practice"]'));
    await answer(h.expected, true);
    const fb = $('[data-testid="practice-feedback"]')!;
    expect(fb.getAttribute('data-state')).toBe('correct');
    expect(h.sounds.play).toHaveBeenCalledWith('correct');
    await click($('[data-testid="btn-continue"]'));
    expect($('[data-testid="practice-progress"]')!.getAttribute('aria-valuenow')).toBe('1');
    await runAll(h);
    await flush();
    const recs = h.records();
    expect(recs).toHaveLength(1);
    expect(recs[0]!.sessionId).toBe('session-uuid-1');
    expect(recs[0]!.results.map((r) => r.cardId).sort()).toEqual(['c1', 'c2', 'c3', 'c4']);
    expect(recs[0]!.results.every((r) => r.outcome === 'correct')).toBe(true);
    expect($('[data-testid="practice-xp"]')!.getAttribute('data-xp')).toBe('14');
    expect($('[data-testid="practice-accuracy"]')!.textContent).toContain('100%');
    expect($('[data-testid="practice-strengthened"]')!.textContent).toContain('4');
    expect($('[data-testid="confetti"]')).not.toBeNull();
    expect(h.sounds.play).toHaveBeenCalledWith('complete');
    expect(h.onRefresh).toHaveBeenCalled();
  });

  it('a wrong answer is re-queued at the end; a correct retry is recorded as hard', async () => {
    const h = harness();
    await h.mount();
    await click($('[data-testid="btn-start-practice"]'));
    const first = await answer(h.expected, false);
    expect($('[data-testid="practice-feedback"]')!.getAttribute('data-state')).toBe('wrong');
    expect(h.sounds.play).toHaveBeenCalledWith('wrong');
    expect($('[data-testid="practice-feedback"]')!.textContent).toMatch(/the bill|the table|the menu|the water|la |el /);
    expect($('[data-testid="practice-progress"]')!.getAttribute('aria-valuemax')).toBe(String(h.expected.length + 1));
    await click($('[data-testid="btn-continue"]'));
    await runAll(h);
    await flush();
    const res = h.records()[0]!.results;
    expect(res.find((r) => r.cardId === first.cardIds[0])!.outcome).toBe('hard');
    expect($('[data-testid="confetti"]')).toBeNull(); // confetti only for a session without any mistake
  });

  it('closing the panel before the end records nothing', async () => {
    const h = harness();
    await h.mount();
    await click($('[data-testid="btn-start-practice"]'));
    for (let i = 0; i < 3; i++) {
      await answer(h.expected, true);
      await click($('[data-testid="btn-continue"]'));
    }
    await act(async () => {
      render(null, host);
    });
    await flush();
    expect(h.records()).toHaveLength(0);
  });

  it('a double Continue on the last exercise and later re-renders record only once', async () => {
    const h = harness();
    await h.mount();
    await click($('[data-testid="btn-start-practice"]'));
    for (let guard = 0; guard < 40; guard++) {
      await answer(h.expected, true);
      const progress = $('[data-testid="practice-progress"]')!;
      const isLast = Number(progress.getAttribute('aria-valuenow')) + 1 === Number(progress.getAttribute('aria-valuemax'));
      const btn = $('[data-testid="btn-continue"]')!;
      if (isLast) {
        await act(async () => {
          btn.click();
          btn.click();
        });
        await key('Enter');
        break;
      }
      await click(btn);
    }
    await flush();
    expect($('[data-testid="practice-end"]')).not.toBeNull();
    await h.mount(snapshotWith(CARDS)); // the panel re-renders with a fresh snapshot
    await h.mount(snapshotWith(CARDS));
    expect(h.records()).toHaveLength(1);
  });

  it('Enter continues after feedback (keyboard only)', async () => {
    const h = harness();
    await h.mount();
    await click($('[data-testid="btn-start-practice"]'));
    await answer(h.expected, true);
    expect($('[data-testid="practice-feedback"]')).not.toBeNull();
    await key('Enter');
    expect($('[data-testid="practice-progress"]')!.getAttribute('aria-valuenow')).toBe('1');
    expect($('[data-testid="practice-feedback"]')).toBeNull();
  });

  it('shows the combo after three in a row', async () => {
    const h = harness();
    await h.mount();
    await click($('[data-testid="btn-start-practice"]'));
    for (let i = 0; i < 3; i++) {
      await answer(h.expected, true);
      if (i < 2) await click($('[data-testid="btn-continue"]'));
    }
    expect($('[data-testid="practice-combo"]')!.textContent).toContain('3');
  });

  it('the end screen trusts the core result: no "perfect" when the core says so', async () => {
    const h = harness(CARDS, async () => ({ xp: 9, correct: 4, total: 4, perfect: false }));
    await h.mount();
    await click($('[data-testid="btn-start-practice"]'));
    await runAll(h);
    await flush();
    expect($('[data-testid="practice-end"]')).not.toBeNull();
    expect($('[data-testid="confetti"]')).toBeNull();
    expect($('[data-testid="practice-end"] h1')!.textContent).toBe(t('pxEndTitle'));
    expect($('[data-testid="practice-perfect-bonus"]')).toBeNull();
  });

  it('a perfect core result shows confetti, "Perfect session!" and the +5 bonus', async () => {
    const h = harness(CARDS, async () => ({ xp: 14, correct: 4, total: 4, perfect: true }));
    await h.mount();
    await click($('[data-testid="btn-start-practice"]'));
    await runAll(h);
    await flush();
    expect($('[data-testid="confetti"]')).not.toBeNull();
    expect($('[data-testid="practice-end"] h1')!.textContent).toBe(t('pxEndPerfect'));
    expect($('[data-testid="practice-perfect-bonus"]')!.textContent).toContain('+5');
  });

  it('records how many match games were played (first_match achievement)', async () => {
    const five = [...CARDS, card('c5', 'el pan', 'the bread', 'Más pan, por favor.')];
    const h = harness(five);
    const matches = h.expected.filter((e) => e.kind === 'match').length;
    expect(matches).toBeGreaterThan(0);
    await h.mount();
    await click($('[data-testid="btn-start-practice"]'));
    await runAll(h);
    await flush();
    expect(h.records()[0]!.matchGames).toBe(matches);
  });

  it('a session without match games omits matchGames', async () => {
    const h = harness();
    expect(h.expected.some((e) => e.kind === 'match')).toBe(false);
    await h.mount();
    await click($('[data-testid="btn-start-practice"]'));
    await runAll(h);
    await flush();
    expect('matchGames' in h.records()[0]!).toBe(false);
  });

  it('no confetti under prefers-reduced-motion', async () => {
    const h = harness();
    h.setReduced(true);
    await h.mount();
    await click($('[data-testid="btn-start-practice"]'));
    await runAll(h);
    await flush();
    expect($('[data-testid="practice-end"]')).not.toBeNull();
    expect($('[data-testid="confetti"]')).toBeNull();
  });

  it('a failed save can be retried with the same session id', async () => {
    let fail = true;
    const h = harness(CARDS, async () => {
      if (fail) throw new Error('boom');
      return { xp: 14, correct: 4, total: 4, perfect: true };
    });
    await h.mount();
    await click($('[data-testid="btn-start-practice"]'));
    await runAll(h);
    await flush();
    expect($('[data-testid="practice-save-error"]')).not.toBeNull();
    fail = false;
    await click($('[data-testid="btn-retry-save"]'));
    await flush();
    const recs = h.records();
    expect(recs).toHaveLength(2);
    expect(recs[1]!.sessionId).toBe(recs[0]!.sessionId);
    expect($('[data-testid="practice-xp"]')!.getAttribute('data-xp')).toBe('14');
  });

  it('"Practice again" starts a new session id; "Done" leaves', async () => {
    const h = harness();
    let n = 0;
    h.deps.uuid = () => `s-${++n}`;
    await h.mount();
    await click($('[data-testid="btn-start-practice"]'));
    await runAll(h);
    await flush();
    await click($('[data-testid="btn-practice-again"]'));
    expect($('[data-testid="practice-exercise"]')).not.toBeNull();
    await runAll(h);
    await flush();
    expect(h.records().map((r) => r.sessionId)).toEqual(['s-1', 's-2']);
    await click($('[data-testid="btn-practice-done"]'));
    expect(h.onDone).toHaveBeenCalled();
  });

  it('fewer than 4 words → friendly empty state with a Tiny Lesson button', async () => {
    const h = harness(CARDS.slice(0, 3));
    await h.mount();
    expect($('[data-testid="practice-empty"]')).not.toBeNull();
    expect($('[data-testid="btn-practice-tiny-lesson"]')).not.toBeNull();
    expect($('[data-testid="btn-start-practice"]')).toBeNull();
  });

  it('ignores keyboard input while the tab is hidden', async () => {
    const h = harness();
    await h.mount(snapshotWith(CARDS), false);
    await key('Enter');
    expect(h.calls.some((c) => c.type === 'getPracticeCards')).toBe(false);
  });
});
