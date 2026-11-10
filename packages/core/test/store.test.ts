import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  CorruptDataError, InvalidDataError, JsonFileStore, MemoryStore, defaultDataPath, emptyState,
} from '../src/index.js';

let dir: string;
let file: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'langcoach-'));
  file = join(dir, 'data.json');
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('JsonFileStore', () => {
  test('missing file loads emptyState and does not create file', async () => {
    const s = await new JsonFileStore(file).load();
    expect(s).toEqual(emptyState());
    expect(existsSync(file)).toBe(false);
  });

  test('save then load round-trips, including "東京" and "مرحبا"', async () => {
    const store = new JsonFileStore(join(dir, 'nested', 'data.json'));
    const s = emptyState();
    s.lessons.push({
      id: 'l1', kind: 'tiny_lesson', situation: '東京 مرحبا',
      items: [{ term: '東京', translation: 'Tokyo', example: 'مرحبا' }],
      createdAt: '2026-10-20T00:00:00.000Z',
    });
    await store.save(s);
    expect(await store.load()).toEqual(s);
  });

  test('save is atomic: no data.json.tmp left behind', async () => {
    const store = new JsonFileStore(file);
    await store.save(emptyState());
    expect(existsSync(file + '.tmp')).toBe(false);
    expect(readdirSync(dir)).toEqual(['data.json']);
  });

  test('corrupt JSON throws CorruptDataError and preserves original bytes', async () => {
    writeFileSync(file, '{ not json');
    const err = await new JsonFileStore(file).load().catch((e) => e);
    expect(err).toBeInstanceOf(CorruptDataError);
    expect(readFileSync(err.preservedAt, 'utf8')).toBe('{ not json');
    expect(readdirSync(dir).some((f) => /^data\.corrupt-.*\.json$/.test(f))).toBe(true);
  });

  test('wrong version (version: 2) throws InvalidDataError', async () => {
    writeFileSync(file, JSON.stringify({ ...emptyState(), version: 2 }));
    await expect(new JsonFileStore(file).load()).rejects.toBeInstanceOf(InvalidDataError);
  });

  test('backup() copies data.json to data.backup-*.json; null when no file', async () => {
    const store = new JsonFileStore(file);
    expect(await store.backup()).toBeNull();
    await store.save(emptyState());
    const p = await store.backup();
    expect(p).toMatch(/data\.backup-.*\.json$/);
    expect(readFileSync(p!, 'utf8')).toBe(readFileSync(file, 'utf8'));
  });
});

describe('MemoryStore', () => {
  test('round-trips and backup returns null', async () => {
    const m = new MemoryStore();
    const s = emptyState();
    s.log.push({ at: 'x', date: '2026-10-20', taskId: 't', type: 'quiz', xp: 5 });
    await m.save(s);
    expect(await m.load()).toEqual(s);
    expect(await m.backup()).toBeNull();
  });
});

describe('defaultDataPath', () => {
  test('uses LANGCOACH_HOME when set, else ~/.langcoach/data.json', () => {
    expect(defaultDataPath({ LANGCOACH_HOME: dir })).toBe(join(dir, 'data.json'));
    expect(defaultDataPath({})).toBe(join(homedir(), '.langcoach', 'data.json'));
  });
});
