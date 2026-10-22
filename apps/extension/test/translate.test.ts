import { describe, expect, it, vi } from 'vitest';
import {
  createTranslatorCache,
  nativeLanguageCode,
  translationPair,
  translatorCode,
  type Availability,
  type TranslatorApi,
} from '../src/lib/translate';

type Opts = { sourceLanguage: string; targetLanguage: string; monitor?: (m: EventTarget) => void };

function fakeApi(availability: Availability | (() => Promise<Availability>) = 'available', impl?: (t: string) => string) {
  const translate = vi.fn(async (t: string) => (impl ? impl(t) : `[${'tr'}] ${t}`));
  const destroy = vi.fn();
  const api = {
    availability: vi.fn(async (_o: Opts) => (typeof availability === 'function' ? availability() : availability)),
    create: vi.fn(async (o: Opts) => {
      if (o.monitor) {
        const m = new EventTarget();
        o.monitor(m);
        const e = new Event('downloadprogress') as Event & { loaded: number };
        e.loaded = 0.5;
        m.dispatchEvent(e);
      }
      return { translate, destroy };
    }),
  };
  return { api: api as unknown as TranslatorApi, raw: api, translate, destroy };
}

describe('nativeLanguageCode', () => {
  it.each([
    ['Turkish', 'tr'],
    ['Türkçe', 'tr'],
    ['tr', 'tr'],
    ['tr-TR', 'tr'],
    ['  turkish ', 'tr'],
    ['English', 'en'],
    ['Spanish', 'es'],
    ['Español', 'es'],
    ['French', 'fr'],
    ['Portuguese', 'pt'],
    ['Português', 'pt'],
    ['pt_BR', 'pt'],
    ['German', 'de'],
    ['Arabic', 'ar'],
    ['Chinese', 'zh'],
    ['Japanese', 'ja'],
    ['Korean', 'ko'],
    ['Russian', 'ru'],
    ['Hindi', 'hi'],
    ['Italian', 'it'],
  ])('%s → %s', (name, code) => {
    expect(nativeLanguageCode(name)).toBe(code);
  });

  it.each(['Other', '', 'Klingon', 'xx', undefined, null, 42])('unknown %s → null (feature off)', (v) => {
    expect(nativeLanguageCode(v as string)).toBeNull();
  });
});

describe('translatorCode / translationPair', () => {
  it('maps LLL language names to Translator codes', () => {
    expect(translatorCode('English')).toBe('en');
    expect(translatorCode('American English')).toBe('en');
    expect(translatorCode('European Spanish')).toBe('es');
    expect(translatorCode('Taiwanese Mandarin')).toBe('zh-Hant');
    expect(translatorCode('Mandarin Chinese')).toBe('zh');
    expect(translatorCode('Brazilian Portuguese')).toBe('pt');
    expect(translatorCode('Elvish')).toBeNull();
  });

  it('is null when native is unknown or the same as the source', () => {
    expect(translationPair('English', 'Turkish')).toEqual({ source: 'en', target: 'tr' });
    expect(translationPair('English', 'English')).toBeNull();
    expect(translationPair('British English', 'en')).toBeNull();
    expect(translationPair('English', 'Other')).toBeNull();
    expect(translationPair('Elvish', 'Turkish')).toBeNull();
    expect(translationPair(undefined, 'Turkish')).toEqual({ source: 'en', target: 'tr' }); // manual cards default to English
  });
});

