/** Pure, seeded practice-session generator. No chrome.*, no DOM, no Math.random. */
import { isDue, type ReviewCard } from '@langcoach/core/browser';
import { expectedVariants, normalizeAnswer } from './check';
import { mulberry32, randInt, shuffle } from './rng';

export type ExerciseKind = 'meaning' | 'reverse' | 'listen' | 'match' | 'type' | 'blank';

export interface ExercisePrompt {
  /** Target term shown (meaning). */
  term?: string;
  pronunciation?: string;
  /** Meaning shown (reverse, type, blank hint). */
  meaning?: string;
  /** Text to speak with TTS (meaning, listen). */
  speak?: string;
  /** Example with the term replaced by "____" (blank). */
  sentence?: string;
  /** Match: shuffled columns. */
  terms?: string[];
  meanings?: string[];
}

export interface Exercise {
  id: string;
  kind: ExerciseKind;
  cardIds: string[];
  prompt: ExercisePrompt;
  options?: string[];
  /** The correct option / expected typed term; for match the [term, meaning] pairs. */
  answer: string | [string, string][];
}

export interface SessionOptions {
  now: Date;
  seed: number;
  /** Number of exercises (default 10); a match counts as one. */
  size?: number;
  canSpeak: boolean;
  nativeFirst: boolean;
  /** Target-language BCP-47, used to normalize terms (default 'und'). */
  lang?: string;
}

export type SessionResult = Exercise[] | { error: 'not_enough_cards'; needed: 4 };

const BLANK = '____';
const MATCH_SIZE = 5;
const NO_SPACE_SCRIPT =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}]/u;

