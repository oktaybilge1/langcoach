import { describe, expect, test } from 'vitest';
import { emptyState, exportCards, type Lesson, type ReviewCard, type State } from '../src/index.js';

const NOW = new Date(2026, 9, 20, 10, 0);

function card(over: Partial<ReviewCard> & { id: string; term: string }): ReviewCard {
  return {
    lessonId: 'L1',
    translation: 'tr',
    example: '',
    srs: { due: '2026-10-21T08:00:00.000Z' } as ReviewCard['srs'],
    ...over,
  };
}
const withNotes = (notes: Record<string, string>): Lesson => ({
  ...POLISH,
  items: Object.entries(notes).map(([term, note]) => ({ term, translation: '', example: '', note })),
});
function lesson(over: Partial<Lesson> & { id: string }): Lesson {
  return { kind: 'tiny_lesson', situation: 'Ordering coffee', items: [], createdAt: '2026-10-01T00:00:00.000Z', ...over };
}
const POLISH = lesson({ id: 'L1', source: { app: 'lll', targetLanguage: 'Polish', sourceLanguage: 'English' } });
function stateWith(cards: ReviewCard[], lessons: Lesson[] = [POLISH]): State {
  return { ...emptyState(), lessons, cards };
}

describe('exportCards: anki', () => {
  test('header, columns, tags, filename, mime', () => {
    const s = stateWith([
      card({ id: 'c1', term: 'kawa', pronunciation: 'KA-va', translation: 'coffee', nativeTranslation: 'kahve', example: 'Poproszę kawę.' }),
    ], [withNotes({ kawa: 'feminine' })]);
    const r = exportCards(s, 'anki', { now: NOW });
    expect(r.filename).toBe('langcoach-anki-2026-10-20.txt');
    expect(r.mime).toBe('text/plain;charset=utf-8');
    expect(r.count).toBe(1);
    const lines = r.text.split('\n');
    expect(lines.slice(0, 6)).toEqual([
      '#separator:tab',
      '#html:true',
      '#guid column:1',
      '#notetype:Basic',
      '#deck:LangCoach',
      '#tags column:4',
    ]);
    expect(lines[6]).toBe(
      ['c1', 'kawa<br><small>KA-va</small>', 'kahve<br><small>coffee</small><br><i>Poproszę kawę.</i><br>feminine', 'langcoach polish ordering_coffee'].join('\t'),
    );
    expect(r.text.endsWith('\n')).toBe(true);
  });

  test('custom deck; translation only when no native', () => {
    const r = exportCards(stateWith([card({ id: 'a', term: 'x', translation: 'y' })]), 'anki', { deck: 'My Deck', now: NOW });
    expect(r.text).toContain('#deck:My Deck\n');
    expect(r.text.split('\n')[6]).toBe('a\tx\ty\tlangcoach polish ordering_coffee');
  });

  test('escapes HTML, converts newlines to <br>, strips tabs', () => {
    const r = exportCards(
      stateWith([card({ id: 'a', term: '<b>&"x"', translation: 'one\ttwo\nthree\r\nfour', example: 'a < b' })]),
      'anki',
      { now: NOW },
    );
    const cols = r.text.split('\n')[6]!.split('\t');
    expect(cols).toHaveLength(4);
    expect(cols[1]).toBe('&lt;b&gt;&amp;&quot;x&quot;');
    expect(cols[2]).toBe('one two<br>three<br>four<br><i>a &lt; b</i>');
  });

  test('tags: slugged, no commas, <=40 chars; missing parts omitted', () => {
    const long = 'A very long situation, with commas and more words than forty characters';
    const s = stateWith([card({ id: 'a', term: 'x' })], [lesson({ id: 'L1', situation: long })]);
    const tags = exportCards(s, 'anki', { now: NOW }).text.split('\n')[6]!.split('\t')[3]!.split(' ');
    expect(tags[0]).toBe('langcoach');
    expect(tags).toHaveLength(2); // no language known -> omitted
    expect(tags[1]!.length).toBeLessThanOrEqual(40);
    expect(tags[1]).not.toMatch(/[,\s]/);
    const s2 = {
      ...stateWith([card({ id: 'a', term: 'x' })], [lesson({ id: 'L1', situation: '  ' })]),
      profile: { targetLanguage: 'Spanish (Spain)' } as State['profile'],
    };
    expect(exportCards(s2, 'anki', { now: NOW }).text.split('\n')[6]!.split('\t')[3]).toBe('langcoach spanish_(spain)');
  });

  test('GUID is the card id and stable across exports', () => {
    const s = stateWith([card({ id: 'card-1', term: 'x' }), card({ id: 'card-2', term: 'y' })]);
    const a = exportCards(s, 'anki', { now: NOW });
    const b = exportCards(s, 'anki', { now: new Date(2027, 0, 1) });
    const guids = (t: string) => t.split('\n').slice(6).filter(Boolean).map((l) => l.split('\t')[0]);
    expect(guids(a.text)).toEqual(['card-1', 'card-2']);
    expect(guids(a.text)).toEqual(guids(b.text));
  });

  test('empty state yields header only, count 0', () => {
    const r = exportCards(emptyState(), 'anki', { now: NOW });
    expect(r.count).toBe(0);
    expect(r.text.split('\n').filter(Boolean)).toHaveLength(6);
  });
});

