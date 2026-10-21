import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { kindFromUrl, parseCapture } from '../src/lib/parse';

const fx = (n: string): unknown =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`./fixtures/${n}`, import.meta.url)), 'utf8'));

const esReq = { sourceLanguage: 'English', targetLanguage: 'European Spanish', purpose: 'ordering coffee at a cafe' };
const zhReq = { sourceLanguage: 'English', targetLanguage: 'Mandarin Chinese' };

describe('kindFromUrl', () => {
  it('accepts labs.google insight endpoints', () => {
    expect(kindFromUrl('https://labs.google/lll/api/insights/terms')).toBe('terms');
    expect(kindFromUrl('https://labs.google/lll/api/insights/grammar')).toBe('grammar');
    expect(kindFromUrl('https://labs.google/lll/api/insights/conversation')).toBe('conversation');
    expect(kindFromUrl('https://labs.google/lll/api/insights/object-descriptors')).toBe('object-descriptors');
  });
  it('rejects other hosts, paths and junk', () => {
    expect(kindFromUrl('https://example.com/lll/api/insights/terms')).toBeNull();
    expect(kindFromUrl('https://labs.google/lll/api/insights/detect-objects')).toBeNull();
    expect(kindFromUrl('https://labs.google/lll/api/insights/terms/extra')).toBeNull();
    expect(kindFromUrl('https://labs.google.evil.com/lll/api/insights/terms')).toBeNull();
    expect(kindFromUrl('not a url')).toBeNull();
    expect(kindFromUrl('')).toBeNull();
  });
  it('requires https and no port in production', () => {
    expect(kindFromUrl('http://labs.google/lll/api/insights/terms')).toBeNull();
    expect(kindFromUrl('https://labs.google:8443/lll/api/insights/terms')).toBeNull();
    expect(kindFromUrl('http://labs.google/lll/api/insights/terms', { allowLocalhost: true })).toBeNull();
    expect(kindFromUrl('ftp://localhost/lll/api/insights/terms', { allowLocalhost: true })).toBeNull();
    expect(kindFromUrl('https://localhost:5173/lll/api/insights/terms', { allowLocalhost: true })).toBe('terms');
  });
  it('accepts localhost only with allowLocalhost', () => {
    const u = 'http://localhost:5173/lll/api/insights/terms';
    expect(kindFromUrl(u)).toBeNull();
    expect(kindFromUrl(u, { allowLocalhost: true })).toBe('terms');
    expect(kindFromUrl('http://127.0.0.1:9/lll/api/insights/grammar', { allowLocalhost: true })).toBe('grammar');
    expect(kindFromUrl('http://evil.test/lll/api/insights/grammar', { allowLocalhost: true })).toBeNull();
  });
});

describe('parseCapture terms', () => {
  it('parses es vocabulary + phrases', () => {
    const p = parseCapture('terms', esReq, fx('terms-es.json'))!;
    expect(p.lessonKind).toBe('tiny_lesson');
    expect(p.sourceLanguage).toBe('English');
    expect(p.targetLanguage).toBe('European Spanish');
    expect(p.purpose).toBe('ordering coffee at a cafe');
    expect(p.situation).toBe('ordering coffee at a cafe');
    expect(p.items).toHaveLength(20);
    expect(p.items[0]).toMatchObject({ term: 'el café', translation: 'coffee' });
    expect(p.items[5]!.term).toBe('el camarero (m) / la camarera (f)');
    expect(p.items[5]!.pronunciation).toBeUndefined();
    expect(p.items[12]).toMatchObject({ term: '¿Qué va a tomar?' });
  });
  it('keeps Arabic text byte-identical and joins transliteration', () => {
    const raw = fx('terms-ar.json') as { vocabulary: { term: string }[]; phrases: { phrase: string }[] };
    const p = parseCapture('terms', { sourceLanguage: 'English', targetLanguage: 'Arabic', purpose: 'coffee' }, raw)!;
    expect(p.items).toHaveLength(6);
    expect(p.items[0]!.term).toBe(raw.vocabulary[0]!.term);
    expect(p.items[0]!.pronunciation).toBe('al-qahwa');
    expect(p.items[4]!.term).toBe(raw.phrases[0]!.phrase);
    expect(p.items[3]!.term).toBe(raw.vocabulary[3]!.term.split('\n').join(' / '));
    expect(p.items[3]!.pronunciation).toBe('an-nādil / an-nādila');
  });
});

