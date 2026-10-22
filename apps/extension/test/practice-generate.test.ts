import { describe, expect, it } from 'vitest';
import type { ReviewCard } from '@langcoach/core/browser';
import {
  blankSentence,
  buildSession,
  meaningOf,
  type Exercise,
  type SessionOptions,
} from '../src/lib/practice/generate';
import { normalizeAnswer } from '../src/lib/practice/check';
import { mulberry32 } from '../src/lib/practice/rng';

const NOW = new Date('2026-10-22T12:00:00.000Z');

function card(i: number, over: Partial<ReviewCard> = {}, srs: Partial<ReviewCard['srs']> = {}): ReviewCard {
  return {
    id: `c${i}`,
    lessonId: 'l1',
    term: `palabra${i}`,
    translation: `word ${i}`,
    example: `Esta es la palabra${i} de hoy.`,
    srs: {
      due: '2026-10-30T00:00:00.000Z',
      stability: 5,
      difficulty: 5,
      elapsed_days: 0,
      scheduled_days: 0,
      learning_steps: 0,
      reps: 2,
      lapses: 0,
      state: 2,
      ...srs,
    },
    ...over,
  };
}

const deck = (n: number) => Array.from({ length: n }, (_, i) => card(i));
const opts = (o: Partial<SessionOptions> = {}): SessionOptions => ({
  now: NOW,
  seed: 1,
  canSpeak: true,
  nativeFirst: false,
  lang: 'es-ES',
  ...o,
});

function ok(r: ReturnType<typeof buildSession>): Exercise[] {
  if (!Array.isArray(r)) throw new Error(`expected a session, got ${JSON.stringify(r)}`);
  return r;
}

const key = (s: string, lang = 'es-ES') => normalizeAnswer(s, lang).replace(/\s+/g, '');

describe('buildSession basics', () => {
  it('needs at least 4 usable cards', () => {
    expect(buildSession(deck(3), opts())).toEqual({ error: 'not_enough_cards', needed: 4 });
    expect(buildSession([...deck(3), card(9, { term: '  ', translation: 'x' })], opts())).toEqual({
      error: 'not_enough_cards',
      needed: 4,
    });
    expect(Array.isArray(buildSession(deck(4), opts()))).toBe(true);
  });

  it('builds 10 exercises by default and respects size', () => {
    expect(ok(buildSession(deck(20), opts()))).toHaveLength(10);
    expect(ok(buildSession(deck(20), opts({ size: 6 })))).toHaveLength(6);
    expect(ok(buildSession(deck(4), opts()))).toHaveLength(10);
  });

  it('has exactly one match (5 cards) when >= 5 cards, none with 4', () => {
    const s = ok(buildSession(deck(12), opts()));
    const matches = s.filter((e) => e.kind === 'match');
    expect(matches).toHaveLength(1);
    expect(matches[0]!.cardIds).toHaveLength(5);
    expect(new Set(matches[0]!.cardIds).size).toBe(5);
    expect(ok(buildSession(deck(4), opts())).some((e) => e.kind === 'match')).toBe(false);
  });

  it('mixes kinds: no two consecutive exercises of the same kind when the deck allows it', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const s = ok(buildSession(deck(15), opts({ seed })));
      for (let i = 1; i < s.length; i++) expect(s[i]!.kind).not.toBe(s[i - 1]!.kind);
      expect(new Set(s.map((e) => e.kind)).size).toBeGreaterThanOrEqual(4);
    }
  });

  it('listen only when canSpeak', () => {
    for (let seed = 1; seed <= 20; seed++) {
      expect(ok(buildSession(deck(15), opts({ seed, canSpeak: false }))).some((e) => e.kind === 'listen')).toBe(false);
    }
    const any = Array.from({ length: 20 }, (_, i) => ok(buildSession(deck(15), opts({ seed: i + 1 }))))
      .flat()
      .some((e) => e.kind === 'listen');
    expect(any).toBe(true);
  });

  it('is deterministic per seed with deterministic ids', () => {
    const a = buildSession(deck(15), opts({ seed: 99 }));
    const b = buildSession(deck(15), opts({ seed: 99 }));
    expect(a).toEqual(b);
    const c = buildSession(deck(15), opts({ seed: 100 }));
    expect(c).not.toEqual(a);
    const ids = ok(a).map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('does not mutate the input deck', () => {
    const d = deck(8);
    const snap = JSON.stringify(d);
    buildSession(d, opts());
    expect(JSON.stringify(d)).toBe(snap);
  });
});

