import { createHmac } from 'node:crypto';
import { Coach, MemoryStore } from '@langcoach/core/browser';
import { describe, expect, it, vi } from 'vitest';
import {
  BRIDGE_ALARM,
  BRIDGE_ORIGIN,
  BRIDGE_TIMEOUT_MS,
  ERRORS_KEY,
  MAX_SENT,
  PAIRING_SESSION_KEY,
  SENT_KEY,
  UNPAIRED_RETRY_MS,
  createBridge,
  ctEqual,
  hmacHex,
  parsePairing,
} from '../src/background/bridge';
import { SETTINGS_KEY } from '../src/background/router';
import { fakeArea } from './chrome-fake';

/** Obviously fake test secret. */
const TOKEN = '0123456789abcdef'.repeat(4);
const PAIRING = { token: TOKEN, port: 47821, v: 1 };

type Call = { url: string; init: RequestInit };
type Reply = (body: Record<string, unknown>) => Response | Promise<Response>;

const json = (v: unknown, status = 200) =>
  new Response(JSON.stringify(v), { status, headers: { 'content-type': 'application/json' } });
const proofFor = (url: string, token = TOKEN) =>
  createHmac('sha256', token).update(new URL(url).searchParams.get('nonce') ?? '').digest('hex');
const pingOk = (url: string, token = TOKEN) =>
  json({ ok: true, app: 'langcoach', bridge: 1, version: '0.3.0', proof: proofFor(url, token) });

/** Fake bridge server: proves the token on ping, answers lessons through `reply` (default: all saved). */
function fakeFetch(reply?: Reply, serverToken = TOKEN) {
  const calls: Call[] = [];
  const fn = vi.fn(async (url: string | URL | Request, init: RequestInit = {}) => {
    calls.push({ url: String(url), init });
    if (String(url).includes('/v1/ping')) return pingOk(String(url), serverToken);
    const body = JSON.parse(String(init.body)) as { lessons: { id: string }[] };
    if (reply) return reply(body);
    return json({ ok: true, results: body.lessons.map((l) => ({ id: l.id, status: 'saved', newCards: 1 })) });
  });
  const posts = () => calls.filter((c) => c.init.method === 'POST');
  const sentIds = () =>
    posts().flatMap((c) => (JSON.parse(String(c.init.body)) as { lessons: { id: string }[] }).lessons.map((l) => l.id));
  return { fn: fn as unknown as typeof fetch, calls, posts, sentIds };
}

function fakeAlarms() {
  const set = new Map<string, { periodInMinutes?: number }>();
  return {
    set,
    create: vi.fn((name: string, info: { periodInMinutes?: number }) => {
      set.set(name, info);
    }),
    clear: vi.fn(async (name: string) => set.delete(name)),
    get: vi.fn(async (name: string) => (set.has(name) ? { name, ...set.get(name) } : undefined)),
  };
}

const item = (n: number) => ({ term: `t${n}`, translation: `m${n}`, example: `e${n}` });
const src = { app: 'lll' as const, targetLanguage: 'European Spanish', sourceLanguage: 'English', purpose: 'coffee' };

async function setup(
  opts: { reply?: Reply; fetch?: typeof fetch; lessons?: number; timeoutMs?: number; pairing?: unknown; serverToken?: string } = {},
) {
  const area = fakeArea();
  const session = fakeArea();
  const store = new MemoryStore();
  let n = 0;
  const now = { t: new Date('2026-11-09T10:00:00Z').getTime() };
  const coach = new Coach(store, () => new Date(now.t), () => `id${++n}`);
  for (let i = 0; i < (opts.lessons ?? 0); i++) {
    await coach.saveLesson({ kind: 'tiny_lesson', situation: `s${i}`, items: [item(i)], source: src });
  }
  const ff = fakeFetch(opts.reply, opts.serverToken);
  const alarms = fakeAlarms();
  const log = vi.fn();
  const readPairing = vi.fn(async () => ('pairing' in opts ? opts.pairing : PAIRING));
  const make = () =>
    createBridge({
      store,
      area,
      session,
      alarms,
      readPairing,
      fetch: opts.fetch ?? ff.fn,
      log,
      clock: () => new Date(now.t),
      ...(opts.timeoutMs ? { timeoutMs: opts.timeoutMs } : {}),
    });
  return { area, session, store, coach, ff, alarms, log, readPairing, now, bridge: make(), make };
}

