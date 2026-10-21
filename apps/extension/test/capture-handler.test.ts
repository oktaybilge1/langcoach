import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Coach, type State } from '@langcoach/core/browser';
import { describe, expect, it, vi } from 'vitest';
import { LAST_CAPTURE_KEY, PENDING_GRAMMAR_KEY, createRouter } from '../src/background/router';
import { ChromeStorageStore } from '../src/background/store';
import type { CaptureResult, Message } from '../src/shared/messages';
import { fakeArea } from './chrome-fake';

const fx = (n: string): unknown =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`./fixtures/${n}`, import.meta.url)), 'utf8'));

const esReq = { sourceLanguage: 'English', targetLanguage: 'European Spanish', purpose: 'ordering coffee at a cafe' };
const zhReq = { sourceLanguage: 'English', targetLanguage: 'Mandarin Chinese' };
const PAGE = 'https://labs.google/lll/en/experiments/tiny-lesson';
const T0 = new Date('2026-03-04T10:00:00Z').getTime();
const profile = {
  nativeLanguage: 'English',
  targetLanguage: 'Spanish',
  level: 'A1' as const,
  goal: 'travel',
  minutesPerDay: 15,
  daysPerWeek: 5,
};

type Res<T> = { ok: boolean; data?: T; error?: { name: string; code?: string } };

/** A "worker": fresh store/coach/router over the shared storage area (survives restarts). */
function worker(area: ReturnType<typeof fakeArea>, now: { t: number }, extra: Partial<Parameters<typeof createRouter>[0]> = {}) {
  const store = new ChromeStorageStore(area);
  let n = 0;
  const salt = Math.random().toString(36).slice(2, 6);
  const clock = () => new Date(now.t);
  const coach = new Coach(store, clock, () => `${salt}-${++n}`);
  const log = vi.fn();
  const router = createRouter({ coach, store, area, clock, log, ...extra });
  const call = <T>(m: Message | Record<string, unknown>, tabId = 7) =>
    router.handle(m as Message, { tabId }) as Promise<Res<T>>;
  const state = async (): Promise<State> => store.load();
  return { call, coach, store, state, log, router };
}

function setup(extra: Partial<Parameters<typeof createRouter>[0]> = {}) {
  const area = fakeArea();
  const now = { t: T0 };
  return { area, now, ...worker(area, now, extra) };
}

const terms = (request: unknown = esReq, response: unknown = fx('terms-es.json'), force?: boolean) => ({
  type: 'capture',
  kind: 'terms',
  request,
  response,
  pageUrl: PAGE,
  ...(force === undefined ? {} : { force }),
});
const grammar = (request: unknown = esReq) => ({
  type: 'capture',
  kind: 'grammar',
  request,
  response: fx('grammar-es.json'),
  pageUrl: PAGE,
});
type Saved = Extract<CaptureResult, { status: 'saved' }>;

