import { Coach, MemoryStore, isoWeek, progressOf, streak, toLocalDate, type State } from '@langcoach/core/browser';
import { describe, expect, it, vi } from 'vitest';
import {
  REMINDER_ALARM,
  REMINDER_NOTIFICATION_ID,
  ROLLOVER_ALARM,
  createReminderAlarmHandler,
  createReminderClickHandler,
  createRolloverAlarmHandler,
  nextReminderAt,
  scheduleReminder,
  scheduleRollover,
} from '../src/background/reminder';
import { BANNERS_KEY, ROLLOVER_KEY, createRouter } from '../src/background/router';
import { isAllowed } from '../src/background/policy';
import type { Banner, Message, Snapshot } from '../src/shared/messages';
import { fakeArea } from './chrome-fake';

let NOW = new Date(2026, 9, 22, 10, 0);
const profile = {
  nativeLanguage: 'Turkish',
  targetLanguage: 'Spanish (Spain)',
  level: 'A2' as const,
  goal: 'travel',
  minutesPerDay: 15,
  daysPerWeek: 7,
};

function setup() {
  NOW = new Date(2026, 9, 22, 10, 0);
  const store = new MemoryStore();
  let n = 0;
  const coach = new Coach(store, () => NOW, () => `id${++n}`);
  const area = fakeArea();
  const router = createRouter({ coach, store, area, clock: () => NOW, log: () => {} });
  const call = async <T>(m: Message): Promise<T> => {
    const r = (await router.handle(m)) as { ok: boolean; data?: T; error?: { name: string; message: string } };
    if (!r.ok) throw Object.assign(new Error(r.error!.message), r.error);
    return r.data as T;
  };
  return { store, coach, area, router, call };
}

/** Log entries with XP on the given dates. */
async function seedLog(store: MemoryStore, dates: string[]) {
  const s = (await store.load()) as State;
  for (const date of dates) s.log.push({ at: `${date}T10:00:00.000Z`, date, taskId: 't', type: 'quiz', xp: 30 });
  await store.save(s);
}

describe('B4: snapshot progress uses progressOf (same numbers as Coach.progress)', () => {
  it('counts freeze-protected days in the streak and exposes freezes and week XP', async () => {
    const { store, coach, call } = setup();
    await coach.setProfile({ ...profile, dailyGoalXp: 30 });
    await seedLog(store, ['2026-10-20', '2026-10-22']);
    const s = await store.load();
    s.freezeUsedDates = ['2026-10-21'];
    s.streakFreezes = 1;
    await store.save(s);

    const snap = await call<Snapshot>({ type: 'getSnapshot' });
    const want = progressOf(await store.load(), NOW);
    expect(snap.progress).toMatchObject({
      streak: want.streak,
      totalXp: want.totalXp,
      todayXp: want.todayXp,
      dailyGoalXp: 30,
      streakFreezes: 1,
      weekXp: want.weekXp,
    });
    expect(snap.progress.streak).toBe(3);
    // the legacy streak() ignores freezes, so it would have said 1
    expect(streak((await store.load()).log, toLocalDate(NOW))).toBe(1);
    expect((await coach.progress()).streak).toBe(snap.progress.streak);
  });
});

