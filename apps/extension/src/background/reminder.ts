import type { Coach } from '@langcoach/core/browser';
import type { Settings } from '../shared/messages';

export const REMINDER_ALARM = 'langcoach-reminder';
export const REMINDER_NOTIFICATION_ID = 'langcoach-daily-reminder';

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
  create(name: string, alarmInfo: { when: number; periodInMinutes: number }): unknown;
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
  const when = nextReminderAt(now, settings.reminderTime);
  await alarms.create(REMINDER_ALARM, { when, periodInMinutes: 1440 });
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
}

export function createReminderAlarmHandler(deps: ReminderAlarmDeps) {
  return async (alarm: { name: string }): Promise<void> => {
    if (alarm.name !== REMINDER_ALARM) return;
    try {
      const state = await deps.coach.exportData();
      if (!state.profile) return;
      const today = await deps.coach.today();
      const hasPending = today.tasks.length === 0 || today.tasks.some((task) => task.status !== 'done');
      if (!hasPending) return;
      await deps.notifications.create(REMINDER_NOTIFICATION_ID, {
        type: 'basic',
        iconUrl: deps.iconUrl,
        title: deps.t('reminderTitle'),
        message: deps.t('reminderBody'),
      });
    } catch {
      /* ignore alarm errors */
    }
  };
}

export interface ReminderClickDeps {
  sidePanel: { open(options: { windowId?: number; tabId?: number }): Promise<void> };
  tabs: {
    query(queryInfo: { active: boolean; currentWindow: boolean }): Promise<{ id?: number; windowId?: number }[]>;
    create(createProperties: { url: string }): Promise<unknown> | unknown;
  };
  notifications: { clear(id: string): Promise<boolean> | unknown };
}

export function createReminderClickHandler(deps: ReminderClickDeps) {
  return async (notificationId: string): Promise<void> => {
    if (notificationId !== REMINDER_NOTIFICATION_ID) return;
    try {
      await deps.notifications.clear(notificationId);
      const activeTabs = await deps.tabs.query({ active: true, currentWindow: true });
      const winId = activeTabs[0]?.windowId;
      if (winId !== undefined) {
        await deps.sidePanel.open({ windowId: winId });
        return;
      }
    } catch {
      /* fall back to opening LLL tab */
    }
    try {
      await deps.tabs.create({ url: 'https://labs.google/lll/en' });
    } catch {
      /* ignore */
    }
  };
}