describe('createTranslatorCache', () => {
  it('reports unavailable when the API is absent', async () => {
    const c = createTranslatorCache(undefined, () => undefined);
    expect(await c.available('en', 'tr')).toBe('unavailable');
    expect(await c.translateMany(['milk'], 'en', 'tr')).toEqual([null]);
    expect(await c.ensureReady('en', 'tr', { userGesture: true })).toBe('unavailable');
  });

  it('passes availability through and maps errors to unavailable', async () => {
    for (const a of ['available', 'downloadable', 'downloading', 'unavailable'] as const) {
      expect(await createTranslatorCache(fakeApi(a).api).available('en', 'tr')).toBe(a);
    }
    const throwing = fakeApi(async () => {
      throw new Error('boom');
    });
    expect(await createTranslatorCache(throwing.api).available('en', 'tr')).toBe('unavailable');
    const weird = fakeApi(async () => 'maybe' as Availability);
    expect(await createTranslatorCache(weird.api).available('en', 'tr')).toBe('unavailable');
  });

  it('translates when available, dedupes inputs and caches per session', async () => {
    const f = fakeApi('available');
    const c = createTranslatorCache(f.api);
    expect(await c.translateMany(['milk', 'sugar', 'milk', '  '], 'en', 'tr')).toEqual([
      '[tr] milk',
      '[tr] sugar',
      '[tr] milk',
      null,
    ]);
    expect(f.translate).toHaveBeenCalledTimes(2);
    expect(await c.translateMany(['milk'], 'en', 'tr')).toEqual(['[tr] milk']);
    expect(f.translate).toHaveBeenCalledTimes(2);
    expect(f.raw.create).toHaveBeenCalledTimes(1);
  });

  it('shares one translator between concurrent calls', async () => {
    const f = fakeApi('available');
    const c = createTranslatorCache(f.api);
    await Promise.all([c.translateMany(['a'], 'en', 'tr'), c.translateMany(['b'], 'en', 'tr')]);
    expect(f.raw.create).toHaveBeenCalledTimes(1);
  });

  it('never creates (downloads) without a user gesture', async () => {
    for (const a of ['downloadable', 'downloading'] as const) {
      const f = fakeApi(a);
      const c = createTranslatorCache(f.api);
      expect(await c.translateMany(['milk'], 'en', 'tr')).toEqual([null]);
      expect(await c.ensureReady('en', 'tr', { userGesture: false })).toBe(a === 'downloadable' ? 'needs_download' : 'downloading');
      expect(f.raw.create).not.toHaveBeenCalled();
    }
  });

  it('downloads with a user gesture, reports progress, then translates', async () => {
    let state: Availability = 'downloadable';
    const f = fakeApi(async () => state);
    const c = createTranslatorCache(f.api);
    const progress = vi.fn();
    const p = c.ensureReady('en', 'tr', { userGesture: true, onProgress: progress });
    // create() is called synchronously inside the click handler, before any await
    expect(f.raw.create).toHaveBeenCalledTimes(1);
    expect(await p).toBe('available');
    expect(progress).toHaveBeenCalledWith(0.5);
    state = 'available';
    expect(await c.translateMany(['milk'], 'en', 'tr')).toEqual(['[tr] milk']);
    expect(f.raw.create).toHaveBeenCalledTimes(1);
  });

  it('turns translate/create errors into nulls and retries a failed create later', async () => {
    const f = fakeApi('available', (t) => {
      if (t === 'bad') throw new Error('nope');
      return `ok ${t}`;
    });
    const c = createTranslatorCache(f.api);
    expect(await c.translateMany(['bad', 'good'], 'en', 'tr')).toEqual([null, 'ok good']);

    const g = fakeApi('available');
    g.raw.create.mockRejectedValueOnce(new Error('NotAllowedError'));
    const c2 = createTranslatorCache(g.api);
    expect(await c2.translateMany(['milk'], 'en', 'tr')).toEqual([null]);
    expect(await c2.translateMany(['milk'], 'en', 'tr')).toEqual(['[tr] milk']);
  });

  it('a synchronous throw from the API never escapes', async () => {
    const api = {
      availability: () => {
        throw new Error('sync');
      },
      create: () => {
        throw new Error('sync');
      },
    } as unknown as TranslatorApi;
    const c = createTranslatorCache(api);
    expect(await c.available('en', 'tr')).toBe('unavailable');
    expect(await c.ensureReady('en', 'tr', { userGesture: true })).toBe('unavailable');
    expect(await c.translateMany(['x'], 'en', 'tr')).toEqual([null]);
  });

  it('trims long or empty results to null and caps output at 500 chars', async () => {
    const f = fakeApi('available', (t) => (t === 'empty' ? '   ' : 'x'.repeat(900)));
    const c = createTranslatorCache(f.api);
    const [a, b] = await c.translateMany(['empty', 'long'], 'en', 'tr');
    expect(a).toBeNull();
    expect(b).toHaveLength(500);
  });

  it('reads the global API lazily', async () => {
    const holder: { api?: TranslatorApi } = {};
    const c = createTranslatorCache(undefined, () => holder.api);
    expect(await c.available('en', 'tr')).toBe('unavailable');
    holder.api = fakeApi('available').api;
    expect(await c.available('en', 'tr')).toBe('available');
  });
});
