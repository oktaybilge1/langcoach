import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { resolveLocale, strings, type UiLang } from '../src/dashboard/i18n.js';

describe('resolveLocale', () => {
  it.each([
    ['Turkish', 'tr', 'tr'],
    ['türkçe', 'tr', 'tr'],
    ['TR', 'tr', 'tr'],
    ['tr-TR', 'tr', 'tr-TR'],
    ['Portuguese (Brazil)', 'pt-BR', 'pt'],
    ['pt', 'pt-BR', 'pt'],
    ['Japanese', 'en', 'ja'],
    ['Klingon', 'en', 'en'],
    ['', 'en', 'en'],
    [undefined, 'en', 'en'],
  ])('%s', (input, ui, locale) => {
    expect(resolveLocale(input)).toEqual({ ui, locale });
  });
});

describe('strings', () => {
  const langs: [UiLang, string][] = [['en', 'en'], ['tr', 'tr'], ['es', 'es'], ['fr', 'fr'], ['pt-BR', 'pt_BR']];
  it.each(langs)('%s has the same keys as en and extension level names', (ui, dir) => {
    const s = strings(ui) as Record<string, string>;
    expect(Object.keys(s).sort()).toEqual(Object.keys(strings('en')).sort());
    const m = JSON.parse(readFileSync(new URL(`../../../apps/extension/public/_locales/${dir}/messages.json`, import.meta.url), 'utf8'));
    for (let i = 1; i <= 10; i++) expect(s[`level${i}`]).toBe(m[`level${i}`].message);
  });
});
