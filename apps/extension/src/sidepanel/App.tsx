import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import {
  DEFAULT_SETTINGS,
  send as defaultSend,
  type MessageMap,
  type MessageType,
  type ResponseOf,
  type Settings as SettingsType,
  type Snapshot,
} from '../shared/messages';
import type { TranslatorCache } from '../lib/translate';
import { createTranslator } from './i18n';
import { panelTranslator, useNativeTranslations } from './useNativeTranslations';
import { Onboarding } from './views/Onboarding';
import { Plan } from './views/Plan';
import { Practice } from './views/Practice';
import { Progress } from './views/Progress';
import { DataActions, Settings } from './views/Settings';
import { Today } from './views/Today';
import { Words } from './views/Words';

export type PanelSend = <K extends MessageType>(msg: { type: K } & MessageMap[K]['request']) => Promise<ResponseOf<K>>;
export type TabId = 'today' | 'practice' | 'review' | 'plan' | 'progress' | 'settings';

export interface AppProps {
  send?: PanelSend;
  /** Fixed first tab; when absent the panel opens on Practice if cards are due, else Today. */
  initialTab?: TabId;
  /** On-device translator (tests inject a fake; defaults to the global Translator API). */
  translator?: TranslatorCache;
}

type LoadError = { kind: 'corrupt'; message: string; preservedAt?: string } | { kind: 'generic'; message: string };

/** Classifies an error thrown by send() (ErrorInfo fields are copied onto the Error). */
export function toLoadError(e: unknown): LoadError {
  const err = (e ?? {}) as { name?: string; message?: string; preservedAt?: string };
  const message = typeof err.message === 'string' && err.message ? err.message : String(e);
  // Schema-invalid stored data (InvalidDataError from getSnapshot) needs the same Import / Reset recovery.
  if (err.name === 'CorruptDataError' || err.name === 'InvalidDataError' || typeof err.preservedAt === 'string') {
    return { kind: 'corrupt', message, ...(err.preservedAt ? { preservedAt: err.preservedAt } : {}) };
  }
  return { kind: 'generic', message };
}

