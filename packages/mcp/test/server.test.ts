import { describe, expect, test } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Coach, MemoryStore } from '@langcoach/core';
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

async function setup() {
  const coach = new Coach(
    new MemoryStore(),
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
  test('lists exactly the 10 tools and the "tutor" prompt', async () => {
    const { client } = await setup();
    const tools = (await client.listTools()).tools.map((t) => t.name).sort();
    expect(tools).toEqual(
      [
        'complete_task',
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
    const main = today.tasks.find((t: { type: string }) => t.type === 'slang_hang');
    expect(main).toBeDefined();
    const saved = JSON.parse(
      (
        await call('save_lesson', {
          kind: 'slang_hang',
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
});