describe('capture handler', () => {
  it('saves the es terms fixture: 20 new cards, xp from autoComplete, lesson source', async () => {
    const { call, state } = setup();
    const r = await call<Saved>(terms());
    expect(r.ok).toBe(true);
    expect(r.data).toMatchObject({ status: 'saved', newCards: 20, duplicates: 0, xp: 20 });
    expect(r.data?.lessonIds).toHaveLength(1);
    const s = await state();
    expect(s.cards).toHaveLength(20);
    expect(s.lessons[0]).toMatchObject({
      kind: 'tiny_lesson',
      situation: 'ordering coffee at a cafe',
      source: { app: 'lll', targetLanguage: 'European Spanish', sourceLanguage: 'English', purpose: 'ordering coffee at a cafe' },
    });
    expect(s.log.at(-1)).toMatchObject({ type: 'tiny_lesson', xp: 20 });
  });

  it('same capture again: 0 new, 20 duplicates', async () => {
    const { call } = setup();
    await call(terms());
    const r = await call<Saved>(terms());
    expect(r.data).toMatchObject({ status: 'saved', newCards: 0, duplicates: 20 });
  });

  it('calls autoComplete once with the lesson kind and returns its xp', async () => {
    const { call, coach } = setup();
    await coach.setProfile(profile);
    const spy = vi.spyOn(coach, 'autoComplete');
    const r = await call<Saved>({ type: 'capture', kind: 'conversation', request: zhReq, response: fx('conversation-zh.json'), pageUrl: PAGE });
    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0]?.[0]).toBe('slang_hang');
    expect(r.data?.xp).toBe((await spy.mock.results[0]!.value).xpAwarded);
  });

  it('saves a zh conversation as slang_hang with pronunciation', async () => {
    const { call, state } = setup();
    const r = await call<Saved>({ type: 'capture', kind: 'conversation', request: zhReq, response: fx('conversation-zh.json'), pageUrl: PAGE });
    expect(r.data?.status).toBe('saved');
    const s = await state();
    expect(s.lessons[0]?.kind).toBe('slang_hang');
    expect(s.cards.length).toBeGreaterThan(0);
    expect(s.cards[0]?.pronunciation).toMatch(/\S/);
  });

  it('ignores unknown shapes: null, nothing stored, logged', async () => {
    const { call, state, area, log } = setup();
    const r = await call(terms(esReq, { surprise: true }));
    expect(r).toEqual({ ok: true, data: null });
    expect((await state()).lessons).toHaveLength(0);
    expect(area.data.has(LAST_CAPTURE_KEY)).toBe(false);
    expect(log).toHaveBeenCalled();
  });

  it('persists lastCapture with lesson ids, counts, time and tab', async () => {
    const { call, area } = setup();
    const r = await call<Saved>(terms(), 42);
    expect(area.data.get(LAST_CAPTURE_KEY)).toEqual({
      lessonIds: r.data!.lessonIds,
      newCards: 20,
      duplicates: 0,
      at: new Date(T0).toISOString(),
      tabId: 42,
    });
  });

  it('undo works after a service-worker restart (fresh Coach/router, same storage)', async () => {
    const { call, area, now } = setup();
    const r = await call<Saved>(terms());
    const w2 = worker(area, now);
    const u = await w2.call<{ removedCards: number }>({ type: 'undo', lessonIds: r.data!.lessonIds });
    expect(u).toEqual({ ok: true, data: { removedCards: 20 } });
    const s = await w2.state();
    expect(s.cards).toHaveLength(0);
    expect(s.lessons).toHaveLength(0);
    expect(area.data.has(LAST_CAPTURE_KEY)).toBe(false);
    // a second undo has nothing to undo
    expect((await w2.call({ type: 'undo', lessonIds: r.data!.lessonIds })).ok).toBe(false);
  });

  it('refuses undo after 10 minutes or for ids not in lastCapture', async () => {
    const { call, now, state } = setup();
    const r = await call<Saved>(terms());
    expect((await call({ type: 'undo', lessonIds: ['someone-else'] })).ok).toBe(false);
    now.t = T0 + 10 * 60_000 + 1;
    expect((await call({ type: 'undo', lessonIds: r.data!.lessonIds })).ok).toBe(false);
    expect((await state()).cards).toHaveLength(20);
  });

  it('splits more than 50 items into consecutive lessons; undo removes them all', async () => {
    const { call, state, area } = setup();
    const many = { vocabulary: Array.from({ length: 120 }, (_, i) => ({ term: `w${i}`, translation: `t${i}` })), phrases: [] };
    const r = await call<Saved>(terms(esReq, many));
    expect(r.data).toMatchObject({ status: 'saved', newCards: 120, duplicates: 0 });
    expect(r.data?.lessonIds).toHaveLength(3);
    const s = await state();
    expect(s.lessons.map((l) => [l.situation, l.items.length])).toEqual([
      ['ordering coffee at a cafe', 50],
      ['ordering coffee at a cafe (2)', 50],
      ['ordering coffee at a cafe (3)', 20],
    ]);
    expect((area.data.get(LAST_CAPTURE_KEY) as { lessonIds: string[] }).lessonIds).toEqual(r.data!.lessonIds);
    const u = await call<{ removedCards: number }>({ type: 'undo', lessonIds: r.data!.lessonIds });
    expect(u.data?.removedCards).toBe(120);
    expect((await state()).lessons).toHaveLength(0);
  });

  it('a save error responds ok:false, logs, and rolls back earlier chunks', async () => {
    const { call, coach, state, log, area } = setup();
    const many = { vocabulary: Array.from({ length: 60 }, (_, i) => ({ term: `w${i}`, translation: `t${i}` })), phrases: [] };
    const real = coach.saveLesson.bind(coach);
    let k = 0;
    vi.spyOn(coach, 'saveLesson').mockImplementation(async (i) => {
      if (++k === 2) throw new Error('disk full');
      return real(i);
    });
    const r = await call(terms(esReq, many));
    expect(r.ok).toBe(false);
    expect(log).toHaveBeenCalled();
    expect((await state()).lessons).toHaveLength(0);
    expect(area.data.has(LAST_CAPTURE_KEY)).toBe(false);
  });

  describe('grammar', () => {
    it('grammar after terms within 5 minutes attaches to that lesson', async () => {
      const { call, state, now } = setup();
      await call(terms());
      now.t = T0 + 4 * 60_000;
      const g = await call<CaptureResult>(grammar());
      expect(g.data).toEqual({ status: 'grammar' });
      const s = await state();
      expect(s.lessons).toHaveLength(1);
      expect(s.lessons[0]?.grammar?.[0]?.topic).toBe('The conditional tense for polite requests');
    });

    it('grammar before terms is kept pending and attached when terms arrive', async () => {
      const { call, state, area } = setup();
      await call(grammar());
      expect(area.data.has(PENDING_GRAMMAR_KEY)).toBe(true);
      expect((await state()).lessons).toHaveLength(0);
      await call(terms());
      const s = await state();
      expect(s.lessons[0]?.grammar).toHaveLength(3);
      expect(area.data.get(PENDING_GRAMMAR_KEY) ?? {}).toEqual({});
    });

    it('parallel arrival in both orders attaches grammar exactly once', async () => {
      for (const order of ['terms-first', 'grammar-first']) {
        const { call, state } = setup();
        const msgs = order === 'terms-first' ? [terms(), grammar()] : [grammar(), terms()];
        await Promise.all(msgs.map((m) => call(m)));
        const s = await state();
        expect(s.lessons, order).toHaveLength(1);
        expect(s.lessons[0]?.grammar, order).toHaveLength(3);
      }
    });

    it('does not attach to a lesson older than 5 minutes or with another purpose/target', async () => {
      const { call, state, now } = setup();
      await call(terms());
      now.t = T0 + 5 * 60_000 + 1;
      await call(grammar());
      await call(grammar({ ...esReq, purpose: 'something else' }));
      await call(grammar({ ...esReq, targetLanguage: 'German' }));
      expect((await state()).lessons[0]?.grammar).toBeUndefined();
    });

    it('pending grammar expires after 5 minutes', async () => {
      const { call, state, now } = setup();
      await call(grammar());
      now.t = T0 + 5 * 60_000 + 1;
      await call(terms());
      expect((await state()).lessons[0]?.grammar).toBeUndefined();
    });
  });

  describe('autoSave off', () => {
    it('does not save; reports the count; force:true saves', async () => {
      const { call, state, area } = setup();
      await call({ type: 'setSettings', settings: { autoSave: false } });
      const r = await call<CaptureResult>(terms());
      expect(r.data).toEqual({ status: 'pending', count: 20 });
      expect((await state()).lessons).toHaveLength(0);
      expect(area.data.has(LAST_CAPTURE_KEY)).toBe(false);
      const f = await call<Saved>(terms(esReq, fx('terms-es.json'), true));
      expect(f.data).toMatchObject({ status: 'saved', newCards: 20 });
      expect(area.data.has(LAST_CAPTURE_KEY)).toBe(true);
    });
  });

  describe('pendingTargetLanguage', () => {
    it('is set from the first capture when there is no profile, and not overwritten', async () => {
      const { call } = setup();
      await call(terms());
      await call({ type: 'capture', kind: 'conversation', request: zhReq, response: fx('conversation-zh.json'), pageUrl: PAGE });
      const s = await call<{ pendingTargetLanguage?: string }>({ type: 'getSettings' });
      expect(s.data?.pendingTargetLanguage).toBe('European Spanish');
    });
    it('is not set when a profile exists', async () => {
      const { call, coach } = setup();
      await coach.setProfile(profile);
      await call(terms());
      const s = await call<{ pendingTargetLanguage?: string }>({ type: 'getSettings' });
      expect(s.data?.pendingTargetLanguage).toBeUndefined();
    });
  });

  it('openPanel opens the side panel for the sender tab synchronously (user gesture)', () => {
    const open = vi.fn(async () => {});
    const { router } = setup({ sidePanel: { open } });
    void router.handle({ type: 'openPanel' }, { tabId: 9 });
    expect(open).toHaveBeenCalledWith({ tabId: 9 });
  });

  it.each<[string, unknown]>([
    ['capture force non-boolean', { ...terms(), force: 'yes' }],
    ['undo lessonIds missing', { type: 'undo' }],
    ['undo lessonIds empty', { type: 'undo', lessonIds: [] }],
    ['undo lessonIds bad entry', { type: 'undo', lessonIds: [5] }],
  ])('rejects invalid payload: %s', async (_n, msg) => {
    const { call } = setup();
    expect(await call(msg as Message)).toMatchObject({ ok: false, error: { code: 'invalid' } });
  });
});
