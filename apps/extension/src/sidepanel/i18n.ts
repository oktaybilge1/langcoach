import en from '../../public/_locales/en/messages.json';
import es from '../../public/_locales/es/messages.json';
import fr from '../../public/_locales/fr/messages.json';
import pt_BR from '../../public/_locales/pt_BR/messages.json';
import tr from '../../public/_locales/tr/messages.json';
import type { UiLocale } from '../lib/themes';

type CatalogEntry = {
  message: string;
  placeholders?: Record<string, { content: string }>;
};

const CATALOGS: Record<UiLocale, Record<string, CatalogEntry>> = {
  en,
  tr,
  es,
  fr,
  pt_BR,
};

export function resolveUiLocale(setting: string | undefined): UiLocale {
  const raw =
    !setting || setting === 'auto'
      ? (typeof chrome !== 'undefined' && chrome.i18n?.getUILanguage?.()) ||
        (typeof navigator !== 'undefined' ? navigator.language : 'en')
      : setting;
  const norm = String(raw ?? 'en')
    .trim()
    .toLowerCase();
  if (norm.startsWith('tr')) return 'tr';
  if (norm.startsWith('es')) return 'es';
  if (norm.startsWith('fr')) return 'fr';
  if (norm.startsWith('pt')) return 'pt_BR';
  return 'en';
}

export type TranslateFn = (key: string, substitutions?: string | string[]) => string;

export function createTranslator(uiLanguage: string | undefined): { locale: UiLocale; t: TranslateFn } {
  const locale = resolveUiLocale(uiLanguage);
  const cat = CATALOGS[locale] ?? CATALOGS.en;

  const t: TranslateFn = (key: string, substitutions?: string | string[]) => {
    const entry = cat[key] ?? CATALOGS.en[key];
    if (!entry) return key;
    const subs =
      substitutions === undefined ? [] : Array.isArray(substitutions) ? substitutions : [String(substitutions)];
    let msg = entry.message;
    if (entry.placeholders) {
      for (const [name, spec] of Object.entries(entry.placeholders)) {
        const idx = Number(spec.content.replace('$', '')) - 1;
        const val = subs[idx] ?? '';
        msg = msg.replace(new RegExp(`\\$${name}\\$`, 'gi'), val);
      }
    }
    subs.forEach((val, idx) => {
      msg = msg.replace(new RegExp(`\\$${idx + 1}`, 'g'), val);
    });
    return msg;
  };

  return { locale, t };
}
