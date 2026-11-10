import { describe, expect, test } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Coach, MemoryStore } from '@langcoach/core';
import { createServer } from '../src/server.js';
import { openInBrowser } from '../src/dashboard/open.js';

async function setup(openFile: (f: string) => Promise<boolean>) {
  const dir = mkdtempSync(join(tmpdir(), 'lc-dash-'));
  const coach = new Coach(new MemoryStore(), () => new Date(2026, 9, 20, 10, 0));
  await coach.setProfile({
    nativeLanguage: 'English', targetLanguage: 'Polish', level: 'A2', goal: 'x', minutesPerDay: 15, daysPerWeek: 7,
  });
  const server = createServer(coach, { dataDir: dir, openFile });
  const client = new Client({ name: 'test', version: '0.0.0' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), client.connect(b)]);
  return { dir, client, done: () => rmSync(dir, { recursive: true, force: true }) };
}
const call = async (client: Client) =>
  (await client.callTool({ name: 'open_dashboard', arguments: {} })) as { isError?: boolean; content: { text: string }[] };

describe('open_dashboard', () => {
  test('is listed', async () => {
    const t = await setup(async () => true);
    expect((await t.client.listTools()).tools.length).toBe(15);
    expect((await t.client.listTools()).tools.some((x) => x.name === 'open_dashboard')).toBe(true);
    t.done();
  });

  test('writes the file, opens it and returns no absolute path', async () => {
    const opened: string[] = [];
    const t = await setup(async (f) => (opened.push(f), true));
    writeFileSync(join(t.dir, 'bridge-token'), 'SECRET-TOKEN-123');
    const res = await call(t.client);
    const out = JSON.parse(res.content[0]!.text);
    expect(out.opened).toBe(true);
    expect(out.file).toBe('dashboard.html in your LangCoach data folder');
    expect(Object.keys(out.summary).sort()).toEqual(['dueCards', 'streak', 'words', 'xpToday']);
    expect(res.content[0]!.text).not.toContain(t.dir);
    expect(opened).toEqual([join(t.dir, 'dashboard.html')]);
    const html = readFileSync(join(t.dir, 'dashboard.html'), 'utf8');
    expect(html).toContain('<!doctype html>'.slice(0, 9));
    expect(html).not.toContain('SECRET-TOKEN-123');
    t.done();
  });

  test('open failure still returns file', async () => {
    const t = await setup(async () => false);
    const res = await call(t.client);
    expect(res.isError).toBeFalsy();
    const out = JSON.parse(res.content[0]!.text);
    expect(out.opened).toBe(false);
    expect(res.content[0]!.text).toContain('dashboard.html');
    expect(existsSync(join(t.dir, 'dashboard.html'))).toBe(true);
    expect(out.path).toBe(join(t.dir, 'dashboard.html'));
    t.done();
  });
});

describe('open_dashboard without a data folder', () => {
  test('creates the folder', async () => {
    const t = await setup(async () => true);
    const nested = join(t.dir, 'a', 'b');
    const coach = new Coach(new MemoryStore());
    const server = createServer(coach, { dataDir: nested, openFile: async () => true });
    const client = new Client({ name: 't', version: '0' });
    const [x, y] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(x), client.connect(y)]);
    const res = await call(client);
    expect(res.isError).toBeFalsy();
    expect(existsSync(join(nested, 'dashboard.html'))).toBe(true);
    t.done();
  });
});

describe('openInBrowser', () => {
  const fake = (fail: boolean) => {
    const calls: unknown[][] = [];
    const fn = ((...a: unknown[]) => {
      calls.push(a);
      const h: Record<string, (() => void) | undefined> = {};
      const child = { on: (e: string, cb: () => void) => ((h[e] = cb), child), unref: () => undefined };
      queueMicrotask(() => (fail ? h.error?.() : h.spawn?.()));
      return child;
    }) as never;
    return { fn, calls };
  };
  test('spawns detached with stdio ignored and resolves true', async () => {
    const f = fake(false);
    expect(await openInBrowser('/x/dashboard.html', f.fn)).toBe(true);
    expect((f.calls[0]![2] as { stdio: string }).stdio).toBe('ignore');
  });
  test('resolves false on spawn error', async () => {
    expect(await openInBrowser('/x/dashboard.html', fake(true).fn)).toBe(false);
  });
});
