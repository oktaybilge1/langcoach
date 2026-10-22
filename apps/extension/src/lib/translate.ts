import { resolveLanguage } from './languages';

/**
 * On-device translation through Chrome's built-in Translator API (Chrome 138+ desktop). Feature-detected:
 * no API, an unsupported pair, a model that is not downloaded yet, or any error means "no translation"
 * (null), and callers keep showing the English meaning. Nothing here ever throws or touches the network.
 */

export type Availability = 'available' | 'downloadable' | 'downloading' | 'unavailable';
export type ReadyStatus = 'available' | 'needs_download' | 'downloading' | 'unavailable';

interface TranslatorLike {
  translate(text: string): Promise<string>;
  destroy?(): void;
}

export interface TranslatorApi {
  availability(o: { sourceLanguage: string; targetLanguage: string }): Promise<string>;
  create(o: {
    sourceLanguage: string;
    targetLanguage: string;
    monitor?: (m: EventTarget) => void;
  }): Promise<TranslatorLike>;
}

export interface TranslatorCache {
  available(src: string, dst: string): Promise<Availability>;
  /**
   * Makes the pair usable. Creating a translator for a model that still has to be downloaded needs a user
   * activation, so with `userGesture: false` this only reports 'needs_download' / 'downloading'. With
   * `userGesture: true` (call it straight from a click handler) `create` starts before the first await.
   */
  ensureReady(
    src: string,
    dst: string,
    opts: { userGesture: boolean; onProgress?: (loaded: number) => void },
  ): Promise<ReadyStatus>;
  /** One result per input (same order); null where no translation is available. Deduped and cached. */
  translateMany(texts: string[], src: string, dst: string): Promise<(string | null)[]>;
}

/** Longest stored native translation (core setNativeTranslations limit). */
export const MAX_NATIVE_CHARS = 500;

const STATES: readonly string[] = ['available', 'downloadable', 'downloading', 'unavailable'];

/** Native-language names as onboarding stores them, plus localized names and codes → Translator codes. */
const NATIVE: Record<string, string> = {
  english: 'en',
  ingilizce: 'en',
  'i̇ngilizce': 'en',
  inglés: 'en',
  ingles: 'en',
  anglais: 'en',
  inglês: 'en',
  turkish: 'tr',
  türkçe: 'tr',
  turkce: 'tr',
  turco: 'tr',
  turc: 'tr',
  spanish: 'es',
  español: 'es',
  espanol: 'es',
  espagnol: 'es',
  espanhol: 'es',
  french: 'fr',
  français: 'fr',
  francais: 'fr',
  francés: 'fr',
  francês: 'fr',
  portuguese: 'pt',
  português: 'pt',
  portugues: 'pt',
  portugués: 'pt',
  german: 'de',
  deutsch: 'de',
  arabic: 'ar',
  chinese: 'zh',
  japanese: 'ja',
  korean: 'ko',
  russian: 'ru',
  hindi: 'hi',
  italian: 'it',
  italiano: 'it',
  dutch: 'nl',
  polish: 'pl',
  ukrainian: 'uk',
  vietnamese: 'vi',
  indonesian: 'id',
  greek: 'el',
  hebrew: 'he',
  persian: 'fa',
  urdu: 'ur',
  bengali: 'bn',
  thai: 'th',
};

const CODES = new Set([...Object.values(NATIVE), 'zh-Hant']);

/** Translator code for the learner's native language, or null (unknown / "Other" → feature off). */
export function nativeLanguageCode(name: unknown): string | null {
  if (typeof name !== 'string') return null;
  const n = name.trim().toLocaleLowerCase();
  if (n === '') return null;
  if (NATIVE[n]) return NATIVE[n]!;
  const base = n.split(/[-_]/)[0]!;
  if (/^[a-z]{2,3}$/.test(base) && CODES.has(base)) {
    if (base === 'zh' && /^zh[-_](hant|tw|hk)/.test(n)) return 'zh-Hant';
    return base;
  }
  return null;
}

/** Translator code for an LLL language name ("English", "Taiwanese Mandarin", …), or null if unknown. */
export function translatorCode(lllName: unknown): string | null {
  if (typeof lllName !== 'string' || lllName.trim() === '') return null;
  const { bcp47 } = resolveLanguage(lllName);
  if (bcp47 === 'und') return null;
  if (bcp47 === 'zh-TW' || bcp47 === 'zh-HK') return 'zh-Hant';
  return bcp47.split('-')[0]!.toLowerCase();
}

/**
 * The translation pair for meanings written in `sourceLanguage` (LLL name; absent → English, as for
 * manual cards) shown to a learner whose native language is `nativeLanguage`. Null when translation is
 * off: unknown native language, unknown source, or the same language.
 */
