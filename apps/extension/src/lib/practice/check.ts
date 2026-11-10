/** Tolerant typed-answer checking (pure). */
export type CheckResult = 'correct' | 'almost' | 'wrong';

const base = (lang: string) => (lang || '').toLowerCase().split(/[-_]/)[0] ?? '';

function lower(s: string, lang: string): string {
  try {
    return s.toLocaleLowerCase(lang || undefined);
  } catch {
    return s.toLowerCase();
  }
}

/** Scripts whose combining marks are optional diacritics (safe to strip). */
const STRIPPABLE_BASE = /[\p{Script=Latin}\p{Script=Greek}\p{Script=Cyrillic}\p{Script=Arabic}\p{Script=Hebrew}]/u;

function stripDiacritics(s: string): string {
  const d = s.normalize('NFKD');
  let out = '';
  let prevBase = '';
  for (const ch of d) {
    if (/\p{M}/u.test(ch)) {
      if (STRIPPABLE_BASE.test(prevBase)) continue;
      out += ch;
    } else {
      out += ch;
      prevBase = ch;
    }
  }
  return out.normalize('NFC');
}

function katakanaToHiragana(s: string): string {
  return s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
}

function arabicFold(s: string): string {
  return s
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه');
}

/**
 * Normalize for comparison: case-fold (locale-aware), Unicode-normalize per language,
 * strip optional diacritics, turn punctuation/symbols into spaces and collapse spaces.
 */
export function normalizeAnswer(s: string, lang: string): string {
  const b = base(lang);
  let t = lower(s ?? '', lang);
  if (b === 'ja') {
    t = katakanaToHiragana(t.normalize('NFKC'));
  } else if (b === 'ko') {
    t = t.normalize('NFC');
  } else if (b === 'zh') {
    t = t.normalize('NFKC');
  } else {
    if (b === 'ar' || b === 'ur' || b === 'fa') t = arabicFold(t.normalize('NFC'));
    t = stripDiacritics(t);
    if (b === 'ar' || b === 'ur' || b === 'fa') t = arabicFold(t);
    t = t.replace(/ß/g, 'ss');
  }
  // Punctuation and symbols (incl. ¿¡«»“”‘’) become spaces; the Japanese long-vowel mark is a letter (Lm).
  t = t.replace(/[\p{P}\p{S}]/gu, ' ');
  return t.replace(/\s+/g, ' ').trim();
}

/** Accepted forms of a stored term: each side of " / " with "(m)"/"(f)"-style parentheticals removed. */
export function expectedVariants(term: string): string[] {
  const sides = (term ?? '').split(/\s+\/\s+/);
  const out: string[] = [];
  for (const side of sides) {
    const stripped = side.replace(/\s*\([^()]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
    const v = stripped || side.trim();
    if (v && !out.includes(v)) out.push(v);
  }
  return out;
}

/** Optimal-string-alignment Damerau–Levenshtein distance over code points. */
export function damerauLevenshtein(a: string, b: string): number {
  const x = Array.from(a);
  const y = Array.from(b);
  const m = x.length;
  const n = y.length;
  const d: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 0; i <= m; i++) d[i]![0] = i;
  for (let j = 0; j <= n; j++) d[0]![j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = x[i - 1] === y[j - 1] ? 0 : 1;
      let v = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && x[i - 1] === y[j - 2] && x[i - 2] === y[j - 1]) v = Math.min(v, d[i - 2]![j - 2]! + 1);
      d[i]![j] = v;
    }
  }
  return d[m]![n]!;
}

export function checkTyped(input: string, expected: string, lang: string): CheckResult {
  const got = normalizeAnswer(input, lang);
  if (!got) return 'wrong';
  let best: CheckResult = 'wrong';
  for (const v of expectedVariants(expected)) {
    const want = normalizeAnswer(v, lang);
    if (!want) continue;
    if (got === want) return 'correct';
    if (/\p{L}/u.test(want) && Array.from(want).length >= 6 && damerauLevenshtein(got, want) === 1) best = 'almost';
  }
  return best;
}

/** FSRS mapping: correct first try → Good (3); almost/hint → Hard (2); wrong → Again (1). */
export function ratingForResult(r: CheckResult): 1 | 2 | 3 {
  return r === 'correct' ? 3 : r === 'almost' ? 2 : 1;
}
