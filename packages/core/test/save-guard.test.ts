import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Coach } from '../src/coach.js';
import { InvalidDataError } from '../src/errors.js';
import { JsonFileStore, MemoryStore } from '../src/store.js';
import { emptyState, type State } from '../src/types.js';

const lesson = (extra: Record<string, unknown>) => ({
  kind: 'word_cam' as const,
  situation: 's',
  items: [{ term: 'a', translation: 't', example: '' }],
  ...extra,
});
const bad = (): State => ({ ...emptyState(), cards: [{ id: 1 } as never] });

describe('saveLesson grammar/source validation', () => {
  const cases: Array<[string, Record<string, unknown>]> = [
    ['grammar:[1]', { grammar: [1] }],
    ['grammar:[{topic:1}]', { grammar: [{ topic: 1 }] }],
    ['grammar bad example', { grammar: [{ topic: 't', description: 'd', examples: [{ sentence: 's' }] }] }],
    ['source:{app:x}', { source: { app: 'x' } }],
    ['source missing langs', { source: { app: 'lll' } }],
  ];
  for (const [name, extra] of cases) {
    test(`${name} -> InvalidDataError, state unchanged`, async () => {
      const coach = new Coach(new MemoryStore());
      const before = await coach.exportData();
      await expect(coach.saveLesson(lesson(extra) as never)).rejects.toBeInstanceOf(InvalidDataError);
      expect(await coach.exportData()).toEqual(before);
    });
  }
  test('valid grammar/source accepted', async () => {
    const coach = new Coach(new MemoryStore());
    const r = await coach.saveLesson(
      lesson({
        grammar: [{ topic: 't', description: 'd', examples: [{ sentence: 's', translation: 'x', transliteration: 'y', explanation: 'z' }] }],
        source: { app: 'lll', targetLanguage: 'es', sourceLanguage: 'en', purpose: 'p' },
      }) as never,
    );
    expect(r.newCards).toBe(1);
  });
  test('updateCard(id, undefined) -> InvalidDataError', async () => {
    const coach = new Coach(new MemoryStore());
    await expect(coach.updateCard('x', undefined as never)).rejects.toBeInstanceOf(InvalidDataError);
  });
});

describe('Store.save guard', () => {
  test('MemoryStore rejects invalid state and keeps previous', async () => {
    const store = new MemoryStore();
    const good = { ...emptyState(), log: [{ at: new Date().toISOString(), date: '2026-10-20', taskId: 'x', type: 'review' as const, xp: 1 }] };
    await store.save(good);
    await expect(store.save(bad())).rejects.toBeInstanceOf(InvalidDataError);
    await expect(store.replace(bad())).rejects.toBeInstanceOf(InvalidDataError);
    expect(await store.load()).toEqual(good);
  });
  describe('JsonFileStore', () => {
    let dir: string;
    beforeEach(() => void (dir = mkdtempSync(join(tmpdir(), 'lc-guard-'))));
    afterEach(() => rmSync(dir, { recursive: true, force: true }));
    test('invalid save writes nothing, leaves no tmp/lock', async () => {
      const p = join(dir, 'data.json');
      const store = new JsonFileStore(p);
      await store.save(emptyState());
      const bytes = readFileSync(p);
      const names = readdirSync(dir).sort();
      await expect(store.save(bad())).rejects.toBeInstanceOf(InvalidDataError);
      await expect(store.replace(bad())).rejects.toBeInstanceOf(InvalidDataError);
      expect(readFileSync(p).equals(bytes)).toBe(true);
      expect(readdirSync(dir).sort()).toEqual(names);
      await store.save(emptyState()); // lock released
    });
  });
});
