import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Coach } from '@langcoach/core/browser';
import { describe, expect, it, vi } from 'vitest';
import { isAllowed } from '../src/background/policy';
import { SETTINGS_KEY, createRouter, validateMessage } from '../src/background/router';
import { ChromeStorageStore } from '../src/background/store';
import type { CaptureResult, Message } from '../src/shared/messages';
import { fakeArea } from './chrome-fake';

const fx = (n: string): unknown =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`./fixtures/${n}`, import.meta.url)), 'utf8'));
const esReq = { sourceLanguage: 'English', targetLanguage: 'European Spanish', purpose: 'ordering coffee at a cafe' };
const PAGE = 'https://labs.google/lll/en/experiments/tiny-lesson';
const T0 = new Date('2026-03-04T10:00:00Z').getTime();
const profile = (nativeLanguage: string) => ({
  nativeLanguage,
  targetLanguage: 'Spanish (Spain)',
  level: 'A1' as const,
  goal: 'travel',
  minutesPerDay: 15,
  daysPerWeek: 5,
});
type Res<T> = { ok: boolean; data?: T; error?: { name: string; code?: string } };
type Saved = Extract<CaptureResult, { status: 'saved' }>;
type Grammar = Extract<CaptureResult, { status: 'grammar' }>;

async function setup(native: string | null = 'Turkish') {
  const area = fakeArea();
  const store = new ChromeStorageStore(area);
  let n = 0;
  const clock = () => new Date(T0);
  const coach = new Coach(store, clock, () => `id-${++n}`);
  if (native) await coach.setProfile(profile(native));
  const router = createRouter({ coach, store, area, clock, log: vi.fn() });
  const call = <T>(m: Record<string, unknown>) => router.handle(m as Message, { tabId: 3 }) as Promise<Res<T>>;
  return { area, store, coach, call };
}
const terms = { type: 'capture', kind: 'terms', request: esReq, response: fx('terms-es.json'), pageUrl: PAGE };
const grammar = { type: 'capture', kind: 'grammar', request: esReq, response: fx('grammar-es.json'), pageUrl: PAGE };

describe('capture → native translation hint', () => {
  it('a saved capture returns the pair, overlay flag and each card id with term and English meaning', async () => {
    const { call, store } = await setup('Turkish');
    const r = await call<Saved>(terms);
    const native = r.data!.native!;
    expect(native).toMatchObject({ source: 'en', target: 'tr', overlay: true });
    expect(native.items).toHaveLength(20);
    const s = await store.load();
    for (const it of native.items) {
      const card = s.cards.find((c) => c.id === it.cardId)!;
      expect(card.term).toBe(it.term);
      expect(card.translation).toBe(it.meaning);
      expect(it.native).toBeUndefined();
    }
  });

  it('duplicates point at the existing cards and carry their stored native translation', async () => {
    const { call, coach } = await setup('Turkish');
    const first = await call<Saved>(terms);
    const coffee = first.data!.native!.items.find((i) => i.meaning === 'coffee')!;
    await coach.setNativeTranslations([{ cardId: coffee.cardId, text: 'kahve' }]);
    const again = await call<Saved>(terms);
    expect(again.data!.newCards).toBe(0);
    const items = again.data!.native!.items;
    expect(items).toHaveLength(20);
    expect(items.find((i) => i.cardId === coffee.cardId)?.native).toBe('kahve');
  });

  it.each([['English'], ['Other'], [null]])('no hint when the native language is %s', async (native) => {
    const { call } = await setup(native);
    const r = await call<Saved>(terms);
    expect(r.data!.status).toBe('saved');
    expect(r.data!.native).toBeUndefined();
  });

  it('respects showNativeOnPage=false (translations still stored, no overlay)', async () => {
    const { call } = await setup('Turkish');
    await call({ type: 'setSettings', settings: { showNativeOnPage: false } });
    const r = await call<Saved>(terms);
    expect(r.data!.native?.overlay).toBe(false);
  });

  it('a grammar capture returns the example translations for the overlay', async () => {
    const { call } = await setup('Turkish');
    const r = await call<Grammar>(grammar);
    expect(r.data!.status).toBe('grammar');
    expect(r.data!.native).toMatchObject({ source: 'en', target: 'tr', overlay: true });
    expect(r.data!.native!.examples).toContain('I would like a coffee with milk, please.');
  });
});

