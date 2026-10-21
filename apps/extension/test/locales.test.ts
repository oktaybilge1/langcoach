import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

type Msg = { message: string; description?: string; placeholders?: Record<string, { content: string; example?: string }> };
const load = (l: string): Record<string, Msg> =>
  JSON.parse(readFileSync(new URL(`../public/_locales/${l}/messages.json`, import.meta.url), 'utf8'));
const LOCALES = ['en', 'tr', 'es', 'fr', 'pt_BR'];
const KEYS: Record<string, string[]> = {
  toastSaved: ['count'],
  toastAlready: [],
  toastUndo: [],
  toastOpen: [],
  toastRemoved: [],
  toastSaveN: ['count'],
  toastSavedManual: [],
  toastXp: ['xp'],
  menuSave: [],
};

describe('toast/menu locale strings', () => {
  it('en has the specified wording', () => {
    const en = load('en');
    expect(en.toastSaved?.message).toBe('✓ $COUNT$ words saved to LangCoach');
    expect(en.toastAlready?.message).toBe('Already in your deck');
    expect(en.toastSaveN?.message).toBe('Save $COUNT$ words');
    expect(en.toastSavedManual?.message).toBe('✓ Saved to LangCoach');
    expect(en.menuSave?.message).toBe('Save to LangCoach');
    expect(en.toastXp?.message).toBe('+$XP$ XP');
  });

  it.each(LOCALES)('%s defines every key with matching placeholders', (l) => {
    const m = load(l);
    for (const [key, ph] of Object.entries(KEYS)) {
      const e = m[key];
      expect(e?.message, `${l}.${key}`).toMatch(/\S/);
      const used = [...e!.message.matchAll(/\$([A-Z_]+)\$/g)].map((x) => x[1]!.toLowerCase()).sort();
      expect(used, `${l}.${key} placeholders used`).toEqual([...ph].sort());
      expect(Object.keys(e!.placeholders ?? {}).sort(), `${l}.${key} placeholders defined`).toEqual([...ph].sort());
      for (const p of ph) expect(e!.placeholders![p]!.content).toBe('$1');
    }
  });

  it('non-English locales are actually translated', () => {
    const en = load('en');
    for (const l of LOCALES.filter((x) => x !== 'en')) {
      const m = load(l);
      for (const key of ['toastSaved', 'toastAlready', 'toastUndo', 'toastRemoved', 'toastSaveN', 'menuSave']) {
        expect(m[key]?.message, `${l}.${key}`).not.toBe(en[key]?.message);
      }
    }
  });
});
