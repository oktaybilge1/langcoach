import { describe, expect, it } from 'vitest';
import { LLL_LANGUAGES, resolveLanguage } from '../src/lib/languages';

describe('languages', () => {
  it('has the 23 dropdown languages', () => {
    expect(LLL_LANGUAGES).toHaveLength(23);
    expect(new Set(LLL_LANGUAGES.map((l) => l.label)).size).toBe(23);
  });
  it('resolves known API names', () => {
    expect(resolveLanguage('European Spanish').bcp47).toBe('es-ES');
    expect(resolveLanguage('Mandarin Chinese').bcp47).toBe('zh-CN');
    expect(resolveLanguage('Spanish (Spain)').bcp47).toBe('es-ES');
    expect(resolveLanguage('Brazilian Portuguese').bcp47).toBe('pt-BR');
  });
  it('flags RTL languages', () => {
    expect(resolveLanguage('Arabic').rtl).toBe(true);
    expect(resolveLanguage('Hebrew')).toMatchObject({ bcp47: 'he', rtl: true });
    expect(resolveLanguage('Urdu')).toMatchObject({ bcp47: 'ur', rtl: true });
    expect(resolveLanguage('Japanese').rtl).toBe(false);
  });
  it('falls back by keyword, then und', () => {
    expect(resolveLanguage('Arabic (Egypt)').bcp47).toBe('ar');
    expect(resolveLanguage('Klingon')).toEqual({ label: 'Klingon', bcp47: 'und', rtl: false });
  });
});
