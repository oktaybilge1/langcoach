import { describe, expect, test } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Coach, JsonFileStore, MemoryStore, emptyState, type Store } from '@langcoach/core';
import { createServer } from '../src/server.js';
import { TUTOR_PROMPT } from '../src/prompt.js';

const PROFILE = {
  nativeLanguage: 'English',
  targetLanguage: 'Polish',
  level: 'A2',
  goal: 'Chat with neighbours',
  minutesPerDay: 15,
  daysPerWeek: 7,
};

async function setup(store: Store = new MemoryStore()) {
  const coach = new Coach(
    store,
    () => new Date(2026, 9, 20, 10, 0),
  );
  const server = createServer(coach);
  const client = new Client({ name: 'test', version: '0.0.0' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), client.connect(b)]);
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const res = (await client.callTool({ name, arguments: args })) as {
      isError?: boolean;
      content: { type: string; text: string }[];
    };
    return { isError: res.isError === true, text: res.content[0]!.text };
  };
  return { client, call };
}

describe('langcoach MCP server', () => {
  test('lists exactly the 11 tools and the "tutor" prompt', async () => {
    const { client } = await setup();
    const tools = (await client.listTools()).tools.map((t) => t.name).sort();
    expect(tools).toEqual(
      [
        'complete_task',
        'export_cards',
        'export_data',
        'get_due_reviews',
        'get_progress',
        'get_today',
        'get_weekly_plan',
        'import_data',
        'save_lesson',
        'set_profile',
        'submit_review',
      ].sort(),
    );
    const prompts = (await client.listPrompts()).prompts;
    expect(prompts.map((p) => p.name)).toEqual(['tutor']);
    const got = await client.getPrompt({ name: 'tutor' });
    const m = got.messages[0]!;
    expect(m.content.type === 'text' && m.content.text).toBe(TUTOR_PROMPT);
  });

  test('export_cards returns filename, count and text in each format', async () => {
    const { call } = await setup();
    await call('set_profile', PROFILE);
    await call('save_lesson', {
      kind: 'tiny_lesson',
      situation: 'Ordering coffee',
      items: [{ term: 'kawa', translation: 'coffee', example: 'Poprosze kawe.' }],
    });
    const anki = JSON.parse((await call('export_cards', { format: 'anki' })).text);
    expect(anki.count).toBe(1);
    expect(anki.filename).toMatch(/^langcoach-anki-\d{4}-\d{2}-\d{2}\.txt$/);
    expect(anki.text).toContain('#separator:tab');
    expect(anki.text).toContain('kawa');
    const quizlet = JSON.parse((await call('export_cards', { format: 'quizlet' })).text);
    expect(quizlet.text).toBe('kawa\tcoffee\n');
    const csv = JSON.parse((await call('export_cards', { format: 'csv', includeMastered: false })).text);
    expect(csv.filename).toMatch(/^langcoach-cards-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(csv.text.split('\r\n')[0]).toMatch(/^.term,translation/u);
    expect(csv.text.charCodeAt(0)).toBe(0xfeff);
  });

  test('export_cards rejects unknown formats and describes how to save and import', async () => {
    const { client, call } = await setup();
    expect((await call('export_cards', { format: 'pdf' })).isError).toBe(true);
    const tool = (await client.listTools()).tools.find((t) => t.name === 'export_cards')!;
    expect(tool.description).toMatch(/save/i);
    expect(tool.description).toMatch(/Anki/);
    expect(tool.description).toMatch(/File > Import/);
  });

  test('export_cards over 2 MB -> isError suggesting a smaller export', async () => {
    const store = new MemoryStore();
    const big = 'x'.repeat(5000);
    const cards = Array.from({ length: 500 }, (_, i) => ({
      id: `c${i}`,
      lessonId: 'L',
      term: `t${i}`,
      translation: big,
      example: '',
      srs: { due: '2026-10-21T00:00:00.000Z', stability: 0, difficulty: 0, elapsed_days: 0, scheduled_days: 0, learning_steps: 0, reps: 0, lapses: 0, state: 0 },
    }));
    await store.replace({ ...emptyState(), cards } as never);
    const { call } = await setup(store);
    const r = await call('export_cards', { format: 'csv' });
    expect(r.isError).toBe(true);
    expect(r.text).toMatch(/2 MB/);
    expect(r.text).toMatch(/includeMastered|smaller/);
  });

  test('export_cards cap is measured on the JSON reply, not the raw text', async () => {
    const store = new MemoryStore();
    const srs = { due: '2026-10-21T00:00:00.000Z', stability: 0, difficulty: 0, elapsed_days: 0, scheduled_days: 0, learning_steps: 0, reps: 0, lapses: 0, state: 0 };
    // ~2.0 MB of CSV text that doubles when JSON-escaped.
    const cards = [{ id: 'c', lessonId: 'L', term: 't', translation: '"'.repeat(500_000), example: '', srs }];
    await store.replace({ ...emptyState(), cards } as never);
    const { call } = await setup(store);
    const r = await call('export_cards', { format: 'anki' });
    expect(r.isError).toBe(true);
    expect(r.text).toMatch(/2 MB/);
    expect(r.text).toMatch(/Export button/);
    expect(r.text).not.toMatch(/in parts/);
  });

  test('get_today before set_profile -> isError, mentions set_profile', async () => {
    const { call } = await setup();
    const r = await call('get_today');
    expect(r.isError).toBe(true);
    expect(r.text).toContain('set_profile');
  });

  test('full flow reaches totalXp 20', async () => {
    const { call } = await setup();
    expect((await call('set_profile', PROFILE)).isError).toBe(false);
    const plan = JSON.parse((await call('get_weekly_plan', { theme: 'Cafe' })).text);
    expect(plan.tasks.length).toBeGreaterThan(0);
    const today = JSON.parse((await call('get_today')).text);
    // The plan is created on Tuesday, so Tuesday is its first study day: a tiny_lesson.
    const main = today.tasks.find((t: { type: string }) => t.type === 'tiny_lesson');
    expect(main).toBeDefined();
    const saved = JSON.parse(
      (
        await call('save_lesson', {
          kind: 'tiny_lesson',
          situation: 'Ordering coffee',
          items: [{ term: 'kawa', translation: 'coffee', example: 'Poprosze kawe.' }],
        })
      ).text,
    );
    const done = await call('complete_task', { taskId: main.id, lessonId: saved.lesson.id });
    expect(done.isError).toBe(false);
    const progress = JSON.parse((await call('get_progress')).text);
    expect(progress.totalXp).toBe(20);
  });

  test('save_lesson accepts word_cam with pronunciation', async () => {
    const { call } = await setup();
    const r = await call('save_lesson', {
      kind: 'word_cam',
      situation: 'Kitchen',
      items: [{ term: 'kawa', translation: 'coffee', example: '', pronunciation: 'KA-va' }],
    });
    expect(r.isError).toBe(false);
    expect(JSON.parse(r.text).lesson.kind).toBe('word_cam');
  });

  test('submit_review with rating 5 is rejected and the server keeps working', async () => {
    const { client, call } = await setup();
    let rejected = false;
    try {
      const res = (await client.callTool({
        name: 'submit_review',
        arguments: { cardId: 'x', rating: 5 },
      })) as { isError?: boolean };
      rejected = res.isError === true;
    } catch {
      rejected = true;
    }
    expect(rejected).toBe(true);
    expect((await call('get_progress')).isError).toBe(false);
  });

  test('import_data with "not json" -> isError and state unchanged', async () => {
    const { call } = await setup();
    await call('set_profile', PROFILE);
    const before = (await call('export_data')).text;
    const r = await call('import_data', { json: 'not json' });
    expect(r.isError).toBe(true);
    expect(r.text.toLowerCase()).toContain('invalid json');
    expect((await call('export_data')).text).toBe(before);
  });

  test('corrupt data file: error names the preserved copy once and explains recovery', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'langcoach-mcp-'));
    try {
      writeFileSync(join(dir, 'data.json'), '{ broken');
      const { call } = await setup(new JsonFileStore(join(dir, 'data.json')));
      const r = await call('get_progress');
      expect(r.isError).toBe(true);
      const paths = r.text.match(/data\.corrupt-[^\s)]+?\.json/g) ?? [];
      expect(paths).toHaveLength(1);
      expect(r.text).toContain('import_data');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('reports the package.json version as serverInfo.version', async () => {
    const { client } = await setup();
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    expect(client.getServerVersion()).toMatchObject({ name: 'langcoach', version: pkg.version });
  });

  test('set_profile description explains which tools work without a profile and when changes apply', async () => {
    const { client } = await setup();
    const tool = (await client.listTools()).tools.find((t) => t.name === 'set_profile')!;
    for (const name of ['export_data', 'import_data', 'get_progress']) expect(tool.description).toContain(name);
    expect(tool.description).toMatch(/next week/i);
  });
});
