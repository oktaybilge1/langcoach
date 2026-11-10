import { CorruptDataError, InvalidDataError, emptyState } from '@langcoach/core/browser';
import { describe, expect, it } from 'vitest';
import { ChromeStorageStore } from '../src/background/store';
import { fakeArea } from './chrome-fake';

const profile = {
  nativeLanguage: 'English',
  targetLanguage: 'Spanish',
  level: 'A1' as const,
  goal: 'travel',
  minutesPerDay: 15,
  daysPerWeek: 5,
  createdAt: '2026-01-01T00:00:00.000Z',
};

describe('ChromeStorageStore', () => {
  it('loads emptyState when nothing is stored', async () => {
    const store = new ChromeStorageStore(fakeArea());
    expect(await store.load()).toEqual(emptyState());
  });

  it('round-trips a saved state under langcoach:state', async () => {
    const area = fakeArea();
    const store = new ChromeStorageStore(area);
    const s = { ...emptyState(), profile };
    await store.save(s);
    expect(typeof area.data.get('langcoach:state')).toBe('string');
    expect(await store.load()).toEqual(s);
  });

  it('refuses to save an invalid state', async () => {
    const area = fakeArea();
    const store = new ChromeStorageStore(area);
    await expect(store.save({ version: 2 } as never)).rejects.toBeInstanceOf(InvalidDataError);
    expect(area.data.has('langcoach:state')).toBe(false);
  });

  it('applies 20 concurrent transactions', async () => {
    const store = new ChromeStorageStore(fakeArea());
    await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        store.transaction((s) => {
          s.log.push({ at: '2026-01-01T00:00:00.000Z', date: '2026-01-01', taskId: `t${i}`, type: 'review', xp: 1 });
          return { state: s, result: i };
        }),
      ),
    );
    expect((await store.load()).log).toHaveLength(20);
  });

  it('transaction without state saves nothing', async () => {
    const area = fakeArea();
    const store = new ChromeStorageStore(area);
    expect(await store.transaction(() => ({ result: 'x' }))).toBe('x');
    expect(area.data.has('langcoach:state')).toBe(false);
  });

  it('preserves corrupt JSON and throws CorruptDataError', async () => {
    const area = fakeArea();
    area.data.set('langcoach:state', '{not json');
    const store = new ChromeStorageStore(area);
    const err = await store.load().catch((e) => e);
    expect(err).toBeInstanceOf(CorruptDataError);
    expect(err.preservedAt).toMatch(/^langcoach:corrupt:/);
    expect(area.data.get(err.preservedAt)).toBe('{not json');
  });

  it('preserves identical corrupt bytes only once', async () => {
    const area = fakeArea();
    area.data.set('langcoach:state', '{not json');
    const store = new ChromeStorageStore(area);
    const a = await store.load().catch((e) => e);
    const b = await store.load().catch((e) => e);
    expect(b.preservedAt).toBe(a.preservedAt);
    expect([...area.data.keys()].filter((k) => k.startsWith('langcoach:corrupt:'))).toHaveLength(1);
    area.data.set('langcoach:state', '{different');
    const c = await store.load().catch((e) => e);
    expect(c.preservedAt).not.toBe(a.preservedAt);
  });

  it('structurally invalid data throws InvalidDataError', async () => {
    const area = fakeArea();
    area.data.set('langcoach:state', JSON.stringify({ version: 9 }));
    await expect(new ChromeStorageStore(area).load()).rejects.toBeInstanceOf(InvalidDataError);
  });

  it('backup returns null when empty and keeps only the 3 newest', async () => {
    const area = fakeArea();
    const store = new ChromeStorageStore(area);
    expect(await store.backup()).toBeNull();
    await store.save({ ...emptyState(), profile });
    const keys: string[] = [];
    for (let i = 0; i < 8; i++) {
      const k = await store.backup();
      expect(k).toMatch(/^langcoach:backup:/);
      keys.push(k as string);
    }
    const remaining = [...area.data.keys()].filter((k) => k.startsWith('langcoach:backup:'));
    expect(remaining).toHaveLength(3);
    for (const k of keys.slice(-3)) expect(remaining).toContain(k);
  });

  it('replace backs up raw (even corrupt) data then saves', async () => {
    const area = fakeArea();
    area.data.set('langcoach:state', '{broken');
    const store = new ChromeStorageStore(area);
    const next = { ...emptyState(), profile };
    const backupKey = await store.replace(next);
    expect(area.data.get(backupKey as string)).toBe('{broken');
    expect(await store.load()).toEqual(next);
  });

  it('replace rejects invalid input without touching storage', async () => {
    const area = fakeArea();
    area.data.set('langcoach:state', '{broken');
    const store = new ChromeStorageStore(area);
    await expect(store.replace({ version: 3 } as never)).rejects.toBeInstanceOf(InvalidDataError);
    expect(area.data.get('langcoach:state')).toBe('{broken');
    expect([...area.data.keys()]).toEqual(['langcoach:state']);
  });
});
