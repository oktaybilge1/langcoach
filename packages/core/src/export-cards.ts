import { toLocalDate } from './dates.js';
import type { Lesson, ReviewCard, State } from './types.js';

export type ExportFormat = 'anki' | 'quizlet' | 'csv';

export interface ExportCardsOptions {
  /** Anki deck name (default "LangCoach"). */
  deck?: string;
  /** Include cards marked "I know this" (default true). */
  includeMastered?: boolean;
  /** Clock for the filename date (default: now). */
  now?: Date;
}

export interface ExportedCards {
  filename: string;
  mime: string;
  text: string;
  count: number;
}

const TEXT_MIME = 'text/plain;charset=utf-8';
const CSV_HEADER = [
  'term',
  'translation',
  'native_translation',
  'example',
  'pronunciation',
  'note',
  'lesson',
  'language',
  'favorite',
  'mastered',
  'due',
];

interface Row {
  card: ReviewCard;
  term: string;
  lesson: Lesson | undefined;
  language: string;
  /** Note of the lesson item this card was made from (cards do not store it). */
  note: string;
}

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

function collect(state: State, includeMastered: boolean): Row[] {
  const lessons = new Map(state.lessons.map((l) => [l.id, l] as const));
  const rows: Row[] = [];
  for (const card of state.cards) {
    const term = (card.term ?? '').trim();
    if (!term) continue;
    if (!includeMastered && card.mastered) continue;
    const lesson = lessons.get(card.lessonId);
    const note = lesson?.items.find((i) => i.term === card.term)?.note ?? '';
    rows.push({ card, term, lesson, note, language: lesson?.source?.targetLanguage ?? state.profile?.targetLanguage ?? '' });
  }
  return rows.sort(
    (a, b) =>
      cmp(a.lesson?.createdAt ?? '', b.lesson?.createdAt ?? '') || cmp(a.term, b.term) || cmp(a.card.id, b.card.id),
  );
}

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Anki field: HTML-escaped, no tabs, line breaks as <br>. */
const htmlField = (s: string): string =>
  escapeHtml(s.trim().replace(/\t/g, ' ')).replace(/\r\n|\r|\n/g, '<br>');

/** Single line, no tabs: for Quizlet lines and header values. */
const flat = (s: string): string => s.replace(/[\t\r\n]+/g, ' ').trim();

/** Anki tag: lower-case, whitespace and commas to "_", at most 40 characters. */
function tagSlug(s: string): string {
  const slug = s
    .normalize('NFC')
    .trim()
    .toLowerCase()
    .replace(/[\s,]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return [...slug].slice(0, 40).join('').replace(/_+$/, '');
}

function ankiRow({ card, term, lesson, language, note }: Row): string {
  const front = htmlField(term) + (card.pronunciation?.trim() ? `<br><small>${htmlField(card.pronunciation)}</small>` : '');
  const native = card.nativeTranslation?.trim() ?? '';
  const tr = card.translation?.trim() ?? '';
  const back: string[] = [];
  if (native) {
    back.push(htmlField(native));
    if (tr && tr !== native) back.push(`<small>${htmlField(tr)}</small>`);
  } else if (tr) {
    back.push(htmlField(tr));
  }
  if (card.example?.trim()) back.push(`<i>${htmlField(card.example)}</i>`);
  if (note.trim()) back.push(htmlField(note));
  const tags = ['langcoach', tagSlug(language), tagSlug(lesson?.situation ?? '')].filter(Boolean).join(' ');
  // GUID: ids may come from imported data, so keep only [A-Za-z0-9_-] (this also rules out a leading # or ").
  return [card.id.replace(/[^A-Za-z0-9_-]/g, '_'), front, back.join('<br>'), tags].join('\t');
}

function quizletRow({ card, term }: Row): string {
  const parts = [card.translation, card.nativeTranslation].map((s) => flat(s ?? '')).filter(Boolean);
  const def = parts.length === 2 && parts[0] === parts[1] ? parts[0]! : parts.join(' / ');
  return `${flat(term)}\t${def}`;
}

/** UTF-8 byte-order mark: CSV only, so Windows Excel opens non-ASCII text correctly (never in Anki/Quizlet). */
const BOM = String.fromCharCode(0xfeff);
const LEADING_BLANK = /^[\s\p{Cc}\p{Cf}]*/u; // whitespace, control and format (zero-width, BOM) characters

/**
 * CSV-only formula guard, applied uniformly to every text cell: a cell whose first significant
 * character (after whitespace, control and zero-width characters) is = + - @, or that starts with a
 * tab, CR or LF, gets a leading apostrophe. Trade-off: terms like "-ing suffix" are prefixed too.
 */
function csvCell(s: string): string {
  let v = s;
  if (/^[\t\r\n]/.test(v) || /^[=+\-@]/.test(v.slice(LEADING_BLANK.exec(v)![0].length))) {
    v = `'${v}`;
  }
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

function csvRow({ card, term, lesson, language, note }: Row): string {
  return [
    csvCell(term),
    csvCell(card.translation ?? ''),
    csvCell(card.nativeTranslation ?? ''),
    csvCell(card.example ?? ''),
    csvCell(card.pronunciation ?? ''),
    csvCell(note),
    csvCell(lesson?.situation ?? ''),
    csvCell(language),
    String(card.favorite === true),
    String(card.mastered === true),
    csvCell(card.srs?.due ?? ''),
  ].join(',');
}

/**
 * Export review cards as Anki text-import, Quizlet (term TAB definition) or CSV.
 * Scheduling data is never exported. Pure and browser-safe.
 */
export function exportCards(state: State, format: ExportFormat, opts: ExportCardsOptions = {}): ExportedCards {
  const rows = collect(state, opts.includeMastered ?? true);
  const date = toLocalDate(opts.now ?? new Date());
  if (format === 'anki') {
    const header = [
      '#separator:tab',
      '#html:true',
      '#guid column:1',
      '#notetype:Basic',
      `#deck:${flat(opts.deck ?? 'LangCoach') || 'LangCoach'}`,
      '#tags column:4',
    ];
    return {
      filename: `langcoach-anki-${date}.txt`,
      mime: TEXT_MIME,
      text: [...header, ...rows.map(ankiRow)].join('\n') + '\n',
      count: rows.length,
    };
  }
  if (format === 'quizlet') {
    return {
      filename: `langcoach-quizlet-${date}.txt`,
      mime: TEXT_MIME,
      text: rows.map((r) => quizletRow(r) + '\n').join(''),
      count: rows.length,
    };
  }
  return {
    filename: `langcoach-cards-${date}.csv`,
    mime: 'text/csv;charset=utf-8',
    text: BOM + [CSV_HEADER.join(','), ...rows.map(csvRow)].join('\r\n') + '\r\n',
    count: rows.length,
  };
}
