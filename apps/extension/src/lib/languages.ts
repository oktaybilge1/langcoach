export interface LllLanguage {
  label: string;
  apiNames: string[];
  bcp47: string;
  rtl: boolean;
}

export interface ResolvedLanguage {
  label: string;
  bcp47: string;
  rtl: boolean;
}

/** The 23 target languages in the Little Language Lessons dropdown. */
export const LLL_LANGUAGES: LllLanguage[] = [
  { label: 'Arabic', apiNames: ['Arabic', 'Modern Standard Arabic'], bcp47: 'ar', rtl: true },
  { label: 'Chinese (China)', apiNames: ['Mandarin Chinese', 'Chinese (China)', 'Simplified Chinese'], bcp47: 'zh-CN', rtl: false },
  { label: 'Chinese (Hong Kong)', apiNames: ['Cantonese', 'Hong Kong Cantonese', 'Chinese (Hong Kong)'], bcp47: 'zh-HK', rtl: false },
  { label: 'Chinese (Taiwan)', apiNames: ['Taiwanese Mandarin', 'Traditional Chinese', 'Chinese (Taiwan)'], bcp47: 'zh-TW', rtl: false },
  { label: 'English (AU)', apiNames: ['Australian English', 'English (AU)'], bcp47: 'en-AU', rtl: false },
  { label: 'English (UK)', apiNames: ['British English', 'English (UK)'], bcp47: 'en-GB', rtl: false },
  { label: 'English (US)', apiNames: ['American English', 'English (US)'], bcp47: 'en-US', rtl: false },
  { label: 'French (Canada)', apiNames: ['Canadian French', 'French (Canada)'], bcp47: 'fr-CA', rtl: false },
  { label: 'French (France)', apiNames: ['French', 'European French', 'French (France)'], bcp47: 'fr-FR', rtl: false },
  { label: 'German', apiNames: ['German'], bcp47: 'de', rtl: false },
  { label: 'Greek', apiNames: ['Greek'], bcp47: 'el', rtl: false },
  { label: 'Hebrew', apiNames: ['Hebrew'], bcp47: 'he', rtl: true },
  { label: 'Hindi', apiNames: ['Hindi'], bcp47: 'hi', rtl: false },
  { label: 'Italian', apiNames: ['Italian'], bcp47: 'it', rtl: false },
  { label: 'Japanese', apiNames: ['Japanese'], bcp47: 'ja', rtl: false },
  { label: 'Korean', apiNames: ['Korean'], bcp47: 'ko', rtl: false },
  { label: 'Portuguese (Brazil)', apiNames: ['Brazilian Portuguese', 'Portuguese (Brazil)'], bcp47: 'pt-BR', rtl: false },
  { label: 'Portuguese (Portugal)', apiNames: ['European Portuguese', 'Portuguese (Portugal)'], bcp47: 'pt-PT', rtl: false },
  { label: 'Russian', apiNames: ['Russian'], bcp47: 'ru', rtl: false },
  { label: 'Spanish (LatAm)', apiNames: ['Latin American Spanish', 'Spanish (LatAm)'], bcp47: 'es-419', rtl: false },
  { label: 'Spanish (Spain)', apiNames: ['European Spanish', 'Spanish (Spain)'], bcp47: 'es-ES', rtl: false },
  { label: 'Turkish', apiNames: ['Turkish'], bcp47: 'tr', rtl: false },
  { label: 'Urdu', apiNames: ['Urdu'], bcp47: 'ur', rtl: true },
];

const QUALIFIERS: Record<string, string> = {
  cantonese: 'Chinese (Hong Kong)',
  taiwanese: 'Chinese (Taiwan)',
  brazilian: 'Portuguese (Brazil)',
  latin: 'Spanish (LatAm)',
  latam: 'Spanish (LatAm)',
  australian: 'English (AU)',
  british: 'English (UK)',
  american: 'English (US)',
};

const FAMILIES: Record<string, { label: string; bcp47: string }> = {
  english: { label: 'English', bcp47: 'en-US' },
  spanish: { label: 'Spanish', bcp47: 'es-ES' },
  portuguese: { label: 'Portuguese', bcp47: 'pt-BR' },
  french: { label: 'French', bcp47: 'fr-FR' },
  chinese: { label: 'Chinese', bcp47: 'zh-CN' },
  mandarin: { label: 'Chinese', bcp47: 'zh-CN' },
};

const norm = (s: string): string => s.trim().toLowerCase();
const toResolved = (l: LllLanguage): ResolvedLanguage => ({ label: l.label, bcp47: l.bcp47, rtl: l.rtl });
const words = (s: string): string[] => norm(s).split(/[^\p{L}]+/u).filter(Boolean);

export function resolveLanguage(apiName: string): ResolvedLanguage {
  const raw = String(apiName ?? '');
  const n = norm(raw);
  const exact = LLL_LANGUAGES.find((l) => norm(l.label) === n || l.apiNames.some((a) => norm(a) === n));
  if (exact) return toResolved(exact);
  const tokens = words(n);
  const byLabel = (l: string): ResolvedLanguage => toResolved(LLL_LANGUAGES.find((x) => x.label === l)!);
  // Regional qualifiers first, then bare family defaults, then single-language labels.
  for (const t of tokens) {
    const q = QUALIFIERS[t];
    if (q) return byLabel(q);
  }
  if (tokens.includes('canadian') && tokens.includes('french')) return byLabel('French (Canada)');
  for (const t of tokens) {
    const f = FAMILIES[t];
    if (f) return { label: f.label, bcp47: f.bcp47, rtl: false };
  }
  for (const t of tokens) {
    const hit = LLL_LANGUAGES.find((l) => words(l.label)[0] === t);
    if (hit) return toResolved(hit);
  }
  return { label: raw, bcp47: 'und', rtl: false };
}
