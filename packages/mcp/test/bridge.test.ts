import { afterEach, describe, expect, test, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer as createNetServer, type Server as NetServer } from 'node:net';
import { Coach, MemoryStore } from '@langcoach/core';
import { createBridgeController, loadOrCreateToken, startBridge, type Bridge } from '../src/bridge.js';

const ORIGIN = 'chrome-extension://abcdefghijklmnopabcdefghijklmnop';
const TOKEN = 'ab'.repeat(32); // fake test token
const NONCE = '0123456789abcdef';
const PING = `/v1/ping?nonce=${NONCE}`;

interface Reply {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
  json: () => any;
}

function send(
  port: number,
  opts: { method?: string; path?: string; headers?: Record<string, string>; body?: string | Buffer; chunked?: boolean } = {},
): Promise<Reply> {
  const headers: Record<string, string> = {
    Host: `127.0.0.1:${port}`,
    Origin: ORIGIN,
    'X-LangCoach': '1',
    ...(opts.body !== undefined ? { 'Content-Type': 'application/json', 'X-LangCoach-Token': TOKEN } : {}),
    ...opts.headers,
  };
  for (const [k, v] of Object.entries(headers)) if (v === '') delete headers[k];
  return new Promise((resolve, reject) => {
    const req = request(
      { host: '127.0.0.1', port, method: opts.method ?? (opts.body !== undefined ? 'POST' : 'GET'), path: opts.path ?? PING, headers },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (c) => (body += c));
        res.on('end', () => resolve({ status: res.statusCode!, headers: res.headers, body, json: () => JSON.parse(body) }));
        res.on('error', reject);
      },
    );
    req.on('error', reject);
    if (opts.body !== undefined) req.end(opts.body);
    else req.end();
  });
}

const item = (term: string) => ({ term, translation: `${term}-en`, example: '' });
const lll = (id: string, terms = ['kawa']) => ({
  id,
  kind: 'tiny_lesson',
  situation: 'Ordering coffee',
  items: terms.map(item),
  source: { app: 'lll', targetLanguage: 'Polish', sourceLanguage: 'English' },
  capturedAt: '2026-10-20T09:00:00.000Z',
});
const payload = (lessons: unknown[]) => JSON.stringify({ client: { name: 'langcoach-extension', version: '0.3.0' }, lessons });

let open: Bridge[] = [];
let logs: string[] = [];
afterEach(async () => {
  await Promise.all(open.map((b) => b.close()));
  open = [];
  logs = [];
});

async function start(coach = new Coach(new MemoryStore(), () => new Date(2026, 9, 20, 10, 0)), port = 0, retryMs = 30_000) {
  const bridge = startBridge(coach, { port, version: '9.9.9', retryMs, token: () => TOKEN, log: (m) => logs.push(m) });
  open.push(bridge);
  await vi.waitFor(() => expect(bridge.status().listening).toBe(true));
  return { bridge, coach, port: bridge.status().port };
}

