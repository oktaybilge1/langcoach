import { Coach, MemoryStore } from '@langcoach/core/browser';
import { describe, expect, it } from 'vitest';
import { isAllowed } from '../src/background/policy';
import { createRouter, SETTINGS_KEY } from '../src/background/router';
import type { Message } from '../src/shared/messages';
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
  const call = <T>(m: unknown) =>
    router.handle(m as Message) as Promise<{ ok: boolean; data?: T; error?: { name: string; code?: string } }>;
  return { call, area, store };
}

async function withCards(count: number) {
  const s = setup();
  await s.call({ type: 'setProfile', profile });
  const ids: string[] = [];
  for (let i = 0; i < count; i++) {
    const r = await s.call<{ card: { id: string } }>({ type: 'saveManual', term: `palabra${i}`, translation: `word${i}` });
    ids.push(r.data!.card.id);
  }
  return { ...s, ids };
}

describe('practice messages', () => {
  it('getPracticeCards returns the deck, due cards first, capped by limit', async () => {
    const { call, ids } = await withCards(6);
    await call({ type: 'review', cardId: ids[0], rating: 4 }); // no longer due
    const all = await call<{ id: string }[]>({ type: 'getPracticeCards' });
    expect(all.ok).toBe(true);
    expect(all.data).toHaveLength(6);
    expect(all.data!.at(-1)!.id).toBe(ids[0]);
    const some = await call<{ id: string }[]>({ type: 'getPracticeCards', limit: 2 });
    expect(some.data).toHaveLength(2);
  });

  it('getPracticeCards validates limit', async () => {
    const { call } = await withCards(1);
    for (const limit of [0, 501, 1.5, '3']) {
      const r = await call({ type: 'getPracticeCards', limit });
      expect(r.ok, `limit ${String(limit)}`).toBe(false);
      expect(r.error?.code).toBe('invalid');
    }
  });

  it('recordPractice records once per session id and the snapshot shows today XP', async () => {
    const { call, ids } = await withCards(4);
    const before = await call<{ progress: { todayXp: number; dailyGoalXp: number } }>({ type: 'getSnapshot' });
    const results = ids.map((cardId) => ({ cardId, outcome: 'correct' }));
    const first = await call<{ xp: number; perfect: boolean }>({ type: 'recordPractice', sessionId: 's-1', results });
    expect(first.data).toMatchObject({ xp: 4 + 5 + 5, perfect: true });
    const again = await call<{ xp: number }>({ type: 'recordPractice', sessionId: 's-1', results });
    expect(again.data?.xp).toBe(14);
    const after = await call<{ progress: { todayXp: number; dailyGoalXp: number } }>({ type: 'getSnapshot' });
    expect(after.data!.progress.todayXp - before.data!.progress.todayXp).toBe(14);
    expect(after.data!.progress.dailyGoalXp).toBe(20);
  });

  it('recordPractice validates the payload', async () => {
    const { call } = await withCards(1);
    const ok = { cardId: 'c', outcome: 'correct' };
    const bad: unknown[] = [
      { sessionId: '', results: [ok] },
      { sessionId: 'x'.repeat(101), results: [ok] },
      { sessionId: 3, results: [ok] },
      { sessionId: 's', results: [] },
      { sessionId: 's', results: Array.from({ length: 51 }, () => ok) },
      { sessionId: 's', results: 'nope' },
      { sessionId: 's', results: [{ cardId: '', outcome: 'correct' }] },
      { sessionId: 's', results: [{ cardId: 'x'.repeat(201), outcome: 'correct' }] },
      { sessionId: 's', results: [{ cardId: 'c', outcome: 'easy' }] },
      { sessionId: 's', results: [null] },
    ];
    for (const b of bad) {
      const r = await call({ type: 'recordPractice', ...(b as object) });
      expect(r.ok, JSON.stringify(b).slice(0, 80)).toBe(false);
      expect(r.error?.code).toBe('invalid');
    }
    expect((await call({ type: 'recordPractice', sessionId: 'x'.repeat(100), results: [ok] })).ok).toBe(true);
  });

  it('soundEffects setting defaults on, validates, and persists', async () => {
    const { call, area } = setup();
    expect((await call<{ soundEffects: boolean }>({ type: 'getSettings' })).data?.soundEffects).toBe(true);
    expect((await call({ type: 'setSettings', settings: { soundEffects: 'no' } })).ok).toBe(false);
    await call({ type: 'setSettings', settings: { soundEffects: false } });
    expect((area.data.get(SETTINGS_KEY) as { soundEffects: boolean }).soundEffects).toBe(false);
    expect((await call<{ soundEffects: boolean }>({ type: 'getSettings' })).data?.soundEffects).toBe(false);
    area.data.set(SETTINGS_KEY, { soundEffects: 7 });
    expect((await call<{ soundEffects: boolean }>({ type: 'getSettings' })).data?.soundEffects).toBe(true);
  });

  it('only extension pages may send the practice messages', () => {
    const origin = 'chrome-extension://abc/';
    const page = { id: 'abc', url: `${origin}sidepanel.html` };
    const content = { id: 'abc', url: 'https://labs.google/lll/en/experiments/tiny-lesson', tab: {} };
    for (const type of ['getPracticeCards', 'recordPractice']) {
      expect(isAllowed(type, page, 'abc', origin, false)).toBe(true);
      expect(isAllowed(type, content, 'abc', origin, false)).toBe(false);
      expect(isAllowed(type, content, 'abc', origin, true)).toBe(false);
    }
  });
});
