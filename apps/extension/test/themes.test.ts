import type { Cefr } from '@langcoach/core/browser';
import { describe, expect, it } from 'vitest';
import { GOALS, suggestThemes } from '../src/lib/themes';

const LEVELS: readonly (Cefr | 'unsure')[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'unsure'];
const UI_LANGS = ['en', 'tr', 'es', 'fr', 'pt_BR'] as const;

describe('suggestThemes', () => {
  it('returns 3 distinct non-empty strings for every goal × level × uiLang', () => {
    for (const goal of GOALS) {
      for (const level of LEVELS) {
        for (const lang of UI_LANGS) {
          const out = suggestThemes(goal, level, lang, 0);
          expect(out, `${goal}/${level}/${lang}`).toHaveLength(3);
          for (const item of out) {
            expect(item.trim().length, `${goal}/${level}/${lang} non-empty`).toBeGreaterThan(2);
          }
          expect(new Set(out).size, `${goal}/${level}/${lang} distinct`).toBe(3);
        }
      }
    }
  });

  it('has at least 12 distinct themes per goal in each UI language across levels/seeds', () => {
    for (const goal of GOALS) {
      for (const lang of UI_LANGS) {
        const seen = new Set<string>();
        for (const level of LEVELS) {
          for (let seed = 0; seed < 12; seed++) {
            for (const t of suggestThemes(goal, level, lang, seed)) seen.add(t);
          }
        }
        expect(seen.size, `${goal}/${lang} total pool >= 12`).toBeGreaterThanOrEqual(12);
      }
    }
  });

  it('localizes themes per UI language and maps unsure to A2', () => {
    const en = suggestThemes('travel', 'A1', 'en', 1);
    const tr = suggestThemes('travel', 'A1', 'tr', 1);
    const es = suggestThemes('travel', 'A1', 'es', 1);
    expect(tr).not.toEqual(en);
    expect(es).not.toEqual(en);
    expect(suggestThemes('work', 'unsure', 'en', 2)).toEqual(suggestThemes('work', 'A2', 'en', 2));
  });
});
