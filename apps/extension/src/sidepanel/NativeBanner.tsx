import type { UiLocale } from '../lib/themes';
import type { TranslateFn } from './i18n';
import type { NativeTranslations } from './useNativeTranslations';

/** "tr" → "Turkish" in the UI language (falls back to the code). */
export function languageName(code: string | null, uiLocale: UiLocale): string {
  if (!code) return '';
  try {
    const dn = new Intl.DisplayNames([uiLocale === 'pt_BR' ? 'pt-BR' : uiLocale], { type: 'language' });
    return dn.of(code) ?? code;
  } catch {
    return code;
  }
}

export interface NativeBannerProps {
  native: NativeTranslations;
  t: TranslateFn;
  uiLocale: UiLocale;
}

/** Today's "Translations" banner; nothing when the feature is off or every card already has one. */
export function NativeBanner({ native, t, uiLocale }: NativeBannerProps) {
  if (native.status === 'off' || native.status === 'checking' || native.missing === 0) return null;
  if (native.status === 'available' && !native.translating) return null;
  if (native.status === 'unavailable' && native.dismissed) return null;
  const src = languageName(native.source, uiLocale);
  const dst = languageName(native.target, uiLocale);
  const count = String(native.missing);

  return (
    <section class="card form-grid native-banner" data-testid="native-banner" aria-live="polite">
      <h2>{t('nativeBannerTitle')}</h2>
      {native.status === 'available' && (
        <p class="muted" role="status">
          {t('nativeTranslating', [count, dst])}
        </p>
      )}
      {native.status === 'downloadable' && (
        <>
          <p class="muted">{t('nativeDownloadBody', [count, dst])}</p>
          {native.downloadFailed && (
            <p class="error-text" role="alert" data-testid="native-download-failed">
              {t('nativeDownloadFailed')}
            </p>
          )}
          <div class="theme-actions">
            <button type="button" class="primary" data-testid="native-download" onClick={() => native.download()}>
              {t('nativeDownloadBtn')}
            </button>
          </div>
        </>
      )}
      {native.status === 'downloading' && (
        <div class="form-grid" role="status">
          <p class="muted">
            {native.progress === null
              ? t('nativeDownloadingWait')
              : t('nativeDownloading', String(Math.round(native.progress * 100)))}
          </p>
          {native.progress !== null && (
            <progress max={1} value={native.progress} aria-label={t('nativeBannerTitle')} />
          )}
        </div>
      )}
      {native.status === 'unavailable' && (
        <div class="today-summary">
          <p class="muted" data-testid="native-unavailable">
            {t('nativeUnavailable', [src, dst])}
          </p>
          <button type="button" class="btn-subtle" data-testid="native-dismiss" onClick={() => native.dismiss()}>
            {t('nativeDismiss')}
          </button>
        </div>
      )}
    </section>
  );
}