export function App({ send = defaultSend, initialTab, translator = panelTranslator }: AppProps) {
  const [tab, setTab] = useState<TabId>(initialTab ?? 'today');
  /** The due-cards default applies once, on the first snapshot of this panel. */
  const tabChosen = useRef(initialTab !== undefined);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [settings, setSettings] = useState<SettingsType>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<LoadError | null>(null);

  const refresh = useCallback(async () => {
    try {
      // Settings live under their own key, so they still load when the learning state is damaged.
      const st = await send({ type: 'getSettings' }).catch(() => null);
      if (st) setSettings(st);
      const snap = await send({ type: 'getSnapshot' });
      if (!tabChosen.current) {
        tabChosen.current = true;
        if (snap.profile && snap.dueCount > 0) setTab('practice');
      }
      setSnapshot(snap);
      setLoadError(null);
    } catch (e) {
      setLoadError(toLoadError(e));
    } finally {
      setLoading(false);
    }
  }, [send]);

  useEffect(() => {
    void refresh();
    if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
      const listener = () => void refresh();
      chrome.storage.onChanged.addListener(listener);
      return () => chrome.storage.onChanged.removeListener(listener);
    }
  }, [refresh]);

  const { locale, t } = createTranslator(settings.uiLanguage);
  const native = useNativeTranslations(snapshot, send, translator);

  useEffect(() => {
    if (typeof document !== 'undefined') document.documentElement.lang = locale === 'pt_BR' ? 'pt-BR' : locale;
  }, [locale]);

  if (loadError?.kind === 'corrupt') {
    return (
      <div class="panel-shell">
        <main class="panel-main">
          <section class="card form-grid" data-testid="recovery-screen">
            <h1>{t('corruptTitle')}</h1>
            <p>{t('corruptBody')}</p>
            {loadError.preservedAt && (
              <p class="muted">
                {t('corruptPreserved', '')}
                <span class="mono" data-testid="preserved-key">
                  {loadError.preservedAt}
                </span>
              </p>
            )}
            <DataActions t={t} send={send} currentCards={null} onChanged={refresh} showExport={false} />
          </section>
        </main>
      </div>
    );
  }

  const errorBanner = loadError && (
    <section class="card form-grid" role="alert" data-testid="load-error">
      <p class="error-text">{t('loadErrorBody', loadError.message)}</p>
      <button type="button" data-testid="btn-retry" onClick={() => void refresh()}>
        {t('btnRetry')}
      </button>
    </section>
  );

  if (!snapshot && errorBanner) {
    return (
      <div class="panel-shell">
        <main class="panel-main">{errorBanner}</main>
      </div>
    );
  }

  if (loading || !snapshot) {
    return (
      <div class="panel-shell">
        <main class="panel-main">
          <section class="card">
            <p class="muted">{t('loading')}</p>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div class="panel-shell">
      <header class="panel-header">
        <span class="brand">{t('extName')}</span>
        <div class="header-pills">
          <span class="pill" title={t('statStreak')}>
            🔥 {snapshot.progress.streak}
          </span>
          <span class="pill" title={t('statTotalXp')}>
            ⭐ {snapshot.progress.totalXp}
          </span>
        </div>
      </header>

      {snapshot.profile && (
        <nav class="tab-bar" aria-label={t('extName')}>
          <button
            type="button"
            class="tab-btn"
            data-testid="tab-today"
            aria-current={tab === 'today' ? 'page' : undefined}
            onClick={() => setTab('today')}
          >
            {t('tabToday')}
          </button>
          <button
            type="button"
            class="tab-btn"
            data-testid="tab-practice"
            aria-current={tab === 'practice' ? 'page' : undefined}
            onClick={() => setTab('practice')}
          >
            {t('tabPractice')}
          </button>
          <button
            type="button"
            class="tab-btn"
            data-testid="tab-review"
            aria-current={tab === 'review' ? 'page' : undefined}
            onClick={() => setTab('review')}
          >
            {t('tabWords')} {snapshot.dueCount > 0 ? `(${snapshot.dueCount})` : ''}
          </button>
          <button
            type="button"
            class="tab-btn"
            data-testid="tab-plan"
            aria-current={tab === 'plan' ? 'page' : undefined}
            onClick={() => setTab('plan')}
          >
            {t('tabPlan')}
          </button>
          <button
            type="button"
            class="tab-btn"
            data-testid="tab-progress"
            aria-current={tab === 'progress' ? 'page' : undefined}
            onClick={() => setTab('progress')}
          >
            {t('tabProgress')}
          </button>
          <button
            type="button"
            class="tab-btn"
            data-testid="tab-settings"
            aria-current={tab === 'settings' ? 'page' : undefined}
            onClick={() => setTab('settings')}
          >
            {t('tabSettings')}
          </button>
        </nav>
      )}

      <main class="panel-main">
        {errorBanner}
        {!snapshot.profile ? (
          <Onboarding settings={settings} uiLocale={locale} t={t} send={send} onComplete={refresh} />
        ) : tab === 'today' ? (
          <Today
            snapshot={snapshot}
            uiLocale={locale}
            t={t}
            send={send}
            onRefresh={refresh}
            onOpenReview={() => setTab('review')}
            onOpenPractice={() => setTab('practice')}
            native={native}
          />
        ) : tab === 'practice' ? null : tab === 'review' ? (
          <Words snapshot={snapshot} uiLocale={locale} t={t} send={send} onRefresh={refresh} native={native} />
        ) : tab === 'plan' ? (
          <Plan snapshot={snapshot} t={t} />
        ) : tab === 'progress' ? (
          <Progress snapshot={snapshot} t={t} uiLocale={locale} />
        ) : (
          <Settings snapshot={snapshot} settings={settings} t={t} send={send} onRefresh={refresh} />
        )}
        {snapshot.profile && (
          // Stays mounted while other tabs are open so a session survives a peek at another tab;
          // closing the panel unmounts it and nothing is recorded.
          <div class="practice-host" hidden={tab !== 'practice'}>
            <Practice
              snapshot={snapshot}
              uiLocale={locale}
              t={t}
              send={send}
              onRefresh={refresh}
              onDone={() => setTab('today')}
              soundEffects={settings.soundEffects !== false}
              active={tab === 'practice'}
              native={native}
            />
          </div>
        )}
      </main>
    </div>
  );
}
