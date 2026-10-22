// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NONCE_ATTR, startIsolated } from '../src/content/isolated';
import { NATIVE_ATTR } from '../src/content/native-overlay';
import type { Toaster } from '../src/content/toast';
import { createTranslatorCache, type Availability, type TranslatorApi } from '../src/lib/translate';

const wait = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const t = (k: string) => k;

function fakeApi(availability: Availability, fail = false): TranslatorApi {
  return {
    availability: async () => availability,
    create: async () => ({
      translate: async (s: string) => {
        if (fail) throw new Error('model crashed');
        return `[tr] ${s}`;
      },
      destroy: () => {},
    }),
  } as unknown as TranslatorApi;
}

const savedNative = (overlay = true, items?: unknown[]) => ({
  status: 'saved',
  lessonIds: ['L1'],
  newCards: 2,
  duplicates: 1,
  xp: 20,
  native: {
    source: 'en',
    target: 'tr',
    overlay,
    items: items ?? [
      { cardId: 'c1', term: 'el café', meaning: 'coffee' },
      { cardId: 'c2', term: 'la leche', meaning: 'milk' },
      { cardId: 'c3', term: 'el azúcar', meaning: 'sugar', native: 'şeker' },
    ],
  },
});

let disposers: (() => void)[] = [];

function setup(api: TranslatorApi | undefined, captureReply: unknown) {
  const sent: Record<string, unknown>[] = [];
  const sendMessage = vi.fn(async (m: unknown) => {
    const rec = m as Record<string, unknown>;
    sent.push(rec);
    if (rec.type === 'capture') return { ok: true, data: captureReply };
    if (rec.type === 'setNativeTranslations') return { ok: true, data: { updated: 2 } };
    return { ok: true, data: null };
  });
  let settingsCb: ((show: boolean) => void) | undefined;
  const toaster: Toaster = { show: vi.fn(), hide: vi.fn(), root: null };
  const iso = startIsolated({
    win: window,
    runtimeId: 'ext',
    sendMessage,
    onMessage: { addListener: () => {} },
    t,
    toaster,
    translator: createTranslatorCache(api, () => undefined),
    onShowNativeChanged: (cb) => void (settingsCb = cb),
    overlayDebounceMs: 5,
  });
  disposers.push(iso.dispose);
  const capture = (kind = 'terms') =>
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { source: 'langcoach-capture', nonce: iso.nonce, kind, request: {}, response: {}, url: 'x' },
        origin: location.origin,
        source: window,
      }),
    );
  return { sent, capture, toggle: (v: boolean) => settingsCb?.(v) };
}

const spans = () => [...document.querySelectorAll(`[${NATIVE_ATTR}]`)].map((x) => x.textContent);

beforeEach(() => {
  document.documentElement.removeAttribute(NONCE_ATTR);
  document.body.innerHTML = `<ul>
    <li><div>el café</div><div>coffee</div></li>
    <li><div>la leche</div><div>milk</div></li>
    <li><div>el azúcar</div><div>sugar</div></li></ul>
    <section><p>Querría un café.</p><p>I would like a coffee.</p></section>`;
});
afterEach(() => {
  for (const d of disposers) d();
  disposers = [];
  document.body.innerHTML = '';
});

describe('capture-time native translations (content script)', () => {
  it('translates new meanings, stores them via setNativeTranslations and shows them on the page', async () => {
    const { sent, capture } = setup(fakeApi('available'), savedNative());
    capture();
    await wait(20);
    const store = sent.find((m) => m.type === 'setNativeTranslations');
    expect(store).toEqual({
      type: 'setNativeTranslations',
      entries: [
        { cardId: 'c1', text: '[tr] coffee' },
        { cardId: 'c2', text: '[tr] milk' },
      ],
    });
    expect(spans()).toEqual(['[tr] coffee', '[tr] milk', 'şeker']);
    const span = document.querySelector(`[${NATIVE_ATTR}]`)!;
    expect(span.getAttribute('lang')).toBe('tr');
  });

  it.each<[string, TranslatorApi | undefined]>([
    ['API absent', undefined],
    ['pair unsupported', fakeApi('unavailable')],
    ['model not downloaded', fakeApi('downloadable')],
    ['model downloading', fakeApi('downloading')],
    ['translate throws', fakeApi('available', true)],
  ])('%s → nothing stored, no error, English stays (already-known natives still shown)', async (_n, api) => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { sent, capture } = setup(api, savedNative());
    capture();
    await wait(20);
    expect(sent.some((m) => m.type === 'setNativeTranslations')).toBe(false);
    expect(spans()).toEqual(['şeker']);
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });

  it('overlay off: stores translations but adds nothing to the page; toggling on shows them', async () => {
    const { sent, capture, toggle } = setup(fakeApi('available'), savedNative(false));
    capture();
    await wait(20);
    expect(sent.some((m) => m.type === 'setNativeTranslations')).toBe(true);
    expect(spans()).toEqual([]);
    toggle(true);
    expect(spans()).toEqual(['[tr] coffee', '[tr] milk', 'şeker']);
    toggle(false);
    expect(spans()).toEqual([]);
  });

  it('no native hint (English learner) → nothing translated', async () => {
    const { sent, capture } = setup(fakeApi('available'), {
      status: 'saved',
      lessonIds: ['L1'],
      newCards: 2,
      duplicates: 0,
      xp: 0,
    });
    capture();
    await wait(20);
    expect(sent.map((m) => m.type)).toEqual(['capture']);
    expect(spans()).toEqual([]);
  });

  it('grammar examples get a native line on the page (nothing stored)', async () => {
    const { sent, capture } = setup(fakeApi('available'), {
      status: 'grammar',
      native: { source: 'en', target: 'tr', overlay: true, examples: ['I would like a coffee.'] },
    });
    capture('grammar');
    await wait(20);
    expect(sent.map((m) => m.type)).toEqual(['capture']);
    expect(spans()).toEqual(['[tr] I would like a coffee.']);
  });

  it('ignores malformed native hints without throwing', async () => {
    const { sent, capture } = setup(fakeApi('available'), savedNative(true, [null, { cardId: 5 }, { cardId: 'c9', meaning: '' }]));
    capture();
    await wait(20);
    expect(sent.some((m) => m.type === 'setNativeTranslations')).toBe(false);
  });
});
