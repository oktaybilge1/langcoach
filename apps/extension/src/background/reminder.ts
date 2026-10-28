import type { Coach } from '@langcoach/core/browser';
import type { Settings } from '../shared/messages';

export const REMINDER_ALARM = 'langcoach-reminder';
export const REMINDER_NOTIFICATION_ID = 'langcoach-daily-reminder';
/** Daily alarm that applies streak freezes shortly after local midnight. */
export const ROLLOVER_ALARM = 'langcoach-rollover';
const ROLLOVER_TIME = '00:01';
const LLL_HOME = 'https://labs.google/lll/en';
const LLL_TABS = 'https://labs.google/lll/*';

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * Computes the next occurrence (epoch ms) of `time` ("HH:MM") in local time:
 * today if strictly ahead of `now`, otherwise tomorrow at the same local wall-clock time (DST-safe).
 */
export function nextReminderAt(now: Date, time: string): number {
  const m = TIME_RE.exec(time);
  if (!m) throw new Error(`Invalid reminder time: ${time}`);
  const hours = Number(m[1]);
  const minutes = Number(m[2]);

  const candidate = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    hours,
    minutes,
    0,
    0,
  );
  if (candidate.getTime() > now.getTime()) {
    return candidate.getTime();
  }
  const tomorrow = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1,
    hours,
    minutes,
    0,
    0,
  );
  return tomorrow.getTime();
}

export interface AlarmsLike {
  create(name: string, alarmInfo: { when: number }): unknown;
  clear(name: string): Promise<boolean> | unknown;
}

export async function scheduleReminder(
  settings: Pick<Settings, 'reminderTime'>,
  alarms: AlarmsLike = chrome.alarms,
  now: Date = new Date(),
): Promise<void> {
  if (!settings.reminderTime || !TIME_RE.test(settings.reminderTime)) {
    await alarms.clear(REMINDER_ALARM);
    return;
  }
  // One-shot alarm, re-created after every firing: a fixed 1440-minute period would drift by an hour
  // across a DST change, while nextReminderAt always lands on the local wall-clock time.
  const when = nextReminderAt(now, settings.reminderTime);
  await alarms.create(REMINDER_ALARM, { when });
}

/** Schedules the next daily rollover (00:01 local, one-shot; re-created when it fires). */
export async function scheduleRollover(alarms: AlarmsLike = chrome.alarms, now: Date = new Date()): Promise<void> {
  await alarms.create(ROLLOVER_ALARM, { when: nextReminderAt(now, ROLLOVER_TIME) });
}

export function createRolloverAlarmHandler(deps: { rollover: () => Promise<unknown>; reschedule: () => Promise<void> }) {
  return async (alarm: { name: string }): Promise<void> => {
    if (alarm.name !== ROLLOVER_ALARM) return;
    try {
      await deps.rollover();
    } catch {
      /* rollover logs its own errors */
    }
    try {
      await deps.reschedule();
    } catch {
      /* ignore */
    }
  };
}

export interface ReminderAlarmDeps {
  coach: Coach;
  notifications: {
    create(
      id: string,
      options: { type: 'basic'; iconUrl: string; title: string; message: string },
    ): Promise<unknown> | unknown;
  };
  t: (key: string) => string;
  iconUrl: string;
  /** Creates this week's plan if it is missing (a new ISO week started); runs before the check. */
  ensurePlan?: () => Promise<void>;
  /** Schedules the next occurrence (the alarm is one-shot). */
  reschedule?: () => Promise<void>;
}

export function createReminderAlarmHandler(deps: ReminderAlarmDeps) {
  return async (alarm: { name: string }): Promise<void> => {
    if (alarm.name !== REMINDER_ALARM) return;
    try {
      await notifyIfNeeded();
    } finally {
      if (deps.reschedule) await deps.reschedule().catch(() => undefined);
    }
  };

  async function notifyIfNeeded(): Promise<void> {
    try {
      if (deps.ensurePlan) await deps.ensurePlan();
      const state = await deps.coach.exportData();
      if (!state.profile) return;
      const today = await deps.coach.today();
      // Quiet when the learner already practiced today, or when nothing is left to do (no plan = nothing pending).
      if (state.log.some((e) => e.date === today.date)) return;
      if (!today.tasks.some((task) => task.status === 'todo')) return;
      await deps.notifications.create(REMINDER_NOTIFICATION_ID, {
        type: 'basic',
        iconUrl: deps.iconUrl,
        title: deps.t('reminderTitle'),
        message: deps.t('reminderBody'),
      });
    } catch {
      /* ignore alarm errors */
    }
  }
}

type TabLike = { id?: number; windowId?: number; url?: string };

export interface ReminderClickDeps {
  sidePanel: { open(options: { windowId?: number; tabId?: number }): Promise<void> };
  tabs: {
    query(queryInfo: { active?: boolean; currentWindow?: boolean; url?: string }): Promise<TabLike[]>;
    create(createProperties: { url: string }): Promise<unknown> | unknown;
    update?(tabId: number, props: { active: boolean }): Promise<unknown> | unknown;
  };
  windows?: { update(windowId: number, props: { focused: boolean }): Promise<unknown> | unknown };
  notifications: { clear(id: string): Promise<boolean> | unknown };
}

/**
 * Notification click. Chrome only lets `sidePanel.open()` run in response to a user gesture, and a
 * notification click does not always count as one (it throws "may only be called in response to a
 * user gesture"). So: try the side panel in the current window; if Chrome refuses, focus an open LLL
 * tab (the learner opens the panel from the toolbar there), else open LLL in a new tab.
 */
export function createReminderClickHandler(deps: ReminderClickDeps) {
  return async (notificationId: string): Promise<void> => {
    if (notificationId !== REMINDER_NOTIFICATION_ID) return;
    try {
      await deps.notifications.clear(notificationId);
    } catch {
      /* ignore */
    }
    try {
      const activeTabs = await deps.tabs.query({ active: true, currentWindow: true });
      const winId = activeTabs[0]?.windowId;
      if (winId !== undefined) {
        await deps.sidePanel.open({ windowId: winId });
        return;
      }
    } catch {
      /* no gesture: fall back to an LLL tab */
    }
    try {
      const lll = (await deps.tabs.query({ url: LLL_TABS })).find((t) => t.id !== undefined);
      if (lll?.id !== undefined && deps.tabs.update) {
        await deps.tabs.update(lll.id, { active: true });
        if (lll.windowId !== undefined && deps.windows) await deps.windows.update(lll.windowId, { focused: true });
        return;
      }
    } catch {
      /* fall through to a new tab */
    }
    try {
      await deps.tabs.create({ url: LLL_HOME });
    } catch {
      /* ignore */
    }
  };
}
