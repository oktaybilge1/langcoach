import { Coach, MemoryStore, isoWeek } from '@langcoach/core/browser';
import { describe, expect, it, vi } from 'vitest';
import { createRouter } from '../src/background/router';
import { suggestThemes } from '../src/lib/themes';
import { isMessage, type Message } from '../src/shared/messages';
import { fakeArea } from './chrome-fake';

const NOW = new Date('2026-03-04T10:00:00');
const profile = {
  nativeLanguage: 'English',
  targetLanguage: 'Spanish',
  level: 'A1' as const,
  goal: 'travel',
  minutesPerDay: 15,
  daysPerWeek: 5,
};

function setup() {
  const store = new MemoryStore();
  let n = 0;
  const coach = new Coach(store, () => NOW, () => `id${++n}`);
  const area = fakeArea();
  const router = createRouter({ coach, store, area, clock: () => NOW, log: () => {} });
  const call = <T>(m: Message) => router.handle(m) as Promise<{ ok: boolean; data?: T; error?: { name: string } }>;
  return { call, area };
}

describe('background router', () => {
  it('getSnapshot works without a profile', async () => {
    const { call } = setup();
    const r = await call<{ profile: unknown; today: unknown; dueCount: number; lastCapture: unknown }>({
      type: 'getSnapshot',
    });
    expect(r.ok).toBe(true);
    expect(r.data).toMatchObject({ profile: null, today: null, dueCount: 0, lastCapture: null });
  });

  it('setProfile then getSnapshot reflects it', async () => {
    const { call } = setup();
    expect((await call({ type: 'setProfile', profile })).ok).toBe(true);
    const r = await call<{ profile: { targetLanguage: string }; today: { planExists: boolean } }>({
      type: 'getSnapshot',
    });
    expect(r.data?.profile.targetLanguage).toBe('Spanish');
    expect(r.data?.today.planExists).toBe(true); // the week's plan is created on demand (C1)
  });

  it('saveManual, getDue, review, updateCard delegate to the coach', async () => {
    const { call } = setup();
    await call({ type: 'setProfile', profile });
    const saved = await call<{ card: { id: string } }>({ type: 'saveManual', term: 'hola', translation: 'hello' });
    expect(saved.data?.card.id).toBeTruthy();
    const due = await call<{ id: string }[]>({ type: 'getDue', limit: 10 });
    expect(due.data).toHaveLength(1);
    const id = saved.data!.card.id;
    expect((await call({ type: 'updateCard', cardId: id, patch: { example: 'Hola!' } })).ok).toBe(true);
    expect((await call({ type: 'review', cardId: id, rating: 3 })).ok).toBe(true);
  });

  it('export / import / reset round trip', async () => {
    const { call } = setup();
    await call({ type: 'setProfile', profile });
    const exp = await call<{ json: string }>({ type: 'exportData' });
    await call({ type: 'reset' });
    expect((await call<{ profile: unknown }>({ type: 'getSnapshot' })).data?.profile).toBeNull();
    const imp = await call<{ lessons: number }>({ type: 'importData', json: exp.data!.json });
    expect(imp.data).toEqual({ lessons: 0, cards: 0 });
    expect((await call<{ profile: unknown }>({ type: 'getSnapshot' })).data?.profile).not.toBeNull();
  });

  it('importData with bad JSON returns an InvalidDataError', async () => {
    const { call } = setup();
    const r = await call({ type: 'importData', json: '{nope' });
    expect(r).toMatchObject({ ok: false, error: { name: 'InvalidDataError' } });
  });

  it('serializes coach errors', async () => {
    const { call } = setup();
    const r = await call({ type: 'getDue', limit: 5 });
    expect(r).toMatchObject({ ok: false, error: { name: 'NoProfileError' } });
  });

  it('settings default, merge and validate', async () => {
    const { call } = setup();
    const d = await call<{ autoSave: boolean; uiLanguage: string }>({ type: 'getSettings' });
    expect(d.data).toEqual({ autoSave: true, reminderTime: null, uiLanguage: 'auto', hasCamera: false, showNativeOnPage: true });
    const s = await call<{ reminderTime: string; autoSave: boolean }>({
      type: 'setSettings',
      settings: { reminderTime: '19:30' },
    });
    expect(s.data).toMatchObject({ reminderTime: '19:30', autoSave: true });
    const bad = await call({ type: 'setSettings', settings: { reminderTime: '25:99' } });
    expect(bad).toMatchObject({ ok: false, error: { name: 'InvalidDataError' } });
  });

  it('persists concurrent setSettings calls', async () => {
    const { call } = setup();
    await Promise.all([
      call({ type: 'setSettings', settings: { autoSave: false } }),
      call({ type: 'setSettings', settings: { reminderTime: '08:00' } }),
      call({ type: 'setSettings', settings: { hasCamera: true } }),
    ]);
    const r = await call({ type: 'getSettings' });
    expect(r.data).toEqual({ autoSave: false, reminderTime: '08:00', uiLanguage: 'auto', hasCamera: true, showNativeOnPage: true });
  });

  it('falls back to defaults per bad stored settings field', async () => {
    const { call, area } = setup();
    area.data.set('langcoach:settings', { autoSave: 'yes', reminderTime: '07:15', uiLanguage: 5, hasCamera: true });
    const r = await call({ type: 'getSettings' });
    expect(r.data).toEqual({ autoSave: true, reminderTime: '07:15', uiLanguage: 'auto', hasCamera: true, showNativeOnPage: true });
  });

  it.each<[string, unknown]>([
    ['getDue limit 0', { type: 'getDue', limit: 0 }],
    ['getDue limit 201', { type: 'getDue', limit: 201 }],
    ['getDue limit float', { type: 'getDue', limit: 1.5 }],
    ['review rating 5', { type: 'review', cardId: 'a', rating: 5 }],
    ['review empty cardId', { type: 'review', cardId: '', rating: 3 }],
    ['review long cardId', { type: 'review', cardId: 'x'.repeat(201), rating: 3 }],
    ['undo lessonId number', { type: 'undo', lessonId: 4 }],
    ['saveManual empty term', { type: 'saveManual', term: '' }],
    ['saveManual long term', { type: 'saveManual', term: 'x'.repeat(201) }],
    ['updateCard patch array', { type: 'updateCard', cardId: 'a', patch: [] }],
    ['updateCard patch field', { type: 'updateCard', cardId: 'a', patch: { example: 3 } }],
    ['importData non-string', { type: 'importData', json: 5 }],
    ['importData too large', { type: 'importData', json: 'x'.repeat(20 * 1024 * 1024 + 1) }],
    ['setProfile null', { type: 'setProfile', profile: null }],
    ['setSettings null', { type: 'setSettings', settings: null }],
    ['capture bad kind', { type: 'capture', kind: 'nope', request: {}, response: {}, pageUrl: 'x' }],
    ['capture bad url', { type: 'capture', kind: 'terms', request: {}, response: {}, pageUrl: 5 }],
  ])('rejects invalid payload: %s', async (_n, msg) => {
    const { call } = setup();
    const r = await call(msg as Message);
    expect(r).toMatchObject({ ok: false, error: { code: 'invalid' } });
  });

  it('accepts a valid capture payload with an unknown shape and ignores it', async () => {
    const { call } = setup();
    const r = await call({ type: 'capture', kind: 'terms', request: {}, response: { a: 1 }, pageUrl: 'https://labs.google/lll/x' });
    expect(r).toEqual({ ok: true, data: null });
  });

  describe('weekly plan upkeep (C1)', () => {
    function weekSetup(uiLanguage = () => 'en') {
      const store = new MemoryStore();
      const now = { t: NOW.getTime() };
      let n = 0;
      const clock = () => new Date(now.t);
      const coach = new Coach(store, clock, () => `id${++n}`);
      const area = fakeArea();
      const router = createRouter({ coach, store, area, clock, log: () => {}, uiLanguage });
      const call = <T>(m: Message) => router.handle(m) as Promise<{ ok: boolean; data?: T; error?: { name: string } }>;
      return { call, now, store, router, coach };
    }
    type Snap = { today: { planExists: boolean; tasks: unknown[] }; plan: { week: string; theme: string } | null };

    it('getSnapshot in the next ISO week creates the plan for that week with a suggested theme', async () => {
      const { call, now } = weekSetup();
      await call({ type: 'setProfile', profile });
      await call({ type: 'createPlan', theme: 'first week' });
      now.t += 7 * 86_400_000;
      const week = isoWeek(new Date(now.t));
      const r = await call<Snap>({ type: 'getSnapshot' });
      expect(r.ok).toBe(true);
      expect(r.data?.today.planExists).toBe(true);
      expect(r.data?.plan?.week).toBe(week);
      const seed = Number(week.split('-W')[1]);
      expect(r.data?.plan?.theme).toBe(suggestThemes('travel', 'A1', 'en', seed)[0]);
    });

    it('uses the UI language setting (or the browser language for auto) for the theme', async () => {
      const { call } = weekSetup(() => 'tr-TR');
      await call({ type: 'setProfile', profile });
      const seed = Number(isoWeek(NOW).split('-W')[1]);
      const r = await call<Snap>({ type: 'getSnapshot' });
      expect(r.data?.plan?.theme).toBe(suggestThemes('travel', 'A1', 'tr', seed)[0]);
    });

    it('does not create a plan without a profile, and ensurePlan is exposed for startup/alarms', async () => {
      const { call, router, store } = weekSetup();
      await router.ensurePlan();
      expect(Object.keys((await store.load()).plans)).toHaveLength(0);
      await call({ type: 'setProfile', profile });
      await router.ensurePlan();
      expect(Object.keys((await store.load()).plans)).toEqual([isoWeek(NOW)]);
    });

    it('keeps an existing plan for the current week', async () => {
      const { call } = weekSetup();
      await call({ type: 'setProfile', profile });
      await call({ type: 'createPlan', theme: 'my own theme' });
      const r = await call<Snap>({ type: 'getSnapshot' });
      expect(r.data?.plan?.theme).toBe('my own theme');
    });

    it('loads the stored state once per snapshot when the plan exists (I7)', async () => {
      const { call, store } = weekSetup();
      await call({ type: 'setProfile', profile });
      await call({ type: 'getSnapshot' });
      const spy = vi.spyOn(store, 'load');
      const r = await call<Snap & { progress: { weekly: { planned: number } } }>({ type: 'getSnapshot' });
      expect(r.data?.progress.weekly.planned).toBeGreaterThan(0);
      expect(spy).toHaveBeenCalledTimes(1);
    });
  });

  it('isMessage guards unknown input', () => {
    expect(isMessage({ type: 'reset' })).toBe(true);
    expect(isMessage({ type: 'nope' })).toBe(false);
    expect(isMessage(null)).toBe(false);
  });
});
