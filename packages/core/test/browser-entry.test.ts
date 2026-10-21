import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { parseState } from '../src/schema.js';
import { xpFor } from '../src/progress.js';
import { emptyState } from '../src/types.js';
import * as browser from '../src/browser.js';
import * as node from '../src/index.js';

const srcDir = resolve(dirname(fileURLToPath(import.meta.url)), '../src');

function specifiers(file: string): string[] {
  const text = readFileSync(file, 'utf8');
  const re = /(?:^|\n)\s*(?:import|export)\s[^;]*?from\s+['"]([^'"]+)['"]|(?:^|\n)\s*import\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;
  return [...text.matchAll(re)].map((m) => (m[1] ?? m[2] ?? m[3]) as string);
}

function transitive(entry: string): Map<string, string[]> {
  const seen = new Map<string, string[]>();
  const walk = (file: string) => {
    if (seen.has(file)) return;
    const specs = specifiers(file);
    seen.set(file, specs);
    for (const s of specs) if (s.startsWith('.')) walk(resolve(dirname(file), s.replace(/\.js$/, '.ts')));
  };
  walk(entry);
  return seen;
}

describe('browser entry', () => {
  test('transitive imports contain no node: modules and no file store', () => {
    const graph = transitive(resolve(srcDir, 'browser.ts'));
    expect(graph.size).toBeGreaterThan(5);
    for (const [file, specs] of graph) {
      for (const s of specs) {
        expect(s.startsWith('node:'), `${file} imports ${s}`).toBe(false);
        expect(s, `${file} imports ${s}`).not.toBe('./store.js');
      }
    }
  });

  test('exports everything but the node-only pieces', () => {
    expect(browser.MemoryStore).toBeDefined();
    expect(browser.Coach).toBeDefined();
    expect(browser.parseState).toBe(node.parseState);
    expect('JsonFileStore' in browser).toBe(false);
    expect('defaultDataPath' in browser).toBe(false);
    expect(node.JsonFileStore).toBeDefined();
    expect(node.defaultDataPath).toBeDefined();
  });
});

describe('word_cam task type', () => {
  test('xpFor word_cam is 20', () => {
    expect(xpFor('word_cam')).toBe(20);
  });

  test('parseState accepts word_cam lesson with grammar, source and pronunciation', () => {
    const s = emptyState();
    const raw = {
      ...s,
      lessons: [
        {
          id: 'l1',
          kind: 'word_cam',
          situation: 'cafe',
          items: [{ term: 'kahve', translation: 'coffee', example: 'Kahve lutfen', pronunciation: 'kah-veh' }],
          grammar: [
            {
              topic: 'Accusative',
              description: 'object marker',
              examples: [{ sentence: 'Kahveyi ictim', translation: 'I drank the coffee', transliteration: 'x', explanation: 'y' }],
            },
          ],
          source: { app: 'lll', targetLanguage: 'tr', sourceLanguage: 'en', purpose: 'travel' },
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      cards: [
        {
          id: 'c1',
          lessonId: 'l1',
          term: 'kahve',
          translation: 'coffee',
          example: 'Kahve',
          pronunciation: 'kah-veh',
          srs: { due: '2026-01-02T00:00:00.000Z', state: 0, reps: 0, lapses: 0 },
        },
      ],
    };
    const parsed = parseState(raw);
    expect(parsed.lessons[0]!.kind).toBe('word_cam');
    expect(parsed.lessons[0]!.grammar?.[0]?.examples[0]?.sentence).toBe('Kahveyi ictim');
    expect(parsed.lessons[0]!.source?.app).toBe('lll');
    expect(parsed.cards[0]!.pronunciation).toBe('kah-veh');
  });

  test('parseState rejects malformed grammar and source', () => {
    const base = { ...emptyState() };
    const lesson = { id: 'l', kind: 'tiny_lesson', situation: 's', items: [], createdAt: 'x' };
    expect(() => parseState({ ...base, lessons: [{ ...lesson, grammar: [{ topic: 1 }] }] })).toThrow();
    expect(() => parseState({ ...base, lessons: [{ ...lesson, source: { app: 'other' } }] })).toThrow();
  });
});
