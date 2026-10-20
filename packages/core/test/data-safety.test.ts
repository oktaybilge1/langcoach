import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Coach, CorruptDataError, InvalidDataError, JsonFileStore, emptyState } from '../src/index.js';

const PROFILE = {
  nativeLanguage: 'English',
  targetLanguage: 'Turkish',
  level: 'A1' as const,
  goal: 'travel',
  minutesPerDay: 15,
  daysPerWeek: 4,
};

let dir: string;
let file: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'langcoach-safety-'));
  file = join(dir, 'data.json');
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const backups = () => readdirSync(dir).filter((f) => /^data\.backup-.*\.json$/.test(f));
const corrupts = () => readdirSync(dir).filter((f) => /^data\.corrupt-.*\.json$/.test(f));

describe('importData on a real data file', () => {
  test('creates exactly one data.backup-*.json holding the previous bytes, then saves', async () => {
    const coach = new Coach(new JsonFileStore(file));
    await coach.setProfile(PROFILE);
    const before = readFileSync(file);
    const replacement = { ...emptyState(), profile: { ...PROFILE, targetLanguage: 'Polish', createdAt: '2026-10-01T00:00:00.000Z' } };
    await coach.importData(replacement);
    expect(backups()).toHaveLength(1);
    expect(readFileSync(join(dir, backups()[0]!)).equals(before)).toBe(true);
    expect((await coach.exportData()).profile?.targetLanguage).toBe('Polish');
  });

  test('invalid importData creates no backup and leaves data.json bytes unchanged', async () => {
    const coach = new Coach(new JsonFileStore(file));
    await coach.setProfile(PROFILE);
    const before = readFileSync(file);
    await expect(coach.importData({ version: 1, profile: { level: 'Z9' } })).rejects.toBeInstanceOf(InvalidDataError);
    expect(backups()).toEqual([]);
    expect(readFileSync(file).equals(before)).toBe(true);
  });
});

describe('importData restores over a broken data file', () => {
  const valid = () => ({ ...emptyState(), profile: { ...PROFILE, createdAt: '2026-10-01T00:00:00.000Z' } });

  test.each([
    ['corrupt JSON', '{ broken'],
    ['schema-invalid JSON', JSON.stringify({ version: 1, profile: { level: 'Z9' } })],
  ])('%s: import succeeds, backup holds the old bytes, load works afterwards', async (_, bytes) => {
    writeFileSync(file, bytes);
    const store = new JsonFileStore(file);
    const coach = new Coach(store);
    expect(await coach.importData(valid())).toEqual({ lessons: 0, cards: 0 });
    expect(backups()).toHaveLength(1);
    expect(readFileSync(join(dir, backups()[0]!), 'utf8')).toBe(bytes);
    expect((await store.load()).profile?.targetLanguage).toBe('Turkish');
    expect(readdirSync(dir).filter((f) => f.endsWith('.lock') || f.endsWith('.tmp'))).toEqual([]);
  });
});

describe('corrupt data file', () => {
  test('two loads of the same corrupt file keep one corrupt copy', async () => {
    writeFileSync(file, '{ broken');
    const store = new JsonFileStore(file);
    const e1 = await store.load().catch((e) => e);
    const e2 = await store.load().catch((e) => e);
    expect(e1).toBeInstanceOf(CorruptDataError);
    expect(e2).toBeInstanceOf(CorruptDataError);
    expect(corrupts()).toHaveLength(1);
    expect(e2.preservedAt).toBe(e1.preservedAt);
    expect(readFileSync(e1.preservedAt, 'utf8')).toBe('{ broken');
  });

  test('different corrupt bytes get their own copy', async () => {
    const store = new JsonFileStore(file);
    writeFileSync(file, '{ broken');
    await store.load().catch(() => undefined);
    writeFileSync(file, '{ broken differently');
    await store.load().catch(() => undefined);
    expect(corrupts()).toHaveLength(2);
  });

  test('the error explains how to recover', async () => {
    writeFileSync(file, 'nope');
    const err = await new JsonFileStore(file).load().catch((e) => e);
    expect(err.message).toContain(err.preservedAt);
    expect(err.message).toMatch(
      /Restore with import_data from a data\.backup-\*\.json, or move data\.json aside to start fresh\./,
    );
  });
});
