export type SiteLang = 'en' | 'es' | 'fr' | 'pt';
export type ExperimentType = 'tiny_lesson' | 'slang_hang' | 'word_cam';

const SLUGS: Record<ExperimentType, string> = {
  tiny_lesson: 'tiny-lesson',
  slang_hang: 'slang-hang',
  word_cam: 'word-cam',
};

/** Derives the Little Language Lessons UI language path segment from a UI locale code (`tr` -> `en`). */
export function toSiteLang(uiLang: string): SiteLang {
  const prefix = String(uiLang ?? '')
    .trim()
    .toLowerCase()
    .split(/[-_]/)[0];
  if (prefix === 'es') return 'es';
  if (prefix === 'fr') return 'fr';
  if (prefix === 'pt') return 'pt';
  return 'en';
}

export function deeplink(siteLang: SiteLang, type: ExperimentType): string {
  const lang: SiteLang = siteLang === 'es' || siteLang === 'fr' || siteLang === 'pt' ? siteLang : 'en';
  const slug = SLUGS[type] ?? SLUGS.tiny_lesson;
  return `https://labs.google/lll/${lang}/experiments/${slug}`;
}
