import type { Lesson } from '@langcoach/core/browser';

export type CaptureKind = 'terms' | 'grammar' | 'conversation' | 'object-descriptors';

export interface ParsedCapture {
  lessonKind: 'tiny_lesson' | 'slang_hang' | 'word_cam' | 'grammar';
  sourceLanguage: string;
  targetLanguage: string;
  purpose?: string;
  situation: string;
  items: { term: string; translation: string; example: string; pronunciation?: string; note?: string }[];
  grammar?: Lesson['grammar'];
}

const KINDS: readonly string[] = ['terms', 'grammar', 'conversation', 'object-descriptors'];
const PATH_RE = /^\/lll\/api\/insights\/([a-z-]+)$/;

export function kindFromUrl(url: string, opts?: { allowLocalhost?: boolean }): CaptureKind | null {
  try {
    const u = new URL(url);
    const hostOk =
      u.hostname === 'labs.google' ||
      (!!opts?.allowLocalhost && (u.hostname === 'localhost' || u.hostname === '127.0.0.1'));
    if (!hostOk) return null;
    const kind = PATH_RE.exec(u.pathname)?.[1];
    return kind && KINDS.includes(kind) ? (kind as CaptureKind) : null;
  } catch {
    return null;
  }
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
const nonEmpty = (v: unknown): string | undefined => {
  const s = str(v)?.trim();
  return s ? s : undefined;
};
/** Gendered pairs arrive newline-separated; keep them as one entry joined by " / ". */
const joinLines = (s: string): string =>
  s
    .split('\n')
    .map((p) => p.trim())
    .filter(Boolean)
    .join(' / ');

function header(request: unknown): { sourceLanguage: string; targetLanguage: string; req: Obj } | null {
  if (!isObj(request)) return null;
  const sourceLanguage = nonEmpty(request.sourceLanguage);
  const targetLanguage = nonEmpty(request.targetLanguage);
  if (!sourceLanguage || !targetLanguage) return null;
  return { sourceLanguage, targetLanguage, req: request };
}

function termItems(list: unknown, termKey: string): ParsedCapture['items'] | null {
  if (list === undefined) return [];
  if (!Array.isArray(list)) return null;
  const out: ParsedCapture['items'] = [];
  for (const e of list) {
    if (!isObj(e)) return null;
    const term = joinLines(str(e[termKey]) ?? '');
    const translation = str(e.translation);
    if (!term || translation === undefined) return null;
    const pron = joinLines(str(e.transliteration) ?? '');
    out.push({ term, translation, example: '', ...(pron ? { pronunciation: pron } : {}) });
  }
  return out;
}

function parseInner(kind: CaptureKind, requestBody: unknown, responseBody: unknown): ParsedCapture | null {
  const h = header(requestBody);
  if (!h || !isObj(responseBody)) return null;
  const { sourceLanguage, targetLanguage, req } = h;
  const base = { sourceLanguage, targetLanguage };

  if (kind === 'terms') {
    const vocab = termItems(responseBody.vocabulary, 'term');
    const phrases = termItems(responseBody.phrases, 'phrase');
    if (!vocab || !phrases) return null;
    const items = [...vocab, ...phrases];
    if (items.length === 0) return null;
    const purpose = nonEmpty(req.purpose);
    return {
      lessonKind: 'tiny_lesson',
      ...base,
      ...(purpose ? { purpose } : {}),
      situation: purpose ?? 'Tiny Lesson',
      items,
    };
  }

  if (kind === 'grammar') {
    const rg = responseBody.relevantGrammar;
    if (!Array.isArray(rg) || rg.length === 0) return null;
    const grammar: NonNullable<Lesson['grammar']> = [];
    for (const g of rg) {
      if (!isObj(g)) return null;
      const topic = nonEmpty(g.topic);
      const description = str(g.description);
      if (!topic || description === undefined || !Array.isArray(g.examples)) return null;
      const examples: NonNullable<Lesson['grammar']>[number]['examples'] = [];
      for (const x of g.examples) {
        if (!isObj(x)) return null;
        const sentence = nonEmpty(x.sentence);
        const translation = str(x.translation);
        if (!sentence || translation === undefined) return null;
        const tr = nonEmpty(x.transliteration);
        const ex = nonEmpty(x.explanation);
        examples.push({
          sentence,
          translation,
          ...(tr ? { transliteration: tr } : {}),
          ...(ex ? { explanation: ex } : {}),
        });
      }
      grammar.push({ topic, description, examples });
    }
    const purpose = nonEmpty(req.purpose);
    return {
      lessonKind: 'grammar',
      ...base,
      ...(purpose ? { purpose } : {}),
      situation: purpose ?? 'Grammar',
      items: [],
      grammar,
    };
  }

  if (kind === 'conversation') {
    const context = str(responseBody.context);
    const dialogue = responseBody.dialogue;
    if (context === undefined || !Array.isArray(dialogue) || dialogue.length === 0) return null;
    const items: ParsedCapture['items'] = [];
    for (const line of dialogue) {
      if (!isObj(line)) return null;
      const message = str(line.message);
      if (message === undefined) return null;
      const notes = line.notes;
      if (notes !== undefined && !isObj(notes)) return null;
      const pron = nonEmpty(line.transliteration);
      for (const [key, expl] of Object.entries(notes ?? {})) {
        if (typeof expl !== 'string' || !key) return null;
        items.push({ term: key, translation: expl, example: message, ...(pron ? { pronunciation: pron } : {}) });
      }
    }
    if (items.length === 0) return null;
    return { lessonKind: 'slang_hang', ...base, situation: context.slice(0, 200) || 'Slang Hang', items };
  }

  // object-descriptors
  const descriptors = responseBody.descriptors;
  if (!Array.isArray(descriptors) || descriptors.length === 0) return null;
  const items: ParsedCapture['items'] = [];
  for (const d of descriptors) {
    if (!isObj(d)) return null;
    const term = nonEmpty(d.descriptor);
    const translation = str(d.translation);
    if (!term || translation === undefined) return null;
    const pron = nonEmpty(d.pronunciation);
    items.push({ term, translation, example: str(d.exampleSentence) ?? '', ...(pron ? { pronunciation: pron } : {}) });
  }
  return { lessonKind: 'word_cam', ...base, situation: nonEmpty(req.object) ?? 'Word Cam', items };
}

/** Pure; returns null (never throws) on any unexpected shape. */
export function parseCapture(kind: CaptureKind, requestBody: unknown, responseBody: unknown): ParsedCapture | null {
  try {
    return parseInner(kind, requestBody, responseBody);
  } catch {
    return null;
  }
}
