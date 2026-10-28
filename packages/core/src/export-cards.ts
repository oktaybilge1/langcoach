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
  return [flat(card.id).replace(/\s+/g, '_'), front, back.join('<br>'), tags].join('\t');
}

function quizletRow({ card, term }: Row): string {
  const parts = [card.translation, card.nativeTranslation].map((s) => flat(s ?? '')).filter(Boolean);
  const def = parts.length === 2 && parts[0] === parts[1] ? parts[0]! : parts.join(' / ');
  return `${flat(term)}\t${def}`;
}

/** Cells starting with = + - @ get a leading apostrophe so spreadsheets do not run them as formulas (CSV only). */
function csvCell(s: string, guard = true): string {
  let v = s;
  if (guard && /^[=+\-@]/.test(v)) v = `'${v}`;
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
    csvCell(card.srs?.due ?? '', false),
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
    text: [CSV_HEADER.join(','), ...rows.map(csvRow)].join('\r\n') + '\r\n',
    count: rows.length,
  };
}