describe('B5: rollover on panel open (once per day), startup and a daily alarm, with one-time banners', () => {
  it('a missed day consumes a freeze and the panel gets a one-time "freeze used" banner', async () => {
    const { store, coach, area, call } = setup();
    await coach.setProfile(profile);
    await seedLog(store, ['2026-10-19', '2026-10-20']); // 21 missed, today 22
    const s = await store.load();
    s.streakFreezes = 1;
    await store.save(s);

    const snap = await call<Snapshot>({ type: 'getSnapshot' });
    expect(snap.banners).toEqual([{ id: 'freezeUsed:2026-10-21', kind: 'freezeUsed', date: '2026-10-21' }]);
    expect(snap.progress.streakFreezes).toBe(0);
    expect(snap.progress.streak).toBe(3);
    expect(area.data.get(ROLLOVER_KEY)).toBe('2026-10-22');

    // shown until dismissed, then never again
    expect((await call<Snapshot>({ type: 'getSnapshot' })).banners).toHaveLength(1);
    await call({ type: 'dismissBanner', id: 'freezeUsed:2026-10-21' });
    expect((await call<Snapshot>({ type: 'getSnapshot' })).banners).toEqual([]);
    expect(area.data.get(BANNERS_KEY)).toEqual([]);
  });

  it('getSnapshot runs rollover at most once per day', async () => {
    const { coach, call } = setup();
    await coach.setProfile(profile);
    const spy = vi.spyOn(coach, 'rollover');
    await call({ type: 'getSnapshot' });
    await call({ type: 'getSnapshot' });
    expect(spy).toHaveBeenCalledTimes(1);
    NOW = new Date(2026, 9, 23, 9, 0);
    await call({ type: 'getSnapshot' });
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('reaching a 7-day streak announces "you earned a streak freeze" once', async () => {
    const { store, coach, router, call } = setup();
    await coach.setProfile(profile);
    await seedLog(store, ['2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18', '2026-10-19', '2026-10-20', '2026-10-21']);
    const banners = await router.rollover();
    expect(banners).toEqual([{ id: 'freezeEarned:2026-10-22', kind: 'freezeEarned', count: 1 }]);
    expect(await router.rollover()).toEqual([]); // idempotent the same day
    expect((await call<Snapshot>({ type: 'getSnapshot' })).banners).toHaveLength(1);
  });

  it('rollover never throws (e.g. corrupt data) and returns no banners', async () => {
    const { coach, router } = setup();
    vi.spyOn(coach, 'rollover').mockRejectedValue(new Error('boom'));
    await expect(router.rollover()).resolves.toEqual([]);
  });

  it('dismissBanner is validated and page-only', async () => {
    const { router } = setup();
    expect(await router.handle({ type: 'dismissBanner', id: '' } as Message)).toMatchObject({
      ok: false,
      error: { code: 'invalid' },
    });
    const ext = 'chrome-extension://abc/';
    expect(isAllowed('dismissBanner', { id: 'abc', url: `${ext}sidepanel.html` }, 'abc', ext, false)).toBe(true);
    expect(isAllowed('dismissBanner', { id: 'abc', url: 'https://labs.google/lll/en', tab: {} }, 'abc', ext, false)).toBe(false);
  });

  it('the daily rollover alarm fires at 00:01 local, runs rollover and schedules the next one', async () => {
    const alarms = { create: vi.fn(async () => {}), clear: vi.fn(async () => true) };
    const now = new Date(2026, 9, 22, 23, 0);
    await scheduleRollover(alarms, now);
    expect(alarms.create).toHaveBeenCalledWith(ROLLOVER_ALARM, { when: new Date(2026, 9, 23, 0, 1).getTime() });
    const rollover = vi.fn(async () => []);
    const reschedule = vi.fn(async () => {});
    const onAlarm = createRolloverAlarmHandler({ rollover, reschedule });
    await onAlarm({ name: 'other' });
    expect(rollover).not.toHaveBeenCalled();
    await onAlarm({ name: ROLLOVER_ALARM });
    expect(rollover).toHaveBeenCalledOnce();
    expect(reschedule).toHaveBeenCalledOnce();
  });
});

describe('B6: onboarding creates the plan atomically with its theme', () => {
  it('setProfile with a theme creates this week with that theme even if a snapshot races in', async () => {
    const { store, call } = setup();
    const p1 = call({ type: 'setProfile', profile, theme: 'ordering tapas' });
    const p2 = call<Snapshot>({ type: 'getSnapshot' }); // would auto-create a plan with another theme
    await Promise.all([p1, p2]);
    expect((await store.load()).plans[isoWeek(NOW)]!.theme).toBe('ordering tapas');
  });

  it('validates the theme', async () => {
    const { router } = setup();
    const r = await router.handle({ type: 'setProfile', profile, theme: 5 } as unknown as Message);
    expect(r).toMatchObject({ ok: false, error: { code: 'invalid' } });
  });
});

describe('B8: reminder scheduling and notification click', () => {
  it('schedules a one-shot alarm (no 1440-minute period that drifts across DST)', async () => {
    const alarms = { create: vi.fn(async () => {}), clear: vi.fn(async () => true) };
    const now = new Date(2026, 2, 28, 20, 0); // the evening before the EU DST switch
    await scheduleReminder({ reminderTime: '19:30' }, alarms, now);
    expect(alarms.create).toHaveBeenCalledWith(REMINDER_ALARM, { when: nextReminderAt(now, '19:30') });
    const at = new Date(nextReminderAt(now, '19:30'));
    expect([at.getDate(), at.getHours(), at.getMinutes()]).toEqual([29, 19, 30]);
  });

  it('after the reminder fires, the next occurrence is scheduled (even when no notification is shown)', async () => {
    const store = new MemoryStore();
    const coach = new Coach(store, () => NOW);
    const reschedule = vi.fn(async () => {});
    const handler = createReminderAlarmHandler({
      coach,
      notifications: { create: vi.fn() },
      t: (k) => k,
      iconUrl: 'i.png',
      reschedule,
    });
    await handler({ name: REMINDER_ALARM });
    expect(reschedule).toHaveBeenCalledOnce();
    await handler({ name: 'other' });
    expect(reschedule).toHaveBeenCalledOnce();
  });

  it('click without a user gesture for the side panel focuses an existing LLL tab', async () => {
    const update = vi.fn(async () => ({}));
    const focus = vi.fn(async () => ({}));
    const create = vi.fn(async () => ({}));
    const onClick = createReminderClickHandler({
      sidePanel: { open: vi.fn(async () => Promise.reject(new Error('may only be called in response to a user gesture'))) },
      tabs: {
        query: vi.fn(async (q: { url?: string }) =>
          q.url ? [{ id: 7, windowId: 3, url: 'https://labs.google/lll/en/experiments/tiny-lesson' }] : [{ id: 1, windowId: 3 }],
        ),
        create,
        update,
      },
      windows: { update: focus },
      notifications: { clear: vi.fn(async () => true) },
    });
    await onClick(REMINDER_NOTIFICATION_ID);
    expect(update).toHaveBeenCalledWith(7, { active: true });
    expect(focus).toHaveBeenCalledWith(3, { focused: true });
    expect(create).not.toHaveBeenCalled();
  });

  it('click with no LLL tab open opens LLL in a new tab', async () => {
    const create = vi.fn(async () => ({}));
    const onClick = createReminderClickHandler({
      sidePanel: { open: vi.fn(async () => Promise.reject(new Error('no gesture'))) },
      tabs: { query: vi.fn(async () => []), create, update: vi.fn() },
      windows: { update: vi.fn() },
      notifications: { clear: vi.fn(async () => true) },
    });
    await onClick(REMINDER_NOTIFICATION_ID);
    expect(create).toHaveBeenCalledWith({ url: 'https://labs.google/lll/en' });
  });
});

export type { Banner };
