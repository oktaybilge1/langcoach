import { describe, expect, test } from 'vitest';
import { Coach } from '../src/coach.js';
import { InvalidDataError } from '../src/errors.js';
import { parseState } from '../src/schema.js';
import { MemoryStore } from '../src/store.js';
import { emptyState } from '../src/types.js';

const lesson = (externalId?: string) => ({
  kind: 'tiny_lesson' as const,
  situation: 'cafe',
  items: [{ term: 'uno', translation: 'one', example: '' }],
  ...(externalId === undefined ? {} : { externalId }),
});

function make() {
  let n = 0;
  return new Coach(new MemoryStore(), () => new Date(2026, 9, 22, 10, 0), () => `id${++n}`);
}

describe('Lesson.externalId idempotency', () => {
  test('stores externalId; resending the same id returns the existing lesson and changes nothing', async () => {
    const coach = make();
    const first = await coach.saveLesson(lesson('lll-1'));
    expect(first.lesson.externalId).toBe('lll-1');
    expect(first.alreadyImported).toBeUndefined();
    const before = JSON.stringify(await coach.exportData());
    const again = await coach.saveLesson({ ...lesson('lll-1'), situation: 'different' });
    expect(again.alreadyImported).toBe(true);
    expect(again.lesson.id).toBe(first.lesson.id);
    expect(again.newCards).toBe(0);
    expect(JSON.stringify(await coach.exportData())).toBe(before);
  });

  test('lessons without externalId are never deduplicated', async () => {
    const coach = make();
    await coach.saveLesson(lesson());
    await coach.saveLesson(lesson());
    expect((await coach.exportData()).lessons).toHaveLength(2);
  });

  test('externalId must be a non-empty string of at most 100 characters', async () => {
    const coach = make();
    await expect(coach.saveLesson(lesson(''))).rejects.toThrow(InvalidDataError);
    await expect(coach.saveLesson(lesson('x'.repeat(101)))).rejects.toThrow(/100/);
    await expect(coach.saveLesson({ ...lesson(), externalId: 5 as never })).rejects.toThrow(InvalidDataError);
    expect((await coach.saveLesson(lesson('x'.repeat(100)))).lesson.externalId).toHaveLength(100);
  });

  test('schema keeps externalId and rejects a non-string or over-long one', () => {
    const base = { id: 'L', kind: 'tiny_lesson', situation: 's', items: [], createdAt: '2026-10-22T00:00:00.000Z' };
    const ok = parseState({ ...emptyState(), lessons: [{ ...base, externalId: 'e1' }] });
    expect(ok.lessons[0]!.externalId).toBe('e1');
    expect(() => parseState({ ...emptyState(), lessons: [{ ...base, externalId: 1 }] })).toThrow(InvalidDataError);
    expect(() => parseState({ ...emptyState(), lessons: [{ ...base, externalId: 'x'.repeat(101) }] })).toThrow(
      InvalidDataError,
    );
  });

  test('origin is stored when given and kept by the schema', async () => {
    const coach = make();
    const r = await coach.saveLesson({ ...lesson('o1'), origin: 'bridge' });
    expect(r.lesson.origin).toBe('bridge');
    expect((await coach.saveLesson(lesson())).lesson.origin).toBeUndefined();
    await expect(coach.saveLesson({ ...lesson(), origin: 7 as never })).rejects.toThrow(InvalidDataError);
    const base = { id: 'L', kind: 'tiny_lesson', situation: 's', items: [], createdAt: '2026-10-22T00:00:00.000Z' };
    expect(parseState({ ...emptyState(), lessons: [{ ...base, origin: 'bridge' }] }).lessons[0]!.origin).toBe('bridge');
    expect(() => parseState({ ...emptyState(), lessons: [{ ...base, origin: 1 }] })).toThrow(InvalidDataError);
  });
});