describe('bridge protocol', () => {
  test('GET /v1/ping answers with app, bridge and version, CORS for the extension origin only', async () => {
    const { bridge, port } = await start();
    const r = await send(port);
    expect(r.status).toBe(200);
    const proof = createHmac('sha256', TOKEN).update(NONCE).digest('hex');
    expect(r.json()).toEqual({ ok: true, app: 'langcoach', bridge: 1, version: '9.9.9', proof });
    expect(r.body).not.toContain(TOKEN);
    for (const path of ['/v1/ping', '/v1/ping?nonce=abc', '/v1/ping?nonce=xyz12345', `/v1/ping?nonce=${'a'.repeat(65)}`]) {
      expect((await send(port, { path })).status, path).toBe(400);
    }
    expect(r.headers['access-control-allow-origin']).toBe(ORIGIN);
    expect(bridge.status().lastPingAt).not.toBeNull();
    const viaLocalhost = await send(port, { headers: { Host: `localhost:${port}` } });
    expect(viaLocalhost.status).toBe(200);
  });

  test('OPTIONS preflight returns the exact CORS headers', async () => {
    const { port } = await start();
    const r = await send(port, {
      method: 'OPTIONS',
      path: '/v1/lessons',
      headers: { 'X-LangCoach': '', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type, x-langcoach' },
    });
    expect(r.status).toBe(204);
    expect(r.headers['access-control-allow-origin']).toBe(ORIGIN);
    expect(r.headers['access-control-allow-methods']).toBe('GET, POST, OPTIONS');
    expect(r.headers['access-control-allow-headers']).toBe('Content-Type, X-LangCoach, X-LangCoach-Token');
    expect(r.headers['access-control-max-age']).toBe('600');
  });

  test('POST /v1/lessons saves, reports duplicates on resend, rejects invalid lessons per item', async () => {
    const { bridge, coach, port } = await start();
    const r = await send(port, {
      path: '/v1/lessons',
      body: payload([lll('a', ['kawa', 'herbata']), { ...lll('bad'), items: [] }, { id: 'x'.repeat(101), kind: 'tiny_lesson' }, 42]),
    });
    expect(r.status).toBe(200);
    const body = r.json();
    expect(body.ok).toBe(true);
    expect(body.results).toHaveLength(4);
    expect(body.results[0]).toMatchObject({ id: 'a', status: 'saved', newCards: 2 });
    expect(typeof body.results[0].lessonId).toBe('string');
    expect(body.results[1]).toMatchObject({ id: 'bad', status: 'rejected' });
    expect(body.results[1].error).toMatch(/items/);
    expect(body.results[2].status).toBe('rejected');
    expect(body.results[3].status).toBe('rejected');
    const again = (await send(port, { path: '/v1/lessons', body: payload([lll('a', ['kawa', 'herbata'])]) })).json();
    expect(again.results[0]).toMatchObject({ id: 'a', status: 'duplicate', lessonId: body.results[0].lessonId });
    const state = await coach.exportData();
    expect(state.lessons).toHaveLength(1);
    expect(state.lessons[0]!.externalId).toBe('a');
    expect(state.cards).toHaveLength(2);
    expect(bridge.status()).toMatchObject({ receivedLessons: 1, receivedCards: 2, lastError: null });
    expect(bridge.status().lastReceivedAt).not.toBeNull();
  });

  test('a saved lesson completes the matching planned task (autoComplete)', async () => {
    const coach = new Coach(new MemoryStore(), () => new Date(2026, 9, 20, 10, 0));
    await coach.setProfile(
      { nativeLanguage: 'English', targetLanguage: 'Polish', level: 'A2', goal: 'chat', minutesPerDay: 15, daysPerWeek: 7 },
      { theme: 'Cafe' },
    );
    const { port } = await start(coach);
    const r = (await send(port, { path: '/v1/lessons', body: payload([lll('t1')]) })).json();
    const state = await coach.exportData();
    const task = Object.values(state.plans)[0]!.tasks.find((t) => t.type === 'tiny_lesson' && t.status === 'done');
    expect(task?.lessonId).toBe(r.results[0].lessonId);
    expect(state.log.filter((e) => e.lessonId === r.results[0].lessonId)).toHaveLength(1);
    // A duplicate never completes anything again.
    await send(port, { path: '/v1/lessons', body: payload([lll('t1')]) });
    expect((await coach.exportData()).log).toHaveLength(state.log.length);
  });
});

describe('bridge trust checks and limits', () => {
  test('bad Origin, missing Origin, missing X-LangCoach and foreign Host -> 403 without CORS', async () => {
    const { coach, port } = await start();
    const body = payload([lll('z')]);
    for (const headers of <Record<string, string>[]>[
      { Origin: 'https://evil.example' },
      { Origin: '' },
      { Origin: 'chrome-extension://abc\u0000' },
      { 'X-LangCoach': '' },
      { 'X-LangCoach': '0' },
      { Host: `evil.example:${port}` },
      { Host: '127.0.0.1:1' },
    ]) {
      const r = await send(port, { path: '/v1/lessons', body, headers }).catch(() => null);
      if (r === null) continue; // the HTTP client refused an invalid header value; nothing was sent
      expect(r.status, JSON.stringify(headers)).toBe(403);
      expect(r.headers['access-control-allow-origin']).toBeUndefined();
    }
    const preflight = await send(port, { method: 'OPTIONS', path: '/v1/lessons', headers: { Origin: 'https://evil.example' } });
    expect(preflight.status).toBe(403);
    expect(preflight.headers['access-control-allow-origin']).toBeUndefined();
    expect((await coach.exportData()).lessons).toHaveLength(0);
  });

  test('an Origin-less GET ping works (Chrome omits Origin for extension GETs) but gets no CORS and no other route', async () => {
    const { port } = await start();
    const ping = await send(port, { headers: { Origin: '' } });
    expect(ping.status).toBe(200);
    expect(ping.headers['access-control-allow-origin']).toBeUndefined();
    expect((await send(port, { headers: { Origin: '', 'X-LangCoach': '' } })).status).toBe(403);
    expect((await send(port, { headers: { Origin: '', Host: 'evil.example:1' } })).status).toBe(403);
    expect((await send(port, { method: 'OPTIONS', headers: { Origin: '' } })).status).toBe(403);
    expect((await send(port, { path: '/v1/lessons', headers: { Origin: '' } })).status).toBe(403);
  });

  test('malformed JSON, wrong shape, more than 20 lessons -> 400; unknown path -> 404', async () => {
    const { coach, port } = await start();
    const bad = await send(port, { path: '/v1/lessons', body: '{ nope' });
    expect(bad.status).toBe(400);
    expect(bad.json()).toEqual({ ok: false, error: expect.any(String) });
    expect(bad.body).not.toMatch(/at .*\.(ts|js)/);
    expect((await send(port, { path: '/v1/lessons', body: '{"lessons":"x"}' })).status).toBe(400);
    expect((await send(port, { path: '/v1/lessons', body: '[]' })).status).toBe(400);
    expect((await send(port, { path: '/v1/lessons', body: payload([]) })).status).toBe(400);
    const many = Array.from({ length: 21 }, (_, i) => lll(`m${i}`, [`t${i}`]));
    expect((await send(port, { path: '/v1/lessons', body: payload(many) })).status).toBe(400);
    expect((await send(port, { path: '/v1/lessons', body: payload([lll('q')]), headers: { 'Content-Type': 'text/plain' } })).status).toBe(400);
    expect((await send(port, { path: '/v1/nothing' })).status).toBe(404);
    expect((await coach.exportData()).lessons).toHaveLength(0);
  });

  test('a body over 1 MiB is refused (declared or streamed) and the server keeps working', async () => {
    const { coach, port } = await start();
    const big = Buffer.alloc(1024 * 1024 + 10, 0x20);
    const declared = await send(port, { path: '/v1/lessons', body: big }).catch((e: NodeJS.ErrnoException) => e);
    if ('status' in declared) expect(declared.status).toBe(400);
    // Chunked (no Content-Length): the limit is enforced while streaming.
    const streamed = await send(port, { path: '/v1/lessons', body: big, headers: { 'Transfer-Encoding': 'chunked' } }).catch(
      (e: NodeJS.ErrnoException) => e,
    );
    if ('status' in streamed) expect(streamed.status).toBe(400);
    else expect(['ECONNRESET', 'EPIPE']).toContain(streamed.code);
    expect((await send(port)).status).toBe(200);
    expect((await coach.exportData()).lessons).toHaveLength(0);
  });

  test('more than 30 requests per minute -> 429', async () => {
    const { port } = await start();
    for (let i = 0; i < 30; i++) expect((await send(port)).status).toBe(200);
    const r = await send(port);
    expect(r.status).toBe(429);
    expect(r.json().ok).toBe(false);
  });

  test('port in use: retries, then binds once the port is free; close releases it', async () => {
    const blocker: NetServer = createNetServer();
    await new Promise<void>((r) => blocker.listen(0, '127.0.0.1', r));
    const port = (blocker.address() as { port: number }).port;
    const bridge = startBridge(new Coach(new MemoryStore()), { port, version: '1', retryMs: 50, token: () => TOKEN, log: (m) => logs.push(m) });
    open.push(bridge);
    await vi.waitFor(() => expect(bridge.status().lastError).toMatch(/in use/));
    expect(bridge.status().listening).toBe(false);
    await new Promise<void>((r) => blocker.close(() => r()));
    await vi.waitFor(() => expect(bridge.status().listening).toBe(true));
    expect(bridge.status()).toMatchObject({ port, lastError: null });
    expect((await send(port)).status).toBe(200);
    expect(logs.filter((l) => /in use/.test(l))).toHaveLength(1); // logged once, not on every retry
    await bridge.close();
    expect(bridge.status().listening).toBe(false);
    const again = createNetServer();
    await new Promise<void>((resolve, reject) => {
      again.once('error', reject);
      again.listen(port, '127.0.0.1', resolve);
    });
    await new Promise<void>((r) => again.close(() => r()));
  });

  test('binds 127.0.0.1 only', async () => {
    const { port } = await start();
    const r = await new Promise<string>((resolve) => {
      const req = request({ host: '::1', port, path: PING, headers: { Origin: ORIGIN, 'X-LangCoach': '1' } }, () => resolve('connected'));
      req.on('error', () => resolve('refused'));
      req.end();
    });
    expect(r).toBe('refused');
  });

  test('POST without the pairing token, or with a wrong one -> 401 "unauthorized", nothing saved', async () => {
    const { coach, port } = await start();
    for (const token of ['', 'cd'.repeat(32), 'ab', TOKEN + '00']) {
      const r = await send(port, { path: '/v1/lessons', body: payload([lll('u')]), headers: { 'X-LangCoach-Token': token } });
      expect(r.status, token).toBe(401);
      expect(r.json()).toEqual({ ok: false, error: 'unauthorized' });
    }
    expect((await coach.exportData()).lessons).toHaveLength(0);
    expect(logs.join('\n')).not.toContain(TOKEN);
  });
});

describe('pairing token file', () => {
  test('created lazily as 64 hex chars, reused, mode 0600 where supported; invalid content is replaced', () => {
    const dir = mkdtempSync(join(tmpdir(), 'langcoach-token-'));
    try {
      const home = join(dir, 'home');
      const t = loadOrCreateToken(home);
      expect(t).toMatch(/^[0-9a-f]{64}$/);
      expect(loadOrCreateToken(home)).toBe(t);
      const file = join(home, 'bridge-token');
      expect(readFileSync(file, 'utf8').trim()).toBe(t);
      if (process.platform !== 'win32') expect(statSync(file).mode & 0o777).toBe(0o600);
      writeFileSync(file, 'garbage');
      const t2 = loadOrCreateToken(home);
      expect(t2).toMatch(/^[0-9a-f]{64}$/);
      expect(t2).not.toBe(t);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('ping answers 503 while unpaired and never creates the token file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'langcoach-token-'));
    const c = createBridgeController(new Coach(new MemoryStore()), { dataDir: dir, mode: 'on', port: 0, version: '1', log: () => {} });
    try {
      await vi.waitFor(() => expect(c.status().listening).toBe(true));
      const port = c.status().port;
      const r = await send(port);
      expect(r.status).toBe(503);
      expect(r.json().ok).toBe(false);
      const post = await send(port, { path: '/v1/lessons', body: payload([lll('np')]) });
      expect(post.status).toBe(401);
      expect(existsSync(join(dir, 'bridge-token'))).toBe(false);
      const t = c.token();
      const ok = await send(port);
      expect(ok.status).toBe(200);
      expect(ok.json().proof).toBe(createHmac('sha256', t).update(NONCE).digest('hex'));
    } finally {
      await c.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('review hardening', () => {
  test('externalId must match [\\w.:-]', async () => {
    const { port } = await start();
    const r = (await send(port, { path: '/v1/lessons', body: payload([lll('bad id!'), lll('a/b'), lll('ok-1.a:b_C')]) })).json();
    expect(r.results.map((x: { status: string }) => x.status)).toEqual(['rejected', 'rejected', 'saved']);
  });

  test('Content-Type must be exactly application/json (parameters allowed)', async () => {
    const { port } = await start();
    const body = payload([lll('ct')]);
    for (const ct of ['application/jsonp', 'application/json-seq', 'application/json5', 'text/json']) {
      expect((await send(port, { path: '/v1/lessons', body, headers: { 'Content-Type': ct } })).status, ct).toBe(400);
    }
    const ok = await send(port, { path: '/v1/lessons', body, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
    expect(ok.status).toBe(200);
  });

  test('another origin cannot use up our rate limit', async () => {
    const { port } = await start();
    const other = `chrome-extension://${'p'.repeat(32)}`;
    for (let i = 0; i < 30; i++) await send(port, { headers: { Origin: other } });
    expect((await send(port, { headers: { Origin: other } })).status).toBe(429);
    expect((await send(port)).status).toBe(200);
    expect((await send(port, { headers: { Origin: '' } })).status).toBe(200);
  });

  test('concurrent identical POSTs save once and report one duplicate', async () => {
    const { coach, port } = await start();
    const body = payload([lll('same', ['jeden', 'dwa'])]);
    const [a, b] = await Promise.all([send(port, { path: '/v1/lessons', body }), send(port, { path: '/v1/lessons', body })]);
    const statuses = [a.json().results[0].status, b.json().results[0].status].sort();
    expect(statuses).toEqual(['duplicate', 'saved']);
    const state = await coach.exportData();
    expect(state.lessons).toHaveLength(1);
    expect(state.cards).toHaveLength(2);
  });

  test('a server error while already listening is logged, never re-listens, never crashes', async () => {
    let srv: import('node:http').Server | undefined;
    const bridge = startBridge(new Coach(new MemoryStore()), {
      port: 0,
      version: '1',
      token: () => TOKEN,
      log: (m) => logs.push(m),
      onServer: (s) => (srv = s),
    });
    open.push(bridge);
    await vi.waitFor(() => expect(bridge.status().listening).toBe(true));
    expect(srv!.maxConnections).toBe(16);
    expect(srv!.headersTimeout).toBe(10_000);
    expect(srv!.requestTimeout).toBe(10_000);
    const err = Object.assign(new Error('too many open files'), { code: 'EMFILE' });
    srv!.emit('error', err);
    await new Promise((r) => setTimeout(r, 30));
    expect(bridge.status().listening).toBe(true);
    expect(logs.some((l) => /too many open files/.test(l))).toBe(true);
    expect((await send(bridge.status().port)).status).toBe(200);
  });
});

describe('bridge input is untrusted', () => {
  test('per-field caps reject the whole lesson (no truncation)', async () => {
    const { coach, port } = await start();
    const over: [string, (l: ReturnType<typeof lll>) => unknown][] = [
      ['situation', (l) => ({ ...l, situation: 'x'.repeat(201) })],
      ['term', (l) => ({ ...l, items: [{ ...item('a'), term: 'x'.repeat(201) }] })],
      ['translation', (l) => ({ ...l, items: [{ ...item('a'), translation: 'x'.repeat(501) }] })],
      ['example', (l) => ({ ...l, items: [{ ...item('a'), example: 'x'.repeat(501) }] })],
      ['note', (l) => ({ ...l, items: [{ ...item('a'), note: 'x'.repeat(501) }] })],
      ['pronunciation', (l) => ({ ...l, items: [{ ...item('a'), pronunciation: 'x'.repeat(201) }] })],
      ['purpose', (l) => ({ ...l, source: { ...l.source, purpose: 'x'.repeat(101) } })],
      ['targetLanguage', (l) => ({ ...l, source: { ...l.source, targetLanguage: 'x'.repeat(81) } })],
      ['sourceLanguage', (l) => ({ ...l, source: { ...l.source, sourceLanguage: 'x'.repeat(81) } })],
    ];
    const lessons = over.map(([f, make], i) => make(lll(`cap${i}`, [`t${i}`])));
    const r = (await send(port, { path: '/v1/lessons', body: payload(lessons) })).json();
    r.results.forEach((x: { status: string; error: string }, i: number) => {
      expect(x.status, over[i]![0]).toBe('rejected');
      expect(x.error).toContain(over[i]![0]);
    });
    expect((await coach.exportData()).lessons).toHaveLength(0);
    // Exactly at the cap is fine.
    const atCap = { ...lll('ok'), situation: 'x'.repeat(200), items: [{ ...item('a'), term: 'y'.repeat(200) }] };
    expect((await send(port, { path: '/v1/lessons', body: payload([atCap]) })).json().results[0].status).toBe('saved');
  });

  test('control characters are stripped (newline/tab kept only in example and note), text is NFC, origin is "bridge"', async () => {
    const { coach, port } = await start();
    const l = {
      ...lll('cc'),
      origin: 'agent',
      situation: 'Café\u0000\n\u202e',
      items: [{ term: 'ka\u0007wa\n\t', translation: 'cof\u001bfee', example: 'line1\nline2\tx\u0000', note: 'n\u0085\nb' }],
      source: { app: 'lll', targetLanguage: 'Pol\u0000ish', sourceLanguage: 'English' },
    };
    const r = (await send(port, { path: '/v1/lessons', body: payload([l]) })).json();
    expect(r.results[0].status).toBe('saved');
    const saved = (await coach.exportData()).lessons[0]!;
    expect(saved.situation).toBe('Café'); // U+202E is stripped too
    expect(saved.items[0]).toEqual({ term: 'kawa', translation: 'coffee', example: 'line1\nline2\tx', note: 'n\nb' });
    expect(saved.source?.targetLanguage).toBe('Polish');
    expect(saved.origin).toBe('bridge');
  });
});

describe('bridge controller (opt-in listener)', () => {
  const ctl = (dataDir: string, mode?: string) =>
    createBridgeController(new Coach(new MemoryStore()), { dataDir, mode, port: 0, version: 't', log: () => {} });

  test('no token file and no LANGCOACH_BRIDGE=on -> no port is opened until start()', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'langcoach-ctl-'));
    const c = ctl(dir);
    try {
      expect(c.status()).toMatchObject({ enabled: true, listening: false, paired: false });
      await new Promise((r) => setTimeout(r, 50));
      expect(c.status().listening).toBe(false);
      c.token();
      expect(c.status().paired).toBe(true);
      c.start();
      c.start(); // idempotent
      await vi.waitFor(() => expect(c.status().listening).toBe(true));
    } finally {
      await c.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('an existing token file or LANGCOACH_BRIDGE=on starts it; off never does', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'langcoach-ctl-'));
    const all: ReturnType<typeof ctl>[] = [];
    try {
      const on = ctl(join(dir, 'empty'), 'on');
      all.push(on);
      await vi.waitFor(() => expect(on.status().listening).toBe(true));
      expect(existsSync(join(dir, 'empty', 'bridge-token'))).toBe(false);
      loadOrCreateToken(dir);
      const paired = ctl(dir);
      all.push(paired);
      await vi.waitFor(() => expect(paired.status()).toMatchObject({ listening: true, paired: true }));
      const off = ctl(dir, 'off');
      all.push(off);
      off.start();
      await new Promise((r) => setTimeout(r, 50));
      expect(off.status()).toMatchObject({ enabled: false, listening: false, paired: true });
    } finally {
      await Promise.all(all.map((c) => c.close()));
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('bridge grammar and bidi hardening', () => {
  const ex = (o: Record<string, unknown> = {}) => ({ sentence: 'Poproszę kawę.', translation: 'A coffee, please.', ...o });
  const point = (o: Record<string, unknown> = {}) => ({ topic: 'Accusative', description: 'Object case.', examples: [ex()], ...o });
  const withGrammar = (id: string, grammar: unknown) => ({ ...lll(id, [`g-${id}`]), grammar });

  test('grammar is rebuilt from whitelisted fields, cleaned, and stored', async () => {
    const { coach, port } = await start();
    const g = [
      point({
        topic: 'Acc\u0000usative\u202e',
        evil: 'drop me',
        examples: [ex({ transliteration: 'po-pro-sheh', explanation: 'line1\nline2\u0007', extra: 1 })],
      }),
    ];
    const r = (await send(port, { path: '/v1/lessons', body: payload([withGrammar('g1', g)]) })).json();
    expect(r.results[0].status).toBe('saved');
    const saved = (await coach.exportData()).lessons[0]!;
    expect(saved.grammar).toEqual([
      {
        topic: 'Accusative',
        description: 'Object case.',
        examples: [
          {
            sentence: 'Poproszę kawę.',
            translation: 'A coffee, please.',
            transliteration: 'po-pro-sheh',
            explanation: 'line1\nline2',
          },
        ],
      },
    ]);
  });

  test('grammar caps, counts and types reject the whole lesson', async () => {
    const { coach, port } = await start();
    const bad: [string, unknown][] = [
      ['topic', [point({ topic: 'x'.repeat(201) })]],
      ['description', [point({ description: 'x'.repeat(1001) })]],
      ['sentence', [point({ examples: [ex({ sentence: 'x'.repeat(501) })] })]],
      ['translation', [point({ examples: [ex({ translation: 'x'.repeat(501) })] })]],
      ['transliteration', [point({ examples: [ex({ transliteration: 'x'.repeat(501) })] })]],
      ['explanation', [point({ examples: [ex({ explanation: 'x'.repeat(1001) })] })]],
      ['grammar', Array.from({ length: 11 }, () => point())],
      ['examples', [point({ examples: Array.from({ length: 11 }, () => ex()) })]],
      ['topic', [point({ topic: 5 })]],
      ['transliteration', [point({ examples: [ex({ transliteration: {} })] })]],
      ['grammar', 'not an array'],
      ['grammar[0]', ['not an object']],
      ['examples', [point({ examples: 'nope' })]],
    ];
    const r = (await send(port, { path: '/v1/lessons', body: payload(bad.map(([, g], i) => withGrammar(`b${i}`, g))) })).json();
    r.results.forEach((x: { status: string; error: string }, i: number) => {
      expect(x.status, bad[i]![0]).toBe('rejected');
      expect(x.error, String(i)).toContain(bad[i]![0]);
    });
    expect((await coach.exportData()).lessons).toHaveLength(0);
    const ten = [point({ examples: Array.from({ length: 10 }, () => ex()) }), ...Array.from({ length: 9 }, () => point())];
    expect((await send(port, { path: '/v1/lessons', body: payload([withGrammar('ok', ten)]) })).json().results[0].status).toBe(
      'saved',
    );
  });

  test('bidi override/isolate controls are stripped; Arabic, Hebrew, LRM and RLM pass unchanged', async () => {
    const { coach, port } = await start();
    const arabic = 'مرحبا \u200f(سلام)\u200e';
    const hebrew = 'שלום \u200e123\u200f';
    const l = {
      ...lll('bidi'),
      situation: `safe\u202atext\u202b\u202c\u202d\u202e\u2066\u2067\u2068\u2069`,
      items: [{ term: arabic, translation: hebrew, example: `x\u202ey`, note: `\u2066n\u2069` }],
      grammar: [point({ topic: `t\u202e`, examples: [ex({ sentence: arabic })] })],
    };
    expect((await send(port, { path: '/v1/lessons', body: payload([l]) })).json().results[0].status).toBe('saved');
    const saved = (await coach.exportData()).lessons[0]!;
    expect(saved.situation).toBe('safetext');
    expect(saved.items[0]).toEqual({ term: arabic, translation: hebrew, example: 'xy', note: 'n' });
    expect(saved.grammar![0]!.topic).toBe('t');
    expect(saved.grammar![0]!.examples[0]!.sentence).toBe(arabic);
  });
});