describe('card selection', () => {
  it('prefers due, then new, then weak; mastered only when nothing else fills', () => {
    const due = [card(1, {}, { due: '2026-10-01T00:00:00.000Z' }), card(2, {}, { due: '2026-10-20T00:00:00.000Z' })];
    const fresh = [card(3, {}, { reps: 0, state: 0, stability: 0, due: NOW.toISOString() })];
    const weak = [card(4, {}, { stability: 0.5 }), card(5, {}, { stability: 0.7 })];
    const strong = Array.from({ length: 20 }, (_, i) => card(100 + i, {}, { stability: 50 + i }));
    const mastered = Array.from({ length: 5 }, (_, i) => card(200 + i, { mastered: true }, { stability: 0.1 }));
    const s = ok(buildSession([...strong, ...mastered, ...weak, ...fresh, ...due], opts({ size: 6 })));
    const used = new Set(s.flatMap((e) => e.cardIds));
    for (const id of ['c1', 'c2', 'c3', 'c4', 'c5']) expect(used.has(id)).toBe(true);
    for (const m of mastered) expect(used.has(m.id)).toBe(false);
  });

  it('uses mastered cards when the deck has nothing else', () => {
    const d = Array.from({ length: 4 }, (_, i) => card(i, { mastered: true }));
    expect(ok(buildSession(d, opts()))).toHaveLength(10);
    const mixed = [card(1), card(2), ...Array.from({ length: 3 }, (_, i) => card(10 + i, { mastered: true }))];
    const used = new Set(ok(buildSession(mixed, opts())).flatMap((e) => e.cardIds));
    expect(used.has('c10') || used.has('c11') || used.has('c12')).toBe(true);
  });

  it('new cards are not first asked as type-it', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const d = Array.from({ length: 12 }, (_, i) => card(i, {}, { reps: 0, state: 0, due: NOW.toISOString() }));
      const s = ok(buildSession(d, opts({ seed })));
      const seen = new Set<string>();
      for (const e of s) {
        if (e.kind !== 'match' && !seen.has(e.cardIds[0]!)) expect(e.kind).not.toBe('type');
        for (const id of e.cardIds) seen.add(id);
      }
    }
  });
});

describe('meanings', () => {
  it('uses native translation when nativeFirst and present', () => {
    const c = card(1, { nativeTranslation: 'kelime' });
    expect(meaningOf(c, true)).toBe('kelime');
    expect(meaningOf(c, false)).toBe('word 1');
    expect(meaningOf(card(2), true)).toBe('word 2');
    expect(meaningOf(card(3, { nativeTranslation: '  ' }), true)).toBe('word 3');
  });
});

describe('blank', () => {
  it('Latin: case-insensitive whole word', () => {
    expect(blankSentence('Casa', 'Mi casa es tu casa.', 'es-ES')).toBe('Mi ____ es tu casa.');
    expect(blankSentence('casa', 'Casamiento feliz', 'es-ES')).toBeNull();
    expect(blankSentence('año', 'Feliz año nuevo', 'es-ES')).toBe('Feliz ____ nuevo');
    expect(blankSentence('ano', 'Feliz año nuevo', 'es-ES')).toBeNull();
    expect(blankSentence('el camarero (m) / la camarera (f)', 'Llama a la camarera, por favor.', 'es-ES')).toBe(
      'Llama a ____, por favor.',
    );
    expect(blankSentence('x', '', 'es-ES')).toBeNull();
  });
  it('CJK / no-space scripts: substring', () => {
    expect(blankSentence('水', '我想喝水。', 'zh-CN')).toBe('我想喝____。');
    expect(blankSentence('コーヒー', 'コーヒーをください', 'ja')).toBe('____をください');
    expect(blankSentence('กาแฟ', 'ขอกาแฟหนึ่งแก้ว', 'th')).toBe('ขอ____หนึ่งแก้ว');
  });
  it('blank exercises only for cards whose example contains the term', () => {
    const d = deck(12).map((c, i) => (i % 2 ? { ...c, example: 'Nothing here.' } : c));
    for (let seed = 1; seed <= 20; seed++) {
      for (const e of ok(buildSession(d, opts({ seed })))) {
        if (e.kind !== 'blank') continue;
        const c = d.find((x) => x.id === e.cardIds[0])!;
        expect(c.example).not.toBe('Nothing here.');
        expect(e.prompt.sentence).toContain('____');
        expect(e.options).toContain(e.answer);
      }
    }
  });
});

// ---- Review Focus 1: property test over random decks ----

const TERMS = ['casa', 'Casa', 'perro', 'gato', 'el camarero (m) / la camarera (f)', 'año', 'agua', 'café', 'cafe', 'hola', '¿qué?', 'sí', 'si'];
const MEANINGS = ['house', 'House', 'dog', 'cat', 'waiter', 'year', 'water', 'coffee', 'Coffee!', 'hello', 'what?', 'yes', ''];

