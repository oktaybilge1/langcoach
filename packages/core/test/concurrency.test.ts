import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { existsSync, mkdtempSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Coach, JsonFileStore, MemoryStore, type Store } from '../src/index.js';

const PROFILE = {
  nativeLanguage: 'English',
  targetLanguage: 'Spanish',
  level: 'A2' as const,
  goal: 'travel',
  minutesPerDay: 20,
  daysPerWeek: 3,
};

const lesson = (term: string) => ({
  kind: 'tiny_lesson' as const,
  situation: 'cafe',
  items: [{ term, translation: 'tr', example: '' }],
});

let dir: string;
let file: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'langcoach-race-'));
  file = join(dir, 'data.json');
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const leftovers = () => readdirSync(dir).filter((f) => f.endsWith('.tmp') || f.endsWith('.lock'));

describe('concurrent writes', () => {
  test('JsonFileStore: 40 concurrent saveLesson across two Coach instances lose nothing', async () => {
    const a = new Coach(new JsonFileStore(file));
    const b = new Coach(new JsonFileStore(file));
    await a.setProfile(PROFILE);
    const results = await Promise.allSettled(
      Array.from({ length: 40 }, (_, i) => (i % 2 ? a : b).saveLesson(lesson(`term-${i}`))),
    );
    expect(results.filter((r) => r.status === 'rejected')).toEqual([]);
    const s = await a.exportData();
    expect(s.lessons).toHaveLength(40);
    expect(s.cards).toHaveLength(40);
    expect(new Set(s.cards.map((c) => c.term)).size).toBe(40);
    expect(leftovers()).toEqual([]);
  });

  test('MemoryStore: parallel saveLesson calls on one Coach lose nothing', async () => {
    const coach = new Coach(new MemoryStore());
    await coach.setProfile(PROFILE);
    await Promise.all(Array.from({ length: 40 }, (_, i) => coach.saveLesson(lesson(`term-${i}`))));
    const s = await coach.exportData();
    expect(s.lessons).toHaveLength(40);
    expect(s.cards).toHaveLength(40);
  });

  test('MemoryStore.transaction serializes and only saves when state is returned', async () => {
    const store: Store = new MemoryStore();
    const r = await store.transaction(() => ({ result: 42 }));
    expect(r).toBe(42);
    await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        store.transaction(async (s) => {
          await new Promise((res) => setTimeout(res, 1));
          s.log.push({ at: 'x', date: '2026-10-20', taskId: `t${i}`, type: 'quiz', xp: 1 });
          return { state: s, result: undefined };
        }),
      ),
    );
    expect((await store.load()).log).toHaveLength(10);
  });
});

describe('JsonFileStore lock file', () => {
  test('a stale lock (older than 10s) is cleared', async () => {
    const lock = `${file}.lock`;
    const old = Date.now() - 60_000;
    writeFileSync(lock, JSON.stringify({ pid: 999999, at: old }));
    utimesSync(lock, old / 1000, old / 1000);
    const store = new JsonFileStore(file);
    const started = Date.now();
    await store.transaction((s) => ({ state: s, result: null }));
    expect(Date.now() - started).toBeLessThan(2000);
    expect(existsSync(file)).toBe(true);
    expect(leftovers()).toEqual([]);
  });

  test('a fresh lock held by someone else makes a transaction wait, then succeed', async () => {
    const lock = `${file}.lock`;
    writeFileSync(lock, JSON.stringify({ pid: 999999, at: Date.now() }));
    const store = new JsonFileStore(file);
    let done = false;
    const tx = store
      .transaction((s) => {
        s.lessons = [];
        return { state: s, result: 'ok' };
      })
      .then((r) => {
        done = true;
        return r;
      });
    await new Promise((res) => setTimeout(res, 300));
    expect(done).toBe(false);
    expect(existsSync(file)).toBe(false);
    rmSync(lock);
    expect(await tx).toBe('ok');
    expect(existsSync(file)).toBe(true);
    expect(leftovers()).toEqual([]);
  });

  test('a lock that is never released times out with a clear error', async () => {
    writeFileSync(`${file}.lock`, JSON.stringify({ pid: 999999, at: Date.now() }));
    const store = new JsonFileStore(file, { lockTimeoutMs: 300 });
    await expect(store.transaction((s) => ({ state: s, result: null }))).rejects.toThrow(
      /LangCoach data file is busy, try again/,
    );
    expect(existsSync(file)).toBe(false);
  });

  test('a throwing transaction releases the lock and writes nothing', async () => {
    const store = new JsonFileStore(file);
    await expect(
      store.transaction(() => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(readdirSync(dir)).toEqual([]);
    await store.transaction((s) => ({ state: s, result: null }));
    expect(readdirSync(dir)).toEqual(['data.json']);
  });
});
