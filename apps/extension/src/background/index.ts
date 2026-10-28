import './zod-config'; // must stay first: disables zod's eval probe before core builds its schemas
import { Coach } from '@langcoach/core/browser';
import { isMessage } from '../shared/messages';
import { createMenuClickHandler, registerMenus } from './menu';
import { isAllowed } from './policy';
import {
  createReminderAlarmHandler,
  createReminderClickHandler,
  createRolloverAlarmHandler,
  scheduleReminder,
  scheduleRollover,
} from './reminder';
import { createRouter } from './router';
import { ChromeStorageStore } from './store';

// The background service worker is the single writer to storage.
const store = new ChromeStorageStore();
const coach = new Coach(store);
const log = (...a: unknown[]) => console.warn(...a);
const router = createRouter({
  coach,
  store,
  area: chrome.storage.local,
  sidePanel: chrome.sidePanel,
  onSettingsChanged: (settings) => scheduleReminder(settings, chrome.alarms),
  log,
  uiLanguage: () => chrome.i18n.getUILanguage(),
});

chrome.runtime.onMessage.addListener((msg: unknown, sender, sendResponse) => {
  if (!isMessage(msg)) return false;
  if (!isAllowed(msg.type, sender, chrome.runtime.id, chrome.runtime.getURL(''), __E2E__)) {
    sendResponse({ ok: false, error: { name: 'Forbidden', message: 'Sender not allowed', code: 'forbidden' } });
    return false;
  }
  // router.handle runs synchronously up to the first await, so openPanel keeps the user gesture.
  void router.handle(msg, { tabId: sender.tab?.id }).then(sendResponse);
  return true; // respond asynchronously
});

const setupMenus = () =>
  registerMenus(chrome.contextMenus, (k) => chrome.i18n.getMessage(k), __E2E__).catch((e) =>
    log('LangCoach: context menu setup failed', e),
  );

const syncReminder = () =>
  router
    .handle({ type: 'getSettings' })
    .then((r) => (r.ok ? scheduleReminder(r.data, chrome.alarms) : undefined))
    .catch((e) => log('LangCoach: reminder schedule failed', e));

const syncRollover = () => scheduleRollover(chrome.alarms).catch((e) => log('LangCoach: rollover schedule failed', e));

chrome.runtime.onInstalled.addListener(() => {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  void setupMenus();
  void syncReminder();
  void syncRollover();
  void router.ensurePlan();
});
chrome.runtime.onStartup.addListener(() => {
  void setupMenus();
  void syncReminder();
  void syncRollover();
  void router.ensurePlan();
});

// Every service-worker start (browser start, wake-up for an event): apply streak freezes for today.
// Idempotent per day; banners are queued once and shown by the panel until dismissed.
void router.rollover();

const onMenuClick = createMenuClickHandler({ coach, tabs: chrome.tabs, log });
chrome.contextMenus.onClicked.addListener((info, tab) => void onMenuClick(info, tab));

const onAlarm = createReminderAlarmHandler({
  coach,
  notifications: chrome.notifications,
  t: (k) => chrome.i18n.getMessage(k),
  iconUrl: chrome.runtime.getURL('icons/128.png'),
  ensurePlan: () => router.ensurePlan(),
  reschedule: () => syncReminder().then(() => undefined),
});
const onRolloverAlarm = createRolloverAlarmHandler({ rollover: () => router.rollover(), reschedule: syncRollover });
chrome.alarms.onAlarm.addListener((alarm) => {
  void onAlarm(alarm);
  void onRolloverAlarm(alarm);
});

const onNotificationClick = createReminderClickHandler({
  sidePanel: chrome.sidePanel,
  tabs: chrome.tabs,
  windows: chrome.windows,
  notifications: chrome.notifications,
});
chrome.notifications.onClicked.addListener((id) => void onNotificationClick(id));
