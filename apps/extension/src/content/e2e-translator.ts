import type { TranslatorApi } from '../lib/translate';

/** Attribute a Playwright init script sets on <html>; its value is the prefix the fake adds ("[tr] "). */
export const E2E_TRANSLATE_ATTR = 'data-langcoach-e2e-translate';

/**
 * E2E builds only (referenced behind `__E2E__`, so production bundles drop it): page init scripts run in
 * the MAIN world and cannot stub `Translator` in this isolated world, so the test marks <html> instead.
 * Without the marker the real API (if any) is used.
 */
export function e2eTranslatorApi(win: Window): TranslatorApi | undefined {
  const real = (win as unknown as { Translator?: TranslatorApi }).Translator;
  const prefix = () => win.document.documentElement?.getAttribute(E2E_TRANSLATE_ATTR);
  return {
    availability: async (o) => (prefix() != null ? 'available' : real ? real.availability(o) : 'unavailable'),
    create: async (o) => {
      const p = prefix();
      if (p != null) return { translate: async (text: string) => `${p}${text}`, destroy: () => {} };
      if (!real) throw new Error('Translator unavailable');
      return real.create(o);
    },
  };
}
