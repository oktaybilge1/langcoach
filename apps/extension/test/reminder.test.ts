import { Coach, MemoryStore } from '@langcoach/core/browser';
import { describe, expect, it, vi } from 'vitest';
import {
  REMINDER_ALARM,
  REMINDER_NOTIFICATION_ID,
  createReminderAlarmHandler,
  createReminderClickHandler,
  nextReminderAt,
  scheduleReminder,
} from '../src/background/reminder';

describe('daily reminder', () => {
  it('nextReminderAt schedules today when the time is still ahead in local time', () => {
    const now = new Date(2026, 2, 10, 14, 0, 0, 0); // 14:00 local
    const when = nextReminderAt(now, '19:30');
    const target = new Date(when);
    expect(target.getFullYear()).toBe(2026);
    expect(target.getMonth()).toBe(2);
    expect(target.getDate()).toBe(10);
    expect(target.getHours()).toBe(19);
    expect(target.getMinutes()).toBe(30);
    expect(when).toBeGreaterThan(now.getTime());
  });

  it('nextReminderAt schedules tomorrow when the time has passed or equals now (DST-safe local date arithmetic)', () => {
    const now = new Date(2026, 2, 10, 19, 30, 0, 0); // 19:30 local
    const when = nextReminderAt(now, '19:30');
    const target = new Date(when);
    expect(target.getFullYear()).toBe(2026);
    expect(target.getMonth()).toBe(2);
    expect(target.getDate()).toBe(11);
    expect(target.getHours()).toBe(19);
    expect(target.getMinutes()).toBe(30);
  });

  it('scheduleReminder creates or clears the alarm based on reminderTime', async () => {
    const alarms = {
      create: vi.fn(async () => {}),
      clear: vi.fn(async () => true),
    };
    const now = new Date(2026, 2, 10, 8, 0, 0, 0);

    await scheduleReminder({ reminderTime: '18:45' }, alarms, now);
    expect(alarms.create).toHaveBeenCalledWith(REMINDER_ALARM, {
      when: nextReminderAt(now, '18:45'),
      periodInMinutes: 1440,
    });

    await scheduleReminder({ reminderTime: null }, alarms, now);
    expect(alarms.clear).toHaveBeenCalledWith(REMINDER_ALARM);
  });

  it('alarm fires notification only when today has incomplete tasks or no activity yet', async () => {
    const now = new Date('2026-03-04T18:00:00Z');
    const store = new MemoryStore();
    const coach = new Coach(store, () => now);
    await coach.setProfile({
      nativeLanguage: 'English',
      targetLanguage: 'Spanish (Spain)',
      level: 'A1',
      goal: 'travel',
      minutesPerDay: 15,
      daysPerWeek: 7,
    });
    const plan = await coach.weekPlan('Ordering coffee');
    const createNotif = vi.fn(async () => REMINDER_NOTIFICATION_ID);
    const handler = createReminderAlarmHandler({
      coach,
      notifications: { create: createNotif },
      t: (k) => `i18n:${k}`,
      iconUrl: 'icons/128.png',
    });

    // Incomplete tasks today -> notification created
    await handler({ name: REMINDER_ALARM });
    expect(createNotif).toHaveBeenCalledOnce();
    expect(createNotif).toHaveBeenCalledWith(REMINDER_NOTIFICATION_ID, {
      type: 'basic',
      iconUrl: 'icons/128.png',
      title: 'i18n:reminderTitle',
      message: 'i18n:reminderBody',
    });

    // Complete all of today's tasks -> no notification
    createNotif.mockClear();
    const today = await coach.today();
    for (const task of today.tasks) {
      await coach.completeTask(task.id);
    }
    expect(plan.tasks.length).toBeGreaterThan(0);
    await handler({ name: REMINDER_ALARM });
    expect(createNotif).not.toHaveBeenCalled();
  });

  it('notification click opens side panel when windowId available, else opens LLL tab', async () => {
    const openPanel = vi.fn(async () => {});
    const createTab = vi.fn(async () => ({}));
    const onClick = createReminderClickHandler({
      sidePanel: { open: openPanel },
      tabs: { query: vi.fn(async () => [{ id: 5, windowId: 12 }]), create: createTab },
      notifications: { clear: vi.fn(async () => true) },
    });

    await onClick(REMINDER_NOTIFICATION_ID);
    expect(openPanel).toHaveBeenCalledWith({ windowId: 12 });
    expect(createTab).not.toHaveBeenCalled();

    // Fallback when sidePanel.open throws or no active tab
    openPanel.mockRejectedValueOnce(new Error('No user gesture'));
    await onClick(REMINDER_NOTIFICATION_ID);
    expect(createTab).toHaveBeenCalledWith({ url: 'https://labs.google/lll/en' });
  });
});
