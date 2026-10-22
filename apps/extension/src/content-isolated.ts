// Isolated-world content script (document_start): relays captures to the background, shows the toast.
import { e2eTranslatorApi } from './content/e2e-translator';
import { startIsolated } from './content/isolated';
import { createTranslatorCache } from './lib/translate';

/** Same key as background/router.ts SETTINGS_KEY (not imported: keeps the background out of this bundle). */
const SETTINGS_KEY = 'langcoach:settings';

startIsolated({
  win: window,
  runtimeId: chrome.runtime.id,
  sendMessage: (msg) => chrome.runtime.sendMessage(msg),
  onMessage: chrome.runtime.onMessage,
  t: (key, subs) => chrome.i18n.getMessage(key, subs),
  // E2E builds only: lets Playwright stub the Translator API (init scripts cannot reach this isolated world).
  ...(__E2E__ ? { translator: createTranslatorCache(e2eTranslatorApi(window)) } : {}),
  onShowNativeChanged: (cb) => {
    try {
      chrome.storage.onChanged.addListener((changes, area) => {
        const next = changes[SETTINGS_KEY]?.newValue as { showNativeOnPage?: unknown } | undefined;
        if (area === 'local' && next && typeof next === 'object') cb(next.showNativeOnPage !== false);
      });
    } catch {
      /* storage events unavailable: the next capture carries the setting */
    }
  },
});