export function translationPair(
  sourceLanguage: string | undefined,
  nativeLanguage: unknown,
): { source: string; target: string } | null {
  const target = nativeLanguageCode(nativeLanguage);
  if (!target) return null;
  const source = sourceLanguage === undefined ? 'en' : translatorCode(sourceLanguage);
  if (!source) return null;
  if (source.split('-')[0] === target.split('-')[0]) return null;
  return { source, target };
}

const globalApi = (): TranslatorApi | undefined => {
  const g = globalThis as { Translator?: TranslatorApi };
  return 'Translator' in globalThis ? g.Translator : undefined;
};

export function createTranslatorCache(
  api?: TranslatorApi,
  getGlobal: () => TranslatorApi | undefined = globalApi,
): TranslatorCache {
  const getApi = () => api ?? getGlobal();
  /** Pair key → translator being created / created (a failed create is forgotten so it can be retried). */
  const translators = new Map<string, Promise<TranslatorLike | null>>();
  const results = new Map<string, Promise<string | null>>();
  const key = (src: string, dst: string) => `${src}\u0000${dst}`;

  async function available(src: string, dst: string): Promise<Availability> {
    try {
      const a = getApi();
      if (!a || typeof a.availability !== 'function') return 'unavailable';
      const r = await a.availability({ sourceLanguage: src, targetLanguage: dst });
      return STATES.includes(r) ? (r as Availability) : 'unavailable';
    } catch {
      return 'unavailable';
    }
  }

  /** Starts `create` synchronously (keeps the click's user activation); caches the promise. */
  function create(src: string, dst: string, onProgress?: (loaded: number) => void): Promise<TranslatorLike | null> {
    const k = key(src, dst);
    const existing = translators.get(k);
    if (existing) return existing;
    let p: Promise<TranslatorLike | null>;
    try {
      const a = getApi();
      if (!a || typeof a.create !== 'function') return Promise.resolve(null);
      p = Promise.resolve(
        a.create({
          sourceLanguage: src,
          targetLanguage: dst,
          monitor(m: EventTarget) {
            try {
              m.addEventListener('downloadprogress', (e) => {
                const loaded = (e as Event & { loaded?: unknown }).loaded;
                if (typeof loaded === 'number' && onProgress) onProgress(loaded);
              });
            } catch {
              /* progress is optional */
            }
          },
        }),
      ).then(
        (t) => (t && typeof t.translate === 'function' ? t : null),
        () => null,
      );
    } catch {
      p = Promise.resolve(null);
    }
    translators.set(k, p);
    void p.then((t) => {
      if (!t && translators.get(k) === p) translators.delete(k);
    });
    return p;
  }

  async function ensureReady(
    src: string,
    dst: string,
    opts: { userGesture: boolean; onProgress?: (loaded: number) => void },
  ): Promise<ReadyStatus> {
    if (opts.userGesture) {
      // No await before create(): the model download needs the click's transient activation.
      return (await create(src, dst, opts.onProgress)) ? 'available' : 'unavailable';
    }
    const k = key(src, dst);
    if (translators.has(k)) return (await translators.get(k)) ? 'available' : 'unavailable';
    const a = await available(src, dst);
    if (a === 'downloadable') return 'needs_download';
    if (a !== 'available') return a;
    return (await create(src, dst)) ? 'available' : 'unavailable';
  }

  async function translateOne(t: TranslatorLike, text: string): Promise<string | null> {
    try {
      const out = await t.translate(text);
      if (typeof out !== 'string') return null;
      const trimmed = out.trim();
      return trimmed === '' ? null : [...trimmed].slice(0, MAX_NATIVE_CHARS).join('');
    } catch {
      return null;
    }
  }

  async function translateMany(texts: string[], src: string, dst: string): Promise<(string | null)[]> {
    try {
      const list = Array.isArray(texts) ? texts : [];
      const clean = list.map((s) => (typeof s === 'string' ? s.trim() : ''));
      if (!clean.some((s) => s !== '')) return clean.map(() => null);
      if ((await ensureReady(src, dst, { userGesture: false })) !== 'available') return clean.map(() => null);
      const t = await create(src, dst);
      if (!t) return clean.map(() => null);
      const unique = [...new Set(clean.filter((s) => s !== ''))];
      for (const s of unique) {
        const rk = `${key(src, dst)}\u0000${s}`;
        if (!results.has(rk)) {
          // Sequential per pair keeps the on-device model from being flooded.
          const p = translateOne(t, s);
          results.set(rk, p);
          void p.then((r) => {
            if (r === null) results.delete(rk); // retry a failed text later
          });
          await p;
        }
      }
      return Promise.all(clean.map((s) => (s === '' ? null : results.get(`${key(src, dst)}\u0000${s}`) ?? null)));
    } catch {
      return (Array.isArray(texts) ? texts : []).map(() => null);
    }
  }

  return { available, ensureReady, translateMany };
}
