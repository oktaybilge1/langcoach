import { describe, expect, it } from 'vitest';
import { deeplink, toSiteLang } from '../src/lib/deeplink';

describe('deeplink', () => {
  it('builds exact LLL experiment URLs for every siteLang and experiment type', () => {
    expect(deeplink('en', 'tiny_lesson')).toBe('https://labs.google/lll/en/experiments/tiny-lesson');
    expect(deeplink('es', 'slang_hang')).toBe('https://labs.google/lll/es/experiments/slang-hang');
    expect(deeplink('fr', 'word_cam')).toBe('https://labs.google/lll/fr/experiments/word-cam');
    expect(deeplink('pt', 'tiny_lesson')).toBe('https://labs.google/lll/pt/experiments/tiny-lesson');
  });

  it('derives siteLang from UI language (tr and unknown fall back to en)', () => {
    expect(toSiteLang('en')).toBe('en');
    expect(toSiteLang('tr')).toBe('en');
    expect(toSiteLang('es')).toBe('es');
    expect(toSiteLang('fr')).toBe('fr');
    expect(toSiteLang('pt_BR')).toBe('pt');
    expect(toSiteLang('pt-PT')).toBe('pt');
    expect(toSiteLang('de')).toBe('en');
  });
});