export function meaningOf(card: ReviewCard, nativeFirst: boolean): string {
  const n = card.nativeTranslation?.trim();
  return nativeFirst && n ? n : (card.translation ?? '').trim();
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function findBlank(term: string, example: string): { sentence: string; answer: string } | null {
  if (!example || !example.trim()) return null;
  for (const v of expectedVariants(term)) {
    const esc = escapeRe(v);
    const src = NO_SPACE_SCRIPT.test(v) ? esc : `(?<![\\p{L}\\p{M}\\p{N}])${esc}(?![\\p{L}\\p{M}\\p{N}])`;
    let re: RegExp;
    try {
      re = new RegExp(src, 'giu');
    } catch {
      continue;
    }
    // Every occurrence is blanked so the answer is never visible in the sentence.
    const sentence = example.replace(re, BLANK);
    if (sentence === example) continue;
    if (!/\p{L}/u.test(sentence.split(BLANK).join(''))) continue;
    return { sentence, answer: v };
  }
  return null;
}

/** The example with every occurrence of the term (or one side of a "m / f" pair) blanked, or null. */
export function blankSentence(term: string, example: string, _lang?: string): string | null {
  return findBlank(term, example)?.sentence ?? null;
}

interface Item {
  card: ReviewCard;
  /** Display form: variants joined by " / ", "(m)/(f)" markers removed. */
  term: string;
  /** What TTS says: the first variant. */
  spoken: string;
  meaning: string;
  tk: string;
  mk: string;
  isNew: boolean;
  blank: { sentence: string; answer: string } | null;
}

export function buildSession(cards: ReviewCard[], opts: SessionOptions): SessionResult {
  const lang = opts.lang ?? 'und';
  const size = Math.max(1, Math.floor(opts.size ?? 10));
  const termKey = (s: string) => normalizeAnswer(s, lang).replace(/\s+/g, '');
  const meaningKey = (s: string) => normalizeAnswer(s, 'und').replace(/\s+/g, '');

  const items: Item[] = [];
  for (const card of cards) {
    const variants = expectedVariants((card.term ?? '').trim());
    const term = variants.join(' / ');
    const meaning = meaningOf(card, opts.nativeFirst);
    const tk = termKey(term);
    const mk = meaningKey(meaning);
    if (!tk || !mk) continue;
    items.push({ card, term, spoken: variants[0] ?? term, meaning, tk, mk, isNew: (card.srs?.reps ?? 0) === 0, blank: findBlank(term, card.example ?? '') });
  }
  if (items.length < 4) return { error: 'not_enough_cards', needed: 4 };

  const rnd = mulberry32(opts.seed);

  // Homonyms (same term, other meaning) and synonyms (same meaning, other term) must never be distractors.
  const meaningsOfTerm = new Map<string, Set<string>>();
  const termsOfMeaning = new Map<string, Set<string>>();
  for (const it of items) {
    if (!meaningsOfTerm.has(it.tk)) meaningsOfTerm.set(it.tk, new Set());
    meaningsOfTerm.get(it.tk)!.add(it.mk);
    if (!termsOfMeaning.has(it.mk)) termsOfMeaning.set(it.mk, new Set());
    termsOfMeaning.get(it.mk)!.add(it.tk);
  }

  // ---- card priority: due → new → weak → random → mastered (only if needed) ----
  const order = shuffle(items, rnd);
  const live = order.filter((it) => !it.card.mastered);
  const mastered = order.filter((it) => it.card.mastered);
  const due = live
    .filter((it) => !it.isNew && isDue(it.card.srs, opts.now))
    .sort((a, b) => Date.parse(a.card.srs.due) - Date.parse(b.card.srs.due));
  const fresh = live.filter((it) => it.isNew);
  const reviewed = live
    .filter((it) => !it.isNew && !isDue(it.card.srs, opts.now))
    .sort((a, b) => (a.card.srs.stability ?? 0) - (b.card.srs.stability ?? 0));
  const weakCount = Math.max(2, Math.ceil(size / 3));
  const priority = [...due, ...fresh, ...reviewed.slice(0, weakCount), ...shuffle(reviewed.slice(weakCount), rnd), ...mastered];

  // ---- match (at most one, 5 cards with pairwise distinct terms and meanings) ----
  let matchItems: Item[] = [];
  if (size >= 2 && items.length >= MATCH_SIZE) {
    const wanted = size - 1 + MATCH_SIZE;
    const pool = priority.slice(0, wanted);
    const scan = [...pool.slice().reverse(), ...priority.slice(wanted)];
    const tks = new Set<string>();
    const mks = new Set<string>();
    for (const it of scan) {
      if (tks.has(it.tk) || mks.has(it.mk)) continue;
      tks.add(it.tk);
      mks.add(it.mk);
      matchItems.push(it);
      if (matchItems.length === MATCH_SIZE) break;
    }
    if (matchItems.length < MATCH_SIZE) matchItems = [];
  }
  const hasMatch = matchItems.length === MATCH_SIZE;
  const singles = size - (hasMatch ? 1 : 0);
  const pool = priority.slice(0, singles + (hasMatch ? MATCH_SIZE : 0));
  const inMatch = new Set(matchItems.map((it) => it.card.id));
  const cycle = [...pool.filter((it) => !inMatch.has(it.card.id)), ...matchItems.filter((it) => pool.includes(it))];
  const seq = cycle.length ? cycle : pool;

  // ---- options ----
  function pickOptions(it: Item, kind: ExerciseKind): { options: string[]; answer: string } | null {
    const meaningSide = kind === 'meaning';
    let answer: string;
    let forbidden: Set<string>;
    if (meaningSide) {
      answer = it.meaning;
      forbidden = new Set(meaningsOfTerm.get(it.tk));
    } else {
      answer = kind === 'blank' && it.blank ? it.blank.answer : it.term;
      forbidden = new Set(termsOfMeaning.get(it.mk));
      forbidden.add(it.tk);
      forbidden.add(termKey(answer));
    }
    forbidden.add(meaningSide ? meaningKey(answer) : termKey(answer));
    const chosen: string[] = [];
    for (const d of shuffle(items, rnd)) {
      if (chosen.length === 3) break;
      if (d.card.id === it.card.id) continue;
      const val = meaningSide ? d.meaning : d.term;
      const k = meaningSide ? d.mk : d.tk;
      if (forbidden.has(k)) continue;
      forbidden.add(k);
      chosen.push(val);
    }
    if (chosen.length < 3) return null;
    return { options: shuffle([answer, ...chosen], rnd), answer };
  }

  function make(it: Item, kind: ExerciseKind): Omit<Exercise, 'id'> | null {
    const cardIds = [it.card.id];
    if (kind === 'type') return { kind, cardIds, prompt: { meaning: it.meaning }, answer: it.term };
    if (kind === 'blank' && !it.blank) return null;
    if (kind === 'listen' && !opts.canSpeak) return null;
    const o = pickOptions(it, kind);
    if (!o) return null;
    const prompt: ExercisePrompt =
      kind === 'meaning'
        ? { term: it.term, ...(opts.canSpeak ? { speak: it.spoken } : {}), ...(it.card.pronunciation ? { pronunciation: it.card.pronunciation } : {}) }
        : kind === 'reverse'
          ? { meaning: it.meaning }
          : kind === 'listen'
            ? { speak: it.spoken }
            : { sentence: it.blank!.sentence, meaning: it.meaning };
    return { kind, cardIds, prompt, options: o.options, answer: o.answer };
  }

  const SINGLE_KINDS: ExerciseKind[] = ['meaning', 'reverse', 'listen', 'type', 'blank'];
  const usedFor = new Map<string, Set<ExerciseKind>>();
  const out: Omit<Exercise, 'id'>[] = [];
  let prev: ExerciseKind | null = null;
  for (let i = 0; i < singles; i++) {
    const it = seq[i % seq.length]!;
    const used = usedFor.get(it.card.id) ?? new Set<ExerciseKind>();
    const firstNew = it.isNew && used.size === 0;
    const tiers: ((k: ExerciseKind) => boolean)[] = [
      (k) => k !== prev && !used.has(k) && !(firstNew && k === 'type'),
      (k) => k !== prev && !(firstNew && k === 'type'),
      (k) => k !== prev,
      () => true,
    ];
    let ex: Omit<Exercise, 'id'> | null = null;
    for (const allow of tiers) {
      for (const k of shuffle(SINGLE_KINDS.filter(allow), rnd)) {
        ex = make(it, k);
        if (ex) break;
      }
      if (ex) break;
    }
    if (!ex) ex = make(it, 'type')!;
    used.add(ex.kind);
    usedFor.set(it.card.id, used);
    prev = ex.kind;
    out.push(ex);
  }

  if (hasMatch) {
    const pairs: [string, string][] = matchItems.map((it) => [it.term, it.meaning]);
    const ex: Omit<Exercise, 'id'> = {
      kind: 'match',
      cardIds: matchItems.map((it) => it.card.id),
      prompt: { terms: shuffle(pairs.map((p) => p[0]), rnd), meanings: shuffle(pairs.map((p) => p[1]), rnd) },
      answer: pairs,
    };
    const pos = out.length === 0 ? 0 : 1 + randInt(rnd, out.length);
    out.splice(pos, 0, ex);
  }

  return out.map((e, i) => ({ id: `px-${opts.seed >>> 0}-${i}-${e.kind}-${e.cardIds[0]}`, ...e }));
}
