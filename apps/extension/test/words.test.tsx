// @vitest-environment jsdom
import { emptyState, newSrs, reviewSrs, type Lesson, type ReviewCard } from '@langcoach/core/browser';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Message, MessageMap, MessageType, ResponseOf, Snapshot } from '../src/shared/messages';
import type { PanelSend } from '../src/sidepanel/App';
import { createTranslator } from '../src/sidepanel/i18n';
import { Words } from '../src/sidepanel/views/Words';

const { t } = createTranslator('en');
const NOW = new Date('2026-10-22T10:00:00Z');
const PAST = new Date('2026-10-01T10:00:00Z');

const profile = {
  nativeLanguage: 'Turkish',
  targetLanguage: 'Spanish (Spain)',
  level: 'A2' as const,
  goal: 'travel',
  minutesPerDay: 15,
  daysPerWeek: 5,
  createdAt: '2026-10-01T10:00:00Z',
};

const lesson = (id: string, situation: string, createdAt: string): Lesson => ({
  id,
  kind: 'tiny_lesson',
  situation,
  items: [],
  createdAt,
});

function mk(id: string, lessonId: string, term: string, translation: string, extra: Partial<ReviewCard> = {}): ReviewCard {
  return { id, lessonId, term, translation, example: '', srs: newSrs(PAST), ...extra };
}

/** Not due: reviewed with a long interval. */
const strong = { ...newSrs(PAST), state: 2, reps: 6, stability: 60, due: '2027-01-01T00:00:00.000Z' };
const weakSrs = reviewSrs(newSrs(PAST), 1, PAST); // Again → learning, due soon

function deck() {
  const st = emptyState();
  st.profile = profile;
  st.lessons = [lesson('L1', 'At the cafe', '2026-10-01T10:00:00Z'), lesson('L2', 'Hotel check-in', '2026-10-10T10:00:00Z')];
  st.cards = [
    mk('c1', 'L1', 'la cuenta', 'the bill', { nativeTranslation: 'hesap' }),
    mk('c2', 'L1', 'el café', 'coffee', { srs: strong, mastered: true }),
    mk('c3', 'L1', 'el agua', 'water', { srs: weakSrs, favorite: true }),
    mk('c4', 'L2', 'la llave', 'the key'),
    mk('c5', 'L2', 'la habitación', 'the room', { srs: strong }),
  ];
  return st;
}

function snapshotOf(st = deck()): Snapshot {
  return {
    profile,
    today: { date: '2026-10-22', tasks: [], planExists: true },
    plan: null,
    progress: { streak: 1, totalXp: 10, weekly: { done: 0, planned: 5 }, dueCount: 3 },
    dueCount: 3,
    lastCapture: null,
    state: st,
  };
}