const lessonIds = async (store: MemoryStore) => (await store.load()).lessons.map((l) => l.id);
const refused = (async () => Promise.reject(new TypeError('Failed to fetch'))) as typeof fetch;

describe('bridge crypto helpers', () => {
  it('hmacHex matches Node HMAC-SHA256 (UTF-8 token as key, nonce as message)', async () => {
    expect(await hmacHex(TOKEN, 'abc')).toBe(createHmac('sha256', TOKEN).update('abc').digest('hex'));
  });
  it('ctEqual', () => {
    expect(ctEqual('abcd', 'abcd')).toBe(true);
    expect(ctEqual('abcd', 'abce')).toBe(false);
    expect(ctEqual('abc', 'abcd')).toBe(false);
  });
  it('parsePairing accepts only {token: hex, port: 47821, v: 1}', () => {
    expect(parsePairing(PAIRING)).toBe(TOKEN);
    for (const bad of [null, {}, { ...PAIRING, v: 2 }, { ...PAIRING, port: 1 }, { ...PAIRING, token: 'not hex!' }, { ...PAIRING, token: 'ab' }]) {
      expect(parsePairing(bad)).toBeNull();
    }
  });
});

describe('bridge client', () => {
  it('uses the single loopback origin and a 4 s timeout', () => {
    expect(BRIDGE_ORIGIN).toBe('http://127.0.0.1:47821');
    expect(BRIDGE_TIMEOUT_MS).toBe(4000);
  });

  it('ping sends a fresh random nonce (no token) and verifies the proof', async () => {
    const { bridge, ff } = await setup();
    expect(await bridge.ping()).toBe('connected');
    expect(await bridge.ping()).toBe('connected');
    const [a, b] = ff.calls.map((c) => new URL(c.url));
    expect(`${a!.origin}${a!.pathname}`).toBe(`${BRIDGE_ORIGIN}/v1/ping`);
    expect(a!.searchParams.get('nonce')).toMatch(/^[0-9a-f]{32}$/);
    expect(a!.searchParams.get('nonce')).not.toBe(b!.searchParams.get('nonce'));
    const h = new Headers(ff.calls[0]!.init.headers);
    expect(h.get('X-LangCoach')).toBe('1');
    expect(h.get('X-LangCoach-Token')).toBeNull();
    expect(JSON.stringify(ff.calls)).not.toContain(TOKEN);
  });

  it('ping: waiting when nobody answers, unverified on a wrong or missing proof', async () => {
    expect(await (await setup({ fetch: refused })).bridge.ping()).toBe('waiting');
    expect(await (await setup({ serverToken: 'f'.repeat(64) })).bridge.ping()).toBe('unverified');
    const noProof = (async () => json({ ok: true, app: 'langcoach' })) as typeof fetch;
    expect(await (await setup({ fetch: noProof })).bridge.ping()).toBe('unverified');
  });

  it('caches the token in session storage and reads the file once per worker', async () => {
    const { bridge, session, readPairing } = await setup();
    await bridge.ping();
    await bridge.ping();
    expect(readPairing).toHaveBeenCalledTimes(1);
    expect(session.data.get(PAIRING_SESSION_KEY)).toBe(TOKEN);
  });

  it.each<[string, unknown]>([
    ['absent', null],
    ['invalid', { token: 'zz', port: 47821, v: 1 }],
  ])('pairing file %s → not paired, nothing sent, no alarm', async (_n, pairing) => {
    const { bridge, ff, alarms } = await setup({ lessons: 1, pairing });
    expect(await bridge.flush()).toEqual({ sent: [], pending: 1, state: 'unpaired' });
    expect(ff.calls).toHaveLength(0);
    expect(alarms.set.has(BRIDGE_ALARM)).toBe(false);
    expect((await bridge.status()).state).toBe('unpaired');
    expect(ff.calls).toHaveLength(0);
  });

  it('flush posts exactly the protocol payload with the token header and marks saved lessons as sent', async () => {
    const { bridge, ff, store, area, coach } = await setup();
    const r = await coach.saveLesson({
      kind: 'tiny_lesson',
      situation: 'ordering coffee',
      items: [{ ...item(1), note: 'n', pronunciation: 'p' }],
      grammar: [{ topic: 'g', description: 'd', examples: [] }],
      source: src,
    });
    const out = await bridge.flush();
    expect(out).toEqual({ sent: [r.lesson.id], pending: 0, state: 'connected' });
    expect(ff.calls[0]!.url).toContain('/v1/ping?nonce='); // the server is verified first
    const post = ff.posts()[0]!;
    expect(post.url).toBe(`${BRIDGE_ORIGIN}/v1/lessons`);
    const h = new Headers(post.init.headers);
    expect(h.get('Content-Type')).toBe('application/json');
    expect(h.get('X-LangCoach')).toBe('1');
    expect(h.get('X-LangCoach-Token')).toBe(TOKEN);
    const body = JSON.parse(String(post.init.body));
    expect(body.client).toEqual({ name: 'langcoach-extension', version: expect.stringMatching(/^\d+\.\d+\.\d+$/) });
    expect(body.lessons).toEqual([
      {
        id: r.lesson.id,
        kind: 'tiny_lesson',
        situation: 'ordering coffee',
        items: [{ term: 't1', translation: 'm1', example: 'e1', note: 'n', pronunciation: 'p' }],
        grammar: [{ topic: 'g', description: 'd', examples: [] }],
        source: src,
        capturedAt: (await store.load()).lessons[0]!.createdAt,
      },
    ]);
    expect(area.data.get(SENT_KEY)).toEqual([r.lesson.id]);
    await bridge.flush(); // nothing left: only a ping
    expect(ff.posts()).toHaveLength(1);
  });

  it('sends nothing to a server that fails the proof, and backs off', async () => {
    const { bridge, ff, now } = await setup({ lessons: 1, serverToken: 'f'.repeat(64) });
    expect(await bridge.flush()).toMatchObject({ sent: [], pending: 1, state: 'unverified' });
    expect(ff.posts()).toHaveLength(0);
    const calls = ff.calls.length;
    await bridge.flush(); // inside the backoff: no network at all
    expect(ff.calls).toHaveLength(calls);
    now.t += 2 * 60_000 + 1;
    await bridge.flush();
    expect(ff.calls).toHaveLength(calls + 1); // retried after 2 min, next wait is 4 min
    now.t += 2 * 60_000 + 1;
    await bridge.flush();
    expect(ff.calls).toHaveLength(calls + 1);
    expect(ff.posts()).toHaveLength(0);
  });

  it('401 → not paired, retried at most every 10 minutes', async () => {
    const { bridge, ff, now } = await setup({ lessons: 1, reply: () => json({ ok: false, error: 'bad token' }, 401) });
    expect(await bridge.flush()).toMatchObject({ sent: [], pending: 1, state: 'unpaired' });
    expect((await bridge.status()).state).toBe('unpaired');
    const calls = ff.calls.length;
    now.t += UNPAIRED_RETRY_MS - 1000;
    await bridge.flush();
    expect(ff.calls).toHaveLength(calls);
    now.t += 2000;
    await bridge.flush();
    expect(ff.posts()).toHaveLength(2);
  });

  it('never sends fields over the server caps: long items are skipped, unsendable lessons stay local', async () => {
    const { bridge, ff, coach } = await setup();
    const ok = await coach.saveLesson({
      kind: 'tiny_lesson',
      situation: 's',
      items: [item(1), { ...item(2), example: 'x'.repeat(501) }],
      source: src,
    });
    await coach.saveLesson({ kind: 'tiny_lesson', situation: 'y'.repeat(201), items: [item(3)], source: src });
    await coach.saveLesson({ kind: 'tiny_lesson', situation: 's', items: [{ ...item(4), term: 'z'.repeat(201) }], source: src });
    const out = await bridge.flush();
    expect(ff.sentIds()).toEqual([ok.lesson.id]);
    expect(JSON.parse(String(ff.posts()[0]!.init.body)).lessons[0].items).toEqual([item(1)]);
    expect(out.pending).toBe(0);
  });

  it('forwards only lessons from LLL', async () => {
    const { bridge, ff, coach } = await setup();
    await coach.saveLesson({ kind: 'tiny_lesson', situation: 'manual', items: [item(1)] });
    const lll = await coach.saveLesson({ kind: 'slang_hang', situation: 'lll', items: [item(2)], source: src });
    await bridge.flush();
    expect(ff.sentIds()).toEqual([lll.lesson.id]);
  });

  it('duplicate counts as sent; rejected is retried up to 3 times, then left alone', async () => {
    const statuses: Record<string, string> = {};
    const { bridge, ff, store, area } = await setup({
      lessons: 2,
      reply: (b) =>
        json({ ok: true, results: (b.lessons as { id: string }[]).map((l) => ({ id: l.id, status: statuses[l.id], error: 'x' })) }),
    });
    const [a, b] = await lessonIds(store);
    statuses[a!] = 'duplicate';
    statuses[b!] = 'rejected';
    expect((await bridge.flush()).sent).toEqual([a]);
    expect(area.data.get(ERRORS_KEY)).toEqual({ [b!]: 1 });
    await bridge.flush();
    await bridge.flush();
    expect(area.data.get(ERRORS_KEY)).toEqual({ [b!]: 3 });
    const before = ff.posts().length;
    const out = await bridge.flush();
    expect(ff.posts()).toHaveLength(before); // gave up on b
    expect(out.pending).toBe(0);
    expect(area.data.get(SENT_KEY)).toEqual([a]);
  });

  it('network errors and other non-200 answers never throw and leave the backlog', async () => {
    const down = await setup({ lessons: 1, fetch: refused });
    expect(await down.bridge.flush()).toEqual({ sent: [], pending: 1, state: 'waiting' });
    expect(down.area.data.get(SENT_KEY)).toBeUndefined();

    const busy = await setup({ lessons: 1, reply: () => json({ ok: false, error: 'rate' }, 429) });
    expect((await busy.bridge.sendLessons((await busy.store.load()).lessons)).results).toBeNull();
    expect((await busy.bridge.flush()).pending).toBe(1);
  });

  it('times out a hanging request via AbortController', async () => {
    const hang = (async (_u: unknown, init: RequestInit = {}) =>
      new Promise<Response>((_res, rej) => {
        init.signal?.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError')));
      })) as typeof fetch;
    const { bridge } = await setup({ lessons: 1, fetch: hang, timeoutMs: 20 });
    const t0 = Date.now();
    expect(await bridge.ping()).toBe('waiting');
    expect((await bridge.flush()).pending).toBe(1);
    expect(Date.now() - t0).toBeLessThan(2000);
  });

  it('flushes a backlog in batches of at most 10 lessons', async () => {
    const { bridge, ff } = await setup({ lessons: 23 });
    const out = await bridge.flush();
    expect(out.sent).toHaveLength(23);
    expect(ff.posts().map((p) => JSON.parse(String(p.init.body)).lessons.length)).toEqual([10, 10, 3]);
  });

  it('caps the sent set at 1000 ids, dropping the oldest', async () => {
    const { bridge, area, store } = await setup({ lessons: 2 });
    await area.set({ [SENT_KEY]: Array.from({ length: MAX_SENT }, (_, i) => `old${i}`) });
    await bridge.flush();
    const sent = area.data.get(SENT_KEY) as string[];
    expect(sent).toHaveLength(MAX_SENT);
    expect(sent[0]).toBe('old2');
    expect(sent.slice(-2)).toEqual(await lessonIds(store));
  });

  it('does nothing when bridgeEnabled is false', async () => {
    const { bridge, ff, area, alarms } = await setup({ lessons: 1 });
    await area.set({ [SETTINGS_KEY]: { bridgeEnabled: false } });
    expect(await bridge.flush()).toEqual({ sent: [], pending: 0, state: 'off' });
    expect(alarms.clear).toHaveBeenCalledWith(BRIDGE_ALARM);
    expect((await bridge.status()).state).toBe('off');
    expect(ff.calls).toHaveLength(0);
  });

  it('state survives a service-worker restart (sent ids live in storage)', async () => {
    const { bridge, ff, make } = await setup({ lessons: 1 });
    await bridge.flush();
    await make().flush(); // a new worker over the same storage
    expect(ff.posts()).toHaveLength(1);
  });

  it('status reports the state, backlog and last send time', async () => {
    const { bridge, coach } = await setup();
    await coach.saveLesson({ kind: 'tiny_lesson', situation: 's', items: [item(1)], source: src });
    expect(await bridge.status()).toEqual({ state: 'connected', pending: 1, lastSentAt: null });
    await bridge.flush();
    const s = await bridge.status();
    expect(s.pending).toBe(0);
    expect(typeof s.lastSentAt).toBe('string');
  });

  it('never logs the token', async () => {
    const { bridge, log } = await setup({ lessons: 1, reply: () => json({ ok: false }, 401) });
    await bridge.flush();
    expect(JSON.stringify(log.mock.calls)).not.toContain(TOKEN);
  });
});

