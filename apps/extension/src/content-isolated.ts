// Isolated-world content script (document_start): relays captures to the background, shows the toast.
import { startIsolated } from './content/isolated';

startIsolated({
  win: window,
  runtimeId: chrome.runtime.id,
  sendMessage: (msg) => chrome.runtime.sendMessage(msg),
  onMessage: chrome.runtime.onMessage,
  t: (key, subs) => chrome.i18n.getMessage(key, subs),
});