describe('parseCapture grammar', () => {
  it('fills grammar with no items', () => {
    const p = parseCapture('grammar', esReq, fx('grammar-es.json'))!;
    expect(p.lessonKind).toBe('grammar');
    expect(p.items).toEqual([]);
    expect(p.grammar).toHaveLength(3);
    expect(p.grammar![0]!.topic).toBe('The conditional tense for polite requests');
    expect(p.grammar![0]!.examples).toHaveLength(2);
    expect(p.grammar![0]!.examples[0]!.sentence).toContain('Querría');
  });
});

describe('parseCapture conversation', () => {
  it('makes one item per note key', () => {
    const p = parseCapture('conversation', zhReq, fx('conversation-zh.json'))!;
    expect(p.lessonKind).toBe('slang_hang');
    expect(p.items.map((i) => i.term)).toEqual(['崩了', '转圈圈', '打爆', '死马当活马医']);
    expect(p.items[0]!.translation).toContain('crashing');
    expect(p.items[0]!.example).toBe('哎呀，这个外卖软件又崩了！');
    expect(p.items[0]!.pronunciation).toBe('Āiyā, zhège wàimài ruǎnjiàn yòu bēng le!');
    expect(p.situation.length).toBeLessThanOrEqual(200);
    expect(p.situation).toContain('food delivery');
  });
  it('truncates long context to 200 chars', () => {
    const p = parseCapture('conversation', zhReq, {
      context: 'x'.repeat(500),
      dialogue: [{ speaker: 'a', gender: 'f', message: '好', transliteration: 'hǎo', notes: { 好: 'good' } }],
    })!;
    expect(p.situation).toHaveLength(200);
  });
});

describe('parseCapture object-descriptors', () => {
  it('parses ja descriptors', () => {
    const p = parseCapture('object-descriptors', { sourceLanguage: 'English', targetLanguage: 'Japanese', object: 'cup' }, fx('object-descriptors-ja.json'))!;
    expect(p.lessonKind).toBe('word_cam');
    expect(p.situation).toBe('cup');
    expect(p.items).toHaveLength(2);
    expect(p.items[0]).toMatchObject({ term: 'コーヒーカップ', pronunciation: 'kōhī kappu', translation: 'coffee cup', example: 'コーヒーカップをください。' });
  });
  it('defaults situation to Word Cam', () => {
    const p = parseCapture('object-descriptors', { sourceLanguage: 'English', targetLanguage: 'Japanese' }, fx('object-descriptors-ja.json'))!;
    expect(p.situation).toBe('Word Cam');
  });
});

describe('parseCapture robustness', () => {
  const kinds = ['terms', 'grammar', 'conversation', 'object-descriptors'] as const;
  it('returns null on bad shapes', () => {
    const bads: unknown[] = [{}, null, undefined, [], 'x', 5, { vocabulary: 'x' }, { vocabulary: [{ a: 1 }], phrases: [{}] }, { dialogue: [1] }, { descriptors: [{}] }, { relevantGrammar: [{}] }];
    for (const k of kinds) {
      for (const bad of bads) expect(parseCapture(k, esReq, bad)).toBeNull();
      expect(parseCapture(k, null, fx('terms-es.json'))).toBeNull();
    }
  });
  it('never throws on schema-aware random JSON (and mostly parses past the header)', () => {
    const rnd = mulberry32(0xc0ffee);
    const pick = <T,>(a: readonly T[]): T => a[Math.floor(rnd() * a.length)]!;
    const scalar = (): unknown => pick([null, 1, -0, 3.5, 'a', true, false, '', 'x'.repeat(5000), '\n', ' a \n b ', undefined]);
    const val = (d: number): unknown => {
      const r = rnd();
      if (d <= 0 || r < 0.5) return scalar();
      if (r < 0.75) return Array.from({ length: Math.floor(rnd() * 3) }, () => val(d - 1));
      return { term: val(d - 1), phrase: val(d - 1), notes: val(d - 1) };
    };
    const maybe = (v: unknown): unknown => (rnd() < 0.2 ? val(2) : v);
    const s = (): unknown => maybe(pick(['t', 'ü', '\n', 'a\nb']));
    const arr = (f: () => unknown): unknown => (rnd() < 0.15 ? val(2) : Array.from({ length: Math.floor(rnd() * 4) }, () => (rnd() < 0.15 ? val(2) : f())));
    const example = () => ({ sentence: s(), translation: s(), transliteration: s(), explanation: s() });
    const res = (): Record<string, unknown> => ({
      vocabulary: arr(() => ({ term: s(), transliteration: s(), translation: s() })),
      phrases: arr(() => ({ phrase: s(), transliteration: s(), translation: s() })),
      relevantGrammar: arr(() => ({ topic: s(), description: s(), examples: arr(example) })),
      context: s(),
      dialogue: arr(() => ({
        speaker: s(), gender: s(), message: s(), transliteration: s(),
        notes: rnd() < 0.2 ? val(2) : Object.fromEntries(Array.from({ length: Math.floor(rnd() * 3) }, () => [pick(['k1', 'k2', '崩了']), s()])),
      })),
      descriptors: arr(() => ({ descriptor: s(), pronunciation: s(), translation: s(), exampleSentence: s() })),
    });
    let parsed = 0;
    for (let i = 0; i < 400; i++) {
      const r = res();
      for (const k of kinds) {
        let out: unknown;
        expect(() => { out = parseCapture(k, { ...esReq, object: s() }, r); }).not.toThrow();
        if (out) parsed++;
      }
    }
    expect(parsed).toBeGreaterThan(100);
  });
  it('survives hostile inputs', () => {
    const getter: Record<string, unknown> = {};
    Object.defineProperty(getter, 'vocabulary', { enumerable: true, get() { throw new Error('boom'); } });
    for (const k of kinds) expect(parseCapture(k, esReq, getter)).toBeNull();
    const evilReq = {};
    Object.defineProperty(evilReq, 'sourceLanguage', { get() { throw new Error('boom'); } });
    expect(parseCapture('terms', evilReq, fx('terms-es.json'))).toBeNull();

    const notes = JSON.parse('{"__proto__":"x","constructor":"y"}') as Record<string, string>;
    const p = parseCapture('conversation', zhReq, { context: 'c', dialogue: [{ message: 'm', transliteration: '', notes }] });
    expect(p?.items.map((i) => i.term).sort()).toEqual(['__proto__', 'constructor']);

    const big = 'x'.repeat(1_000_000);
    const t = parseCapture('terms', esReq, { vocabulary: [{ term: big, translation: big, transliteration: big }] })!;
    expect(t.items[0]!.term).toHaveLength(1_000_000);
    const c = parseCapture('conversation', zhReq, { context: big, dialogue: [{ message: 'm', notes: { k: 'v' } }] })!;
    expect(c.situation).toHaveLength(200);
  });
});

