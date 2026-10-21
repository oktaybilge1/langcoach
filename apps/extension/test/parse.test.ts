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
  it('never throws on random JSON', () => {
    let seed = 12345;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const keys = ['vocabulary', 'phrases', 'term', 'phrase', 'translation', 'transliteration', 'relevantGrammar', 'examples', 'dialogue', 'notes', 'message', 'context', 'descriptors', 'descriptor', 'sourceLanguage', 'targetLanguage', 'object'];
    const gen = (d: number): unknown => {
      const r = rnd();
      if (d <= 0 || r < 0.25) return [null, 1, 'a', true, ''][Math.floor(rnd() * 5)];
      if (r < 0.6) return Array.from({ length: Math.floor(rnd() * 4) }, () => gen(d - 1));
      const o: Record<string, unknown> = {};
      for (let i = 0; i < Math.floor(rnd() * 5); i++) o[keys[Math.floor(rnd() * keys.length)]!] = gen(d - 1);
      return o;
    };
    for (let i = 0; i < 200; i++) {
      const req = gen(2);
      const res = gen(4);
      for (const k of kinds) expect(() => parseCapture(k, req, res)).not.toThrow();
    }
  });
});