describe('setNativeTranslations message', () => {
  it('stores translations through the Coach', async () => {
    const { call, store } = await setup('Turkish');
    const saved = await call<Saved>(terms);
    const ids = saved.data!.native!.items.slice(0, 2).map((i) => i.cardId);
    const r = await call<{ updated: number }>({
      type: 'setNativeTranslations',
      entries: [
        { cardId: ids[0], text: ' kahve ' },
        { cardId: ids[1], text: 'sütlü kahve' },
        { cardId: 'unknown', text: 'x' },
      ],
    });
    expect(r).toEqual({ ok: true, data: { updated: 2 } });
    const s = await store.load();
    expect(s.cards.find((c) => c.id === ids[0])?.nativeTranslation).toBe('kahve');
  });

  it.each<[string, unknown]>([
    ['not an array', 'x'],
    ['too many', Array.from({ length: 501 }, (_, i) => ({ cardId: `c${i}`, text: 't' }))],
    ['bad cardId', [{ cardId: 5, text: 't' }]],
    ['empty text', [{ cardId: 'c', text: '   ' }]],
    ['long text', [{ cardId: 'c', text: 'x'.repeat(501) }]],
    ['non-object', [null]],
  ])('rejects %s as invalid', (_n, entries) => {
    expect(() => validateMessage({ type: 'setNativeTranslations', entries })).toThrow();
  });

  it('accepts an empty list and up to 500 entries', () => {
    expect(() => validateMessage({ type: 'setNativeTranslations', entries: [] })).not.toThrow();
    const many = Array.from({ length: 500 }, (_, i) => ({ cardId: `c${i}`, text: 't' }));
    expect(() => validateMessage({ type: 'setNativeTranslations', entries: many })).not.toThrow();
  });

  it('is allowed from LLL content scripts and extension pages only', () => {
    const ID = 'abc';
    const ORIGIN = 'chrome-extension://abc/';
    expect(isAllowed('setNativeTranslations', { id: ID, url: `${ORIGIN}sidepanel.html` }, ID, ORIGIN, false)).toBe(true);
    expect(isAllowed('setNativeTranslations', { id: ID, url: 'https://labs.google/lll/en', tab: {} }, ID, ORIGIN, false)).toBe(true);
    expect(isAllowed('setNativeTranslations', { id: ID, url: 'https://evil.example/', tab: {} }, ID, ORIGIN, false)).toBe(false);
    expect(isAllowed('setNativeTranslations', { id: 'other', url: `${ORIGIN}x` }, ID, ORIGIN, false)).toBe(false);
  });
});

describe('showNativeOnPage setting', () => {
  it('defaults to true, validates and persists', async () => {
    const { call, area } = await setup('Turkish');
    expect((await call<{ showNativeOnPage: boolean }>({ type: 'getSettings' })).data?.showNativeOnPage).toBe(true);
    const bad = await call({ type: 'setSettings', settings: { showNativeOnPage: 'no' } });
    expect(bad.ok).toBe(false);
    await call({ type: 'setSettings', settings: { showNativeOnPage: false } });
    expect((area.data.get(SETTINGS_KEY) as { showNativeOnPage: boolean }).showNativeOnPage).toBe(false);
    area.data.set(SETTINGS_KEY, { showNativeOnPage: 3 });
    expect((await call<{ showNativeOnPage: boolean }>({ type: 'getSettings' })).data?.showNativeOnPage).toBe(true);
  });
});
