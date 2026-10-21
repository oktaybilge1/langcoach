import { Coach } from '@langcoach/core/browser';
import { isMessage } from '../shared/messages';
import { createRouter } from './router';
import { ChromeStorageStore } from './store';

// The background service worker is the single writer to storage.
const store = new ChromeStorageStore();
const coach = new Coach(store);
const router = createRouter({ coach, store, area: chrome.storage.local });

chrome.runtime.onMessage.addListener((msg: unknown, _sender, sendResponse) => {
  if (!isMessage(msg)) return false;
  void router.handle(msg).then(sendResponse);
  return true; // respond asynchronously
});

chrome.runtime.onInstalled.addListener(() => {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});