describe('parseCapture leniency and details', () => {
  it('skips malformed vocabulary entries among good ones', () => {
    const p = parseCapture('terms', esReq, {
      vocabulary: [{ term: 'a', translation: 'A' }, { bad: 1 }, null, { term: 'b', translation: 'B' }],
      phrases: 'oops',
    })!;
    expect(p.items.map((i) => i.term)).toEqual(['a', 'b']);
  });
  it('returns null when no valid item remains', () => {
    expect(parseCapture('terms', esReq, { vocabulary: [{ bad: 1 }], phrases: [null] })).toBeNull();
    expect(parseCapture('conversation', zhReq, { context: 'c', dialogue: [{ message: 'm', notes: {} }] })).toBeNull();
  });
  it('skips malformed grammar topics and examples', () => {
    const p = parseCapture('grammar', esReq, {
      relevantGrammar: [
        { topic: 'T', description: 'D', examples: [{ sentence: 's', translation: 't' }, { nope: 1 }] },
        { topic: 7 },
        null,
      ],
    })!;
    expect(p.grammar).toHaveLength(1);
    expect(p.grammar![0]!.examples).toHaveLength(1);
  });
  it('skips malformed conversation lines and notes', () => {
    const p = parseCapture('conversation', zhReq, {
      context: 'c',
      dialogue: [1, { message: 'm', notes: { good: 'g', bad: 5 } }, { message: 3, notes: { x: 'y' } }],
    })!;
    expect(p.items.map((i) => i.term)).toEqual(['good']);
  });
  it('trims lines and drops empty ones in gendered terms (intentional)', () => {
    const p = parseCapture('terms', esReq, { vocabulary: [{ term: ' a \n\n b ', translation: 't', transliteration: ' x \n y ' }] })!;
    expect(p.items[0]).toMatchObject({ term: 'a / b', pronunciation: 'x / y' });
  });
  it('truncates context by code points', () => {
    const context = 'a'.repeat(199) + '😀' + 'tail';
    const p = parseCapture('conversation', zhReq, { context, dialogue: [{ message: 'm', notes: { k: 'v' } }] })!;
    expect(Array.from(p.situation)).toHaveLength(200);
    expect(p.situation.endsWith('😀')).toBe(true);
  });
  it('uses Tiny Lesson situation without purpose', () => {
    const p = parseCapture('terms', { sourceLanguage: 'English', targetLanguage: 'European Spanish' }, fx('terms-es.json'))!;
    expect(p.situation).toBe('Tiny Lesson');
    expect(p.purpose).toBeUndefined();
  });
});

function mulberry32(a: number): () => number {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
