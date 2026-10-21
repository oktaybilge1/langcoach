import { useCallback, useEffect, useState } from 'preact/hooks';
import {
  DEFAULT_SETTINGS,
  send as defaultSend,
  type MessageMap,
  type MessageType,
  type ResponseOf,
  type Settings as SettingsType,
  type Snapshot,
} from '../shared/messages';
import { createTranslator } from './i18n';
import { Onboarding } from './views/Onboarding';
import { Plan } from './views/Plan';
import { Progress } from './views/Progress';
import { Review } from './views/Review';
import { Settings } from './views/Settings';
import { Today } from './views/Today';

export type PanelSend = <K extends MessageType>(msg: { type: K } & MessageMap[K]['request']) => Promise<ResponseOf<K>>;
export type TabId = 'today' | 'review' | 'plan' | 'progress' | 'settings';

export interface AppProps {
  send?: PanelSend;
  initialTab?: TabId;
}

export function App({ send = defaultSend, initialTab = 'today' }: AppProps) {
  const [tab, setTab] = useState<TabId>(initialTab);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [settings, setSettings] = useState<SettingsType>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const [st, snap] = await Promise.all([send({ type: 'getSettings' }), send({ type: 'getSnapshot' })]);
    setSettings(st);
    setSnapshot(snap);
    setLoading(false);
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
            data-testid="tab-review"
            aria-current={tab === 'review' ? 'page' : undefined}
            onClick={() => setTab('review')}
          >
            {t('tabReview')} {snapshot.dueCount > 0 ? `(${snapshot.dueCount})` : ''}
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
          />
        ) : tab === 'review' ? (
          <Review snapshot={snapshot} uiLocale={locale} t={t} send={send} onRefresh={refresh} />
        ) : tab === 'plan' ? (
          <Plan snapshot={snapshot} t={t} />
        ) : tab === 'progress' ? (
          <Progress snapshot={snapshot} t={t} />
        ) : (
          <Settings snapshot={snapshot} settings={settings} t={t} send={send} onRefresh={refresh} />
        )}
      </main>
    </div>
  );
}