describe('exportCards: quizlet', () => {
  test('term<TAB>definition, joined with " / ", no header', () => {
    const r = exportCards(stateWith([card({ id: 'a', term: 'kawa', translation: 'coffee', nativeTranslation: 'kahve' })]), 'quizlet', { now: NOW });
    expect(r.filename).toBe('langcoach-quizlet-2026-10-20.txt');
    expect(r.mime).toBe('text/plain;charset=utf-8');
    expect(r.text).toBe('kawa\tcoffee / kahve\n');
  });
  test('tabs/newlines flattened; no native -> translation only', () => {
    const r = exportCards(stateWith([card({ id: 'a', term: 'a\tb\nc', translation: 'x\ny' })]), 'quizlet', { now: NOW });
    expect(r.text).toBe('a b c\tx y\n');
  });
  test('empty -> empty text', () => {
    expect(exportCards(emptyState(), 'quizlet', { now: NOW })).toMatchObject({ text: '', count: 0 });
  });
});

describe('exportCards: csv', () => {
  const HEADER = 'term,translation,native_translation,example,pronunciation,note,lesson,language,favorite,mastered,due';
  test('header, row, filename', () => {
    const r = exportCards(
      stateWith([card({ id: 'a', term: 'kawa', translation: 'coffee', nativeTranslation: 'kahve', example: 'Tak.', pronunciation: 'KA-va', favorite: true })], [withNotes({ kawa: 'n' })]),
      'csv',
      { now: NOW },
    );
    expect(r.filename).toBe('langcoach-cards-2026-10-20.csv');
    expect(r.mime).toBe('text/csv;charset=utf-8');
    expect(r.text.split('\r\n')).toEqual([
      HEADER,
      'kawa,coffee,kahve,Tak.,KA-va,n,Ordering coffee,Polish,true,false,2026-10-21T08:00:00.000Z',
      '',
    ]);
  });
  test('RFC 4180 quoting', () => {
    const r = exportCards(stateWith([card({ id: 'a', term: 'a,b', translation: 'say "hi"', example: 'l1\nl2' })]), 'csv', { now: NOW });
    expect(r.text).toContain('"a,b","say ""hi""",,"l1\nl2",');
  });
  test('formula injection guarded only in CSV', () => {
    const s = stateWith([card({ id: 'a', term: '=SUM(A1)', translation: '+1', example: '-x' })], [withNotes({ '=SUM(A1)': '@u' })]);
    const csv = exportCards(s, 'csv', { now: NOW }).text.split('\r\n')[1]!;
    expect(csv.startsWith("'=SUM(A1),'+1,,'-x,,'@u,")).toBe(true);
    expect(exportCards(s, 'quizlet', { now: NOW }).text).toBe('=SUM(A1)\t+1\n');
    expect(exportCards(s, 'anki', { now: NOW }).text).toContain('\na\t=SUM(A1)\t');
  });
  test('empty -> header only', () => {
    expect(exportCards(emptyState(), 'csv', { now: NOW }).text).toBe(HEADER + '\r\n');
  });
});

describe('exportCards: common', () => {
  test('Unicode preserved byte-for-byte', () => {
    const terms = ['مرحبا', '你好', 'Ünïcødé 😀'];
    const s = stateWith(terms.map((t, i) => card({ id: `c${i}`, term: t, translation: t + '!' })));
    for (const f of ['anki', 'quizlet', 'csv'] as const) {
      const r = exportCards(s, f, { now: NOW });
      for (const t of terms) expect(r.text).toContain(t);
      expect(Buffer.from(r.text, 'utf8').toString('utf8')).toBe(r.text);
    }
  });
  test('skips empty terms; includeMastered false drops mastered', () => {
    const s = stateWith([card({ id: 'a', term: '  ' }), card({ id: 'b', term: 'keep' }), card({ id: 'c', term: 'done', mastered: true })]);
    expect(exportCards(s, 'quizlet', { now: NOW }).count).toBe(2);
    const r = exportCards(s, 'quizlet', { includeMastered: false, now: NOW });
    expect(r.count).toBe(1);
    expect(r.text).toBe('keep\ttr\n');
  });
  test('deterministic order: lesson createdAt, then term; input order irrelevant', () => {
    const lessons = [
      lesson({ id: 'L1', createdAt: '2026-10-02T00:00:00.000Z' }),
      lesson({ id: 'L2', createdAt: '2026-10-01T00:00:00.000Z' }),
    ];
    const cards = [
      card({ id: '1', term: 'b', lessonId: 'L1' }),
      card({ id: '2', term: 'z', lessonId: 'L2' }),
      card({ id: '3', term: 'a', lessonId: 'L1' }),
      card({ id: '4', term: 'm', lessonId: 'L2' }),
    ];
    const terms = (cs: ReviewCard[]) =>
      exportCards(stateWith(cs, lessons), 'quizlet', { now: NOW }).text.split('\n').filter(Boolean).map((l) => l.split('\t')[0]);
    expect(terms(cards)).toEqual(['m', 'z', 'a', 'b']);
    expect(terms([...cards].reverse())).toEqual(['m', 'z', 'a', 'b']);
  });
});
