import { Coach, MemoryStore } from '@langcoach/core/browser';
import { describe, expect, it } from 'vitest';
import { createRouter } from '../src/background/router';
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
  const router = createRouter({ coach, store, area, clock: () => NOW });
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
    expect(r.data?.today.planExists).toBe(false);
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
    expect(d.data).toEqual({ autoSave: true, reminderTime: null, uiLanguage: 'auto', hasCamera: false });
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
    expect(r.data).toEqual({ autoSave: false, reminderTime: '08:00', uiLanguage: 'auto', hasCamera: true });
  });

  it('falls back to defaults per bad stored settings field', async () => {
    const { call, area } = setup();
    area.data.set('langcoach:settings', { autoSave: 'yes', reminderTime: '07:15', uiLanguage: 5, hasCamera: true });
    const r = await call({ type: 'getSettings' });
    expect(r.data).toEqual({ autoSave: true, reminderTime: '07:15', uiLanguage: 'auto', hasCamera: true });
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

  it('accepts a valid capture payload (reaches the Task 5 stub, not the validator)', async () => {
    const { call } = setup();
    const r = await call({ type: 'capture', kind: 'terms', request: {}, response: { a: 1 }, pageUrl: 'https://labs.google/lll/x' });
    expect(r.error).not.toMatchObject({ code: 'invalid' });
  });

  it('isMessage guards unknown input', () => {
    expect(isMessage({ type: 'reset' })).toBe(true);
    expect(isMessage({ type: 'nope' })).toBe(false);
    expect(isMessage(null)).toBe(false);
  });
});