function randomDeck(rnd: () => number): ReviewCard[] {
  const n = 4 + Math.floor(rnd() * 9); // 4..12
  const out: ReviewCard[] = [];
  for (let i = 0; i < n; i++) {
    const t = TERMS[Math.floor(rnd() * TERMS.length)]!;
    const m = MEANINGS[Math.floor(rnd() * MEANINGS.length)]!;
    const r = rnd();
    out.push(
      card(
        i,
        {
          term: rnd() < 0.3 ? t : `${t}${i}`,
          translation: rnd() < 0.4 ? m : `${m} ${i}`,
          example: rnd() < 0.5 ? `Hay ${t} aquí.` : '',
          ...(rnd() < 0.3 ? { nativeTranslation: rnd() < 0.5 ? m : `anlam ${i}` } : {}),
          ...(rnd() < 0.15 ? { mastered: true } : {}),
        },
        r < 0.3
          ? { reps: 0, state: 0, stability: 0, due: NOW.toISOString() }
          : r < 0.6
            ? { due: '2026-10-01T00:00:00.000Z', stability: rnd() * 10 }
            : { stability: rnd() * 30 },
      ),
    );
  }
  return out;
}

describe('Review Focus 1: options are always sane', () => {
  it('300 random decks incl. duplicates, identical terms and 4-card decks', () => {
    const rnd = mulberry32(12345);
    let sessions = 0;
    let exercises = 0;
    for (let k = 0; k < 300; k++) {
      const d = k < 40 ? randomDeck(rnd).slice(0, 4) : randomDeck(rnd);
      const nativeFirst = rnd() < 0.5;
      const r = buildSession(d, opts({ seed: k, nativeFirst, canSpeak: rnd() < 0.7 }));
      if (!Array.isArray(r)) {
        expect(r).toEqual({ error: 'not_enough_cards', needed: 4 });
        continue;
      }
      sessions++;
      expect(r.length).toBe(10);
      expect(r.filter((e) => e.kind === 'match').length).toBeLessThanOrEqual(1);
      for (let i = 1; i < r.length; i++) {
        expect(r[i]!.kind === 'match' && r[i - 1]!.kind === 'match').toBe(false);
      }
      for (const e of r) {
        exercises++;
        const byId = (id: string) => d.find((c) => c.id === id)!;
        for (const id of e.cardIds) expect(byId(id)).toBeDefined();
        if (e.kind === 'match') {
          const pairs = e.answer as [string, string][];
          expect(pairs).toHaveLength(5);
          expect(new Set(pairs.map(([t]) => key(t))).size).toBe(5);
          expect(new Set(pairs.map(([, m]) => key(m, 'und'))).size).toBe(5);
          for (const [t, m] of pairs) {
            expect(t.trim()).not.toBe('');
            expect(m.trim()).not.toBe('');
          }
          expect([...(e.prompt.terms ?? [])].sort()).toEqual(pairs.map(([t]) => t).sort());
          expect([...(e.prompt.meanings ?? [])].sort()).toEqual(pairs.map(([, m]) => m).sort());
          continue;
        }
        expect(typeof e.answer).toBe('string');
        const ans = e.answer as string;
        expect(ans.trim()).not.toBe('');
        if (e.kind === 'type') {
          expect(e.options).toBeUndefined();
          continue;
        }
        const o = e.options!;
        expect(o).toHaveLength(4);
        for (const x of o) expect(x.trim()).not.toBe('');
        const lang = e.kind === 'meaning' ? 'und' : 'es-ES';
        expect(new Set(o.map((x) => key(x, lang))).size).toBe(4);
        expect(o.filter((x) => x === ans)).toHaveLength(1);
        // a distractor must not share the prompt side with the answer card (otherwise it would also be right)
        const c = byId(e.cardIds[0]!);
        const others = d.filter((x) => x.id !== c.id);
        for (const x of o) {
          if (x === ans) continue;
          if (e.kind === 'meaning') {
            expect(others.some((y) => meaningOf(y, nativeFirst) === x)).toBe(true);
            // no card with the same term may have this meaning (homonyms would make it correct too)
            for (const y of d.filter((y) => key(y.term) === key(c.term))) {
              expect(key(meaningOf(y, nativeFirst), 'und')).not.toBe(key(x, 'und'));
            }
          } else {
            expect(key(x)).not.toBe(key(ans));
            // no card with the same meaning may have this term (synonyms would make it correct too)
            const cm = key(meaningOf(c, nativeFirst), 'und');
            for (const y of d.filter((y) => key(meaningOf(y, nativeFirst), 'und') === cm)) {
              if (e.kind === 'blank') continue;
              expect(key(y.term)).not.toBe(key(x));
            }
          }
        }
      }
    }
    expect(sessions).toBeGreaterThan(200);
    expect(exercises).toBeGreaterThan(2000);
  });
});