let host: HTMLDivElement;
beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  try {
    localStorage.clear();
  } catch {
    /* ignore */
  }
});
afterEach(() => {
  render(null, host);
  host.remove();
  vi.restoreAllMocks();
});

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => host.querySelector<T>(sel);
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
const type = async (el: HTMLInputElement | null, value: string) => {
  expect(el).not.toBeNull();
  await act(async () => {
    el!.value = value;
    el!.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await flush();
};
const terms = () => $$('[data-testid="word-item"] .vocab-term').map((e) => e.textContent);

function harness(snap = snapshotOf(), handler: (m: Message) => unknown = () => null) {
  const calls: Message[] = [];
  const send = vi.fn(async <K extends MessageType>(msg: { type: K } & MessageMap[K]['request']) => {
    calls.push(msg as Message);
    if (msg.type === 'getDue') return [] as ResponseOf<K>;
    if (msg.type === 'markMastered') return { xpAwarded: 2 } as ResponseOf<K>;
    if (msg.type === 'setFavorite') return snap.state!.cards[0] as ResponseOf<K>;
    if (msg.type === 'setNativeTranslations') return { updated: 1 } as ResponseOf<K>;
    return (await handler(msg as Message)) as ResponseOf<K>;
  }) as unknown as PanelSend;
  const onRefresh = vi.fn(async () => {});
  const speak = vi.fn();
  const mount = async (s = snap) => {
    await act(async () => {
      render(
        <Words
          snapshot={s}
          uiLocale="en"
          t={t}
          send={send}
          onRefresh={onRefresh}
          deps={{ now: () => NOW, speech: { canSpeak: () => true, speak } }}
        />,
        host,
      );
    });
    await flush();
  };
  return { calls, send, onRefresh, speak, mount };
}

describe('Words hub (D11)', () => {
  it('opens as a list grouped by lesson situation (newest lesson first)', async () => {
    const h = harness();
    await h.mount();
    expect($('[data-testid="mode-list"]')!.getAttribute('aria-pressed')).toBe('true');
    const groups = $$('[data-testid="words-group"]');
    expect(groups.map((g) => g.querySelector('h2')!.textContent)).toEqual([
      expect.stringContaining('Hotel check-in'),
      expect.stringContaining('At the cafe'),
    ]);
    expect(terms()).toEqual(['la llave', 'la habitación', 'la cuenta', 'el café', 'el agua']);
  });

  it('search matches term, English meaning and native meaning', async () => {
    const h = harness();
    await h.mount();
    const search = $<HTMLInputElement>('[data-testid="words-search"]');
    await type(search, 'HESAP');
    expect(terms()).toEqual(['la cuenta']);
    await type(search, 'room');
    expect(terms()).toEqual(['la habitación']);
    await type(search, 'llave');
    expect(terms()).toEqual(['la llave']);
    await type(search, 'zzz');
    expect($('[data-testid="words-no-match"]')).not.toBeNull();
  });

  it.each([
    ['all', ['la llave', 'la habitación', 'la cuenta', 'el café', 'el agua']],
    ['due', ['la llave', 'la cuenta', 'el agua']],
    ['new', ['la llave', 'la cuenta']],
    ['weak', ['el agua']],
    ['favorites', ['el agua']],
    ['mastered', ['la habitación', 'el café']],
  ])('filter %s', async (id, want) => {
    const h = harness();
    await h.mount();
    const btn = $(`[data-testid="words-filter-${id}"]`)!;
    await click(btn);
    expect(btn.getAttribute('aria-pressed')).toBe('true');
    expect(btn.textContent).toContain(String(want.length));
    expect(terms()).toEqual(want);
  });

  it('each word shows a 0-5 strength meter with an accessible label', async () => {
    const h = harness();
    await h.mount();
    const meter = (term: string) =>
      $$('[data-testid="word-item"]')
        .find((i) => i.querySelector('.vocab-term')!.textContent === term)!
        .querySelector<HTMLElement>('[data-testid="strength-meter"]')!;
    expect(meter('la llave').getAttribute('data-strength')).toBe('0');
    expect(meter('el agua').getAttribute('data-strength')).toBe('1');
    expect(meter('el café').getAttribute('data-strength')).toBe('5');
    expect(meter('el café').getAttribute('role')).toBe('meter');
    expect(meter('el café').getAttribute('aria-valuenow')).toBe('5');
    expect(meter('el café').getAttribute('aria-label')).toBe(t('strengthLabel', ['5', '5']));
  });

  it('⭐ toggles a favorite (setFavorite) with aria-pressed, optimistically', async () => {
    const h = harness();
    await h.mount();
    const item = $$('[data-testid="word-item"]').find((i) => i.dataset.cardId === 'c4')!;
    const star = item.querySelector<HTMLElement>('[data-testid="btn-favorite"]')!;
    expect(star.getAttribute('aria-pressed')).toBe('false');
    await click(star);
    expect(h.calls.find((c) => c.type === 'setFavorite')).toEqual({ type: 'setFavorite', cardId: 'c4', favorite: true });
    expect(star.getAttribute('aria-pressed')).toBe('true');
    await click($('[data-testid="words-filter-favorites"]'));
    expect(terms()).toEqual(['la llave', 'el agua']);
  });

  it('a failed favorite rolls back and shows an error', async () => {
    const h = harness(snapshotOf(), () => null);
    (h.send as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(async () => {
      throw new Error('boom');
    });
    await h.mount();
    const star = $$('[data-testid="btn-favorite"]')[0]!;
    await click(star);
    expect(star.getAttribute('aria-pressed')).toBe('false');
    expect($('[data-testid="words-error"]')!.textContent).toContain('boom');
  });

  it('"I know this" marks mastered once (+2 XP), then is disabled', async () => {
    const h = harness();
    await h.mount();
    const item = () => $$('[data-testid="word-item"]').find((i) => i.dataset.cardId === 'c4')!;
    const btn = () => item().querySelector<HTMLButtonElement>('[data-testid="btn-know"]')!;
    expect(btn().disabled).toBe(false);
    await click(btn());
    await click(btn());
    expect(h.calls.filter((c) => c.type === 'markMastered')).toEqual([{ type: 'markMastered', cardId: 'c4' }]);
    expect(btn().disabled).toBe(true);
    expect(item().textContent).toContain(t('wordsKnownXp', '2'));
    // already-mastered cards start disabled
    const cafe = $$('[data-testid="word-item"]').find((i) => i.dataset.cardId === 'c2')!;
    expect(cafe.querySelector<HTMLButtonElement>('[data-testid="btn-know"]')!.disabled).toBe(true);
  });

  it('🔊 speaks the term in the target language', async () => {
    const h = harness();
    await h.mount();
    await click($$('[data-testid="btn-speak"]')[0]!);
    expect(h.speak).toHaveBeenCalledWith('la llave', 'es-ES');
  });

  it('inline edit saves the native meaning (setNativeTranslations) and the English one (updateCard)', async () => {
    const h = harness(snapshotOf(), (m) => (m.type === 'updateCard' ? deck().cards[0] : null));
    await h.mount();
    const item = () => $$('[data-testid="word-item"]').find((i) => i.dataset.cardId === 'c1')!;
    await click(item().querySelector('[data-testid="btn-edit"]'));
    await type(item().querySelector<HTMLInputElement>('[data-testid="edit-native"]'), 'fatura');
    await click(item().querySelector('[data-testid="btn-save-edit"]'));
    expect(h.calls.find((c) => c.type === 'setNativeTranslations')).toEqual({
      type: 'setNativeTranslations',
      entries: [{ cardId: 'c1', text: 'fatura' }],
    });
    expect(h.calls.some((c) => c.type === 'updateCard')).toBe(false);
    expect(item().querySelector('[data-testid="vocab-native"]')!.textContent).toBe('fatura');

    await click(item().querySelector('[data-testid="btn-edit"]'));
    await type(item().querySelector<HTMLInputElement>('[data-testid="edit-translation"]'), 'the check');
    await click(item().querySelector('[data-testid="btn-save-edit"]'));
    expect(h.calls.find((c) => c.type === 'updateCard')).toEqual({
      type: 'updateCard',
      cardId: 'c1',
      patch: { translation: 'the check' },
    });
  });

  it('Escape cancels an edit and returns focus to the edit button', async () => {
    const h = harness();
    await h.mount();
    const item = () => $$('[data-testid="word-item"]').find((i) => i.dataset.cardId === 'c1')!;
    await click(item().querySelector('[data-testid="btn-edit"]'));
    const input = item().querySelector<HTMLInputElement>('[data-testid="edit-native"]')!;
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    await flush();
    expect(item().querySelector('[data-testid="edit-native"]')).toBeNull();
    expect(document.activeElement).toBe(item().querySelector('[data-testid="btn-edit"]'));
  });

  it('2,000 cards: renders 50 at a time with "Show more", within budget', async () => {
    const st = deck();
    st.cards = Array.from({ length: 2000 }, (_, i) => mk(`k${i}`, i % 2 ? 'L1' : 'L2', `palabra ${i}`, `word ${i}`));
    const h = harness(snapshotOf(st));
    const t0 = performance.now();
    await h.mount();
    const ms = performance.now() - t0;
    expect($$('[data-testid="word-item"]')).toHaveLength(50);
    expect(ms).toBeLessThan(1500);
    const more = $('[data-testid="btn-show-more"]')!;
    expect(more.textContent).toContain('1950');
    await click(more);
    expect($$('[data-testid="word-item"]')).toHaveLength(100);
    // typing in search is still quick on the full deck
    const t1 = performance.now();
    await type($<HTMLInputElement>('[data-testid="words-search"]'), 'palabra 1999');
    expect(performance.now() - t1).toBeLessThan(500);
    expect(terms()).toEqual(['palabra 1999']);
  });

  it('empty deck guides to a Tiny Lesson', async () => {
    const st = deck();
    st.cards = [];
    const h = harness(snapshotOf(st));
    await h.mount();
    expect($('[data-testid="review-empty"]')).not.toBeNull();
  });

  it('flip-card mode is kept inside Words', async () => {
    const h = harness();
    await h.mount();
    await click($('[data-testid="mode-cards"]'));
    expect(h.calls.some((c) => c.type === 'getDue')).toBe(true);
    expect($('[data-testid="mode-cards"]')!.getAttribute('aria-pressed')).toBe('true');
  });
});