describe('bridge alarm lifecycle', () => {
  it('created (2 min) while a backlog exists, cleared once flushed', async () => {
    let up = false;
    const ff = fakeFetch();
    const fetchFn = (async (url: string, init?: RequestInit) => {
      if (!up) throw new TypeError('Failed to fetch');
      return ff.fn(url, init);
    }) as typeof fetch;
    const { bridge, alarms } = await setup({ lessons: 1, fetch: fetchFn });
    await bridge.flush();
    expect(alarms.set.get(BRIDGE_ALARM)).toEqual({ periodInMinutes: 2 });
    await bridge.flush(); // still down: the existing alarm is kept, not re-created
    expect(alarms.create).toHaveBeenCalledTimes(1);
    up = true;
    await bridge.flush();
    expect(alarms.set.has(BRIDGE_ALARM)).toBe(false);
  });

  it('kept while the last ping failed even without a backlog; cleared when the agent answers', async () => {
    let up = false;
    const ff = fakeFetch();
    const fetchFn = (async (url: string, init?: RequestInit) => {
      if (!up) throw new TypeError('Failed to fetch');
      return ff.fn(url, init);
    }) as typeof fetch;
    const { bridge, alarms } = await setup({ fetch: fetchFn });
    await bridge.flush();
    expect(alarms.set.has(BRIDGE_ALARM)).toBe(true);
    up = true;
    await bridge.flush();
    expect(alarms.set.has(BRIDGE_ALARM)).toBe(false);
  });

  it('onAlarm flushes only for its own alarm', async () => {
    const { bridge, ff } = await setup({ lessons: 1 });
    await bridge.onAlarm({ name: 'langcoach-reminder' });
    expect(ff.calls).toHaveLength(0);
    await bridge.onAlarm({ name: BRIDGE_ALARM });
    expect(ff.posts()).toHaveLength(1);
  });
});
