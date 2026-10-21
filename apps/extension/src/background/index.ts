import { Coach } from '@langcoach/core/browser';
import { z } from 'zod';
import { isMessage } from '../shared/messages';
import { isAllowed } from './policy';
import { createRouter } from './router';
import { ChromeStorageStore } from './store';

// MV3 CSP forbids eval/new Function: stop zod from probing for it.
z.config({ jitless: true });

// The background service worker is the single writer to storage.
const store = new ChromeStorageStore();
const coach = new Coach(store);
const router = createRouter({ coach, store, area: chrome.storage.local });

chrome.runtime.onMessage.addListener((msg: unknown, sender, sendResponse) => {
  if (!isMessage(msg)) return false;
  if (!isAllowed(msg.type, sender, chrome.runtime.id, chrome.runtime.getURL(''), __E2E__)) {
    sendResponse({ ok: false, error: { name: 'Forbidden', message: 'Sender not allowed', code: 'forbidden' } });
    return false;
  }
  void router.handle(msg).then(sendResponse);
  return true; // respond asynchronously
});

chrome.runtime.onInstalled.addListener(() => {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});
