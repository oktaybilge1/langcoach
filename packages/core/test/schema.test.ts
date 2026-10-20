import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { InvalidDataError, JsonFileStore, newSrs, parseState, type State } from '../src/index.js';

const NOW = new Date('2026-10-20T08:00:00.000Z');

/** A full state as a future LangCoach version might write it, with unknown keys sprinkled in. */
function fixture(): Record<string, unknown> {
  return {
    version: 1,
    futureRoot: { anything: [1, 2, 3] },
    profile: {
      nativeLanguage: 'English',
      targetLanguage: 'Polish',
      level: 'B1',
      goal: 'work',
      minutesPerDay: 20,
      daysPerWeek: 3,
      createdAt: '2026-10-19T08:00:00.000Z',
      futureProfile: 'keep me',
    },
    plans: {
      '2026-W43': {
        week: '2026-W43',
        theme: 'Food',
        futurePlan: true,
        tasks: [
          { id: 't1', date: '2026-10-19', type: 'tiny_lesson', minutes: 20, status: 'done', completedAt: '2026-10-19T09:00:00.000Z', lessonId: 'l1', futureTask: 7 },
          { id: 't2', date: '2026-10-21', type: 'review', minutes: 6, status: 'todo' },
          { id: 't3', date: '2026-10-21', type: 'quiz', minutes: 14, status: 'todo' },
        ],
      },
    },
    lessons: [
      {
        id: 'l1',
        kind: 'tiny_lesson',
        situation: 'cafe',
        createdAt: '2026-10-19T08:30:00.000Z',
        futureLesson: 'x',
        items: [{ term: 'kawa', translation: 'coffee', example: 'Poproszę kawę.', note: 'feminine', futureItem: { audio: 'kawa.mp3' } }],
      },
    ],
    cards: [
      {
        id: 'c1',
        lessonId: 'l1',
        term: 'kawa',
        translation: 'coffee',
        example: 'Poproszę kawę.',
        futureCard: ['tag'],
        srs: { ...newSrs(NOW), futureSrs: 1 },
      },
    ],
    log: [{ at: '2026-10-19T09:00:00.000Z', date: '2026-10-19', taskId: 't1', type: 'tiny_lesson', xp: 10, futureLog: 'y' }],
  };
}

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'langcoach-schema-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('schema keeps data it does not know about', () => {
  test('parseState keeps unknown keys at every level', () => {
    expect(parseState(fixture())).toEqual(fixture());
  });

  test('full fixture with unknown fields survives load → save → load', async () => {
    const store = new JsonFileStore(join(dir, 'data.json'));
    await store.save(parseState(fixture()) as State);
    const loaded = await store.load();
    await store.save(loaded);
    expect(await store.load()).toEqual(fixture());
  });
});

describe('schema rejects out-of-range data', () => {
  const withProfile = (over: Record<string, unknown>) => {
    const f = fixture();
    f.profile = { ...(f.profile as object), ...over };
    return f;
  };

  test.each([
    ['daysPerWeek 9', withProfile({ daysPerWeek: 9 })],
    ['daysPerWeek 2.5', withProfile({ daysPerWeek: 2.5 })],
    ['minutesPerDay 2', withProfile({ minutesPerDay: 2 })],
    ['minutesPerDay 500', withProfile({ minutesPerDay: 500 })],
    ['level Z9', withProfile({ level: 'Z9' })],
  ])('profile %s', (_, raw) => {
    expect(() => parseState(raw)).toThrow(InvalidDataError);
  });

  test('srs.due "x" is rejected', () => {
    const f = fixture();
    (f.cards as { srs: { due: string } }[])[0]!.srs.due = 'x';
    expect(() => parseState(f)).toThrow(InvalidDataError);
  });

  test('task minutes 0 is rejected', () => {
    const f = fixture();
    (f.plans as Record<string, { tasks: { minutes: number }[] }>)['2026-W43']!.tasks[0]!.minutes = 0;
    expect(() => parseState(f)).toThrow(InvalidDataError);
  });

  test('negative xp is rejected', () => {
    const f = fixture();
    (f.log as { xp: number }[])[0]!.xp = -5;
    expect(() => parseState(f)).toThrow(InvalidDataError);
  });
});
