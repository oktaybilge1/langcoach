// Loopback HTTP bridge: the LangCoach browser extension forwards captured lessons here.
// Bridge protocol (frozen): GET /v1/ping?nonce -> HMAC proof, POST /v1/lessons with X-LangCoach-Token; loopback only.
// Never writes to stdout: in the MCP process stdout is the protocol channel.
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { join } from 'node:path';
import { InvalidDataError, type Coach } from '@langcoach/core';

export const DEFAULT_BRIDGE_PORT = 47821;
const MAX_BODY_BYTES = 1024 * 1024;
const MAX_LESSONS = 20;
const MAX_REQUESTS_PER_MINUTE = 30;
const MAX_ID_CHARS = 100;
const ID_SHAPE = /^[\w.:-]{1,100}$/;
const MAX_RATE_KEYS = 64;
// Chrome, Edge and Brave all use chrome-extension://<id>; only this exact shape is ever echoed back.
const EXTENSION_ORIGIN = /^chrome-extension:\/\/[a-z0-9]{1,64}$/;
const TOKEN_SHAPE = /^[0-9a-f]{64}$/;
const NONCE_SHAPE = /^[0-9a-f]{8,64}$/i;

/**
 * The per-install pairing secret in `<dataDir>/bridge-token` (created on first use, mode 0600).
 * Never log it or return it from a tool; only the copied extension's pairing.json carries it.
 */
export function loadOrCreateToken(dataDir: string): string {
  const file = join(dataDir, 'bridge-token');
  try {
    const existing = readFileSync(file, 'utf8').trim();
    if (TOKEN_SHAPE.test(existing)) return existing;
  } catch {
    // missing or unreadable: create below
  }
  const token = randomBytes(32).toString('hex');
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(file, token, { mode: 0o600 });
  chmodSync(file, 0o600); // mode above applies only to a newly created file
  return token;
}

/** The pairing token if the learner paired an extension; never creates the file. */
export function readToken(dataDir: string): string | null {
  try {
    const t = readFileSync(join(dataDir, 'bridge-token'), 'utf8').trim();
    return TOKEN_SHAPE.test(t) ? t : null;
  } catch {
    return null;
  }
}

/** Length-safe constant-time comparison (both sides hashed to 32 bytes first). */
function sameSecret(given: string, expected: string): boolean {
  const h = (v: string) => createHash('sha256').update(v).digest();
  return timingSafeEqual(h(given), h(expected)) && given.length === expected.length;
}

export interface BridgeStatus {
  listening: boolean;
  port: number;
  receivedLessons: number;
  receivedCards: number;
  lastReceivedAt: string | null;
  lastPingAt: string | null;
  lastError: string | null;
}

export interface Bridge {
  close(): Promise<void>;
  status(): BridgeStatus;
}

export interface BridgeOptions {
  /** 0 picks a free port (tests). */
  port?: number;
  version: string;
  /** Pairing secret, read on each request that needs it; null while unpaired. */
  token: () => string | null;
  /** Test hook: receives the underlying http.Server. */
  onServer?: (server: Server) => void;
  retryMs?: number;
  log?: (message: string) => void;
}

type LessonResult = {
  id: string;
  status: 'saved' | 'duplicate' | 'rejected';
  lessonId?: string;
  newCards?: number;
  error?: string;
};

class HttpError extends Error {
  constructor(
    readonly code: number,
    message: string,
  ) {
    super(message);
  }
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

// Bridge text comes from a web page and is untrusted: control characters are stripped (newline and
// tab survive only in multi-line fields), text is NFC-normalized, and an over-long field rejects the
// lesson instead of being truncated. Non-strings pass through for Coach.saveLesson to reject.
// Bidi override/isolate controls (U+202A-202E, U+2066-2069) are stripped; LRM/RLM and RTL text stay.
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g;
const CONTROL_KEEP_LINES = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g;
const MAX_GRAMMAR = 10;

function clean(v: unknown, field: string, max: number, multiline = false): unknown {
  if (typeof v !== 'string') return v;
  const out = v.replace(multiline ? CONTROL_KEEP_LINES : CONTROL, '').normalize('NFC');
  if (out.length > max) throw new InvalidDataError(`${field} is longer than ${max} characters`);
  return out;
}

type SaveInput = Parameters<Coach['saveLesson']>[0];

/** Rebuild grammar from whitelisted fields only (unknown keys dropped); Coach validates the types. */
function cleanGrammar(g: unknown): unknown {
  if (!Array.isArray(g)) return g;
  if (g.length > MAX_GRAMMAR) throw new InvalidDataError(`grammar must contain at most ${MAX_GRAMMAR} points`);
  return g.map((p: unknown, i) => {
    if (!isObj(p)) return p;
    const at = `grammar[${i}]`;
    if (Array.isArray(p.examples) && p.examples.length > MAX_GRAMMAR) {
      throw new InvalidDataError(`${at}.examples must contain at most ${MAX_GRAMMAR} entries`);
    }
    const examples = Array.isArray(p.examples)
      ? p.examples.map((e: unknown, j) => {
          if (!isObj(e)) return e;
          const ea = `${at}.examples[${j}]`;
          const o: Record<string, unknown> = {
            sentence: clean(e.sentence, `${ea}.sentence`, 500),
            translation: clean(e.translation, `${ea}.translation`, 500),
          };
          if (e.transliteration !== undefined) o.transliteration = clean(e.transliteration, `${ea}.transliteration`, 500);
          if (e.explanation !== undefined) o.explanation = clean(e.explanation, `${ea}.explanation`, 1000, true);
          return o;
        })
      : p.examples;
    return {
      topic: clean(p.topic, `${at}.topic`, 200),
      description: clean(p.description, `${at}.description`, 1000, true),
      examples,
    };
  });
}

function cleanLesson(l: Record<string, unknown>, id: string): SaveInput {
  const items = Array.isArray(l.items)
    ? l.items.map((it: unknown, i) => {
        if (!isObj(it)) return it;
        const at = `items[${i}]`;
        const o: Record<string, unknown> = {
          term: clean(it.term, `${at}.term`, 200),
          translation: clean(it.translation, `${at}.translation`, 500),
          example: clean(it.example, `${at}.example`, 500, true),
        };
        if (it.note !== undefined) o.note = clean(it.note, `${at}.note`, 500, true);
        if (it.pronunciation !== undefined) o.pronunciation = clean(it.pronunciation, `${at}.pronunciation`, 200);
        return o;
      })
    : l.items;
  // origin is always set here, never taken from the client.
  const input = { kind: l.kind, situation: clean(l.situation, 'situation', 200), items, externalId: id, origin: 'bridge' };
  const out = input as SaveInput;
  if (l.grammar !== undefined) out.grammar = cleanGrammar(l.grammar) as never;
  if (isObj(l.source)) {
    const s = l.source;
    const src: Record<string, unknown> = {
      app: s.app,
      targetLanguage: clean(s.targetLanguage, 'source.targetLanguage', 80),
      sourceLanguage: clean(s.sourceLanguage, 'source.sourceLanguage', 80),
    };
    if (s.purpose !== undefined) src.purpose = clean(s.purpose, 'source.purpose', 100);
    out.source = src as never;
  } else if (l.source !== undefined) out.source = l.source as never;
  return out;
}

export function startBridge(coach: Coach, opts: BridgeOptions): Bridge {
  const wantedPort = opts.port ?? DEFAULT_BRIDGE_PORT;
  const retryMs = opts.retryMs ?? 30_000;
  const log = opts.log ?? ((m: string) => process.stderr.write(`langcoach bridge: ${m}\n`));
  const st: BridgeStatus = {
    listening: false,
    port: wantedPort,
    receivedLessons: 0,
    receivedCards: 0,
    lastReceivedAt: null,
    lastPingAt: null,
    lastError: null,
  };
  let closed = false;
  let retry: NodeJS.Timeout | undefined;
  // Rate limit per origin, so traffic from another extension cannot use up ours.
  const hits = new Map<string, number[]>();

  const server = createServer((req, res) => {
    handle(req, res).catch((err: unknown) => {
      log(`request failed: ${err instanceof Error ? err.message : String(err)}`);
      if (!res.headersSent) reply(res, 500, { ok: false, error: 'Internal error' });
      else res.destroy();
    });
  });
  server.maxConnections = 16;
  server.headersTimeout = 10_000;
  server.requestTimeout = 10_000;
  opts.onServer?.(server);
  server.unref(); // the MCP stdio session, not the bridge, decides how long the process lives
  server.on('clientError', (_err, socket) => socket.destroy());
  server.on('listening', () => {
    st.listening = true;
    st.port = (server.address() as { port: number }).port;
    st.lastError = null;
  });
  server.on('error', (err: NodeJS.ErrnoException) => {
    if (closed) return;
    if (server.listening) {
      // e.g. EMFILE on accept: listening again would throw ERR_SERVER_ALREADY_LISTEN.
      log(`server error: ${err.message}`);
      return;
    }
    const msg =
      err.code === 'EADDRINUSE'
        ? `port ${wantedPort} is in use (another LangCoach session may own it); retrying every ${Math.round(retryMs / 1000)} s`
        : `cannot listen on 127.0.0.1:${wantedPort}: ${err.message}`;
    if (msg !== st.lastError) log(msg);
    st.lastError = msg;
    retry = setTimeout(listen, retryMs);
    retry.unref();
  });

  function listen(): void {
    if (closed || server.listening) return;
    try {
      server.listen(wantedPort, '127.0.0.1');
    } catch (err) {
      log(`cannot listen: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  function reply(res: ServerResponse, code: number, body: unknown, origin?: string, extra: Record<string, string> = {}): void {
    const headers: Record<string, string> = { 'Content-Type': 'application/json; charset=utf-8', ...extra };
    if (origin !== undefined) {
      headers['Access-Control-Allow-Origin'] = origin;
      headers['Vary'] = 'Origin';
    }
    res.writeHead(code, headers).end(body === undefined ? undefined : JSON.stringify(body));
  }

  // Returns the allowed origin, '' for an Origin-less ping, or null when forbidden.
  function trusted(req: IncomingMessage): string | null {
    const origin = req.headers.origin;
    // Chrome sends no Origin on an extension's GET to a permitted host; only the ping may do that
    // (it reveals just an HMAC of the caller's nonce, and the custom header still blocks web pages).
    const noOriginPing = origin === undefined && req.method === 'GET' && (req.url ?? '').split('?')[0] === '/v1/ping';
    if (!noOriginPing && (typeof origin !== 'string' || !EXTENSION_ORIGIN.test(origin))) return null;
    const host = req.headers.host;
    if (host !== `127.0.0.1:${st.port}` && host !== `localhost:${st.port}`) return null;
    // The preflight announces X-LangCoach instead of sending it.
    if (req.method !== 'OPTIONS' && req.headers['x-langcoach'] !== '1') return null;
    return noOriginPing ? '' : (origin as string);
  }

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const allowed = trusted(req);
    if (allowed === null) return reply(res, 403, { ok: false, error: 'Forbidden' });
    const origin = allowed === '' ? undefined : allowed;
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    const path = url.pathname;
    if (path !== '/v1/ping' && path !== '/v1/lessons') return reply(res, 404, { ok: false, error: 'Not found' }, origin);
    if (req.method === 'OPTIONS') {
      return reply(res, 204, undefined, origin, {
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-LangCoach, X-LangCoach-Token',
        'Access-Control-Max-Age': '600',
      });
    }
    const now = Date.now();
    const key = origin ?? '';
    const mine = (hits.get(key) ?? []).filter((t) => t > now - 60_000);
    if (mine.length >= MAX_REQUESTS_PER_MINUTE) return reply(res, 429, { ok: false, error: 'Too many requests' }, origin);
    mine.push(now);
    hits.delete(key);
    hits.set(key, mine);
    if (hits.size > MAX_RATE_KEYS) hits.delete(hits.keys().next().value as string); // drop the least recent origin

    if (path === '/v1/ping' && req.method === 'GET') {
      // Proof that this server holds the pairing token (the extension refuses servers without it).
      const nonce = url.searchParams.get('nonce') ?? '';
      if (!NONCE_SHAPE.test(nonce)) return reply(res, 400, { ok: false, error: 'nonce must be 8-64 hex characters' }, origin);
      const token = opts.token();
      if (token === null) return reply(res, 503, { ok: false, error: 'not paired' }, origin);
      st.lastPingAt = new Date().toISOString();
      const proof = createHmac('sha256', token).update(nonce).digest('hex');
      return reply(res, 200, { ok: true, app: 'langcoach', bridge: 1, version: opts.version, proof }, origin);
    }
    if (path !== '/v1/lessons' || req.method !== 'POST') {
      return reply(res, 405, { ok: false, error: 'Method not allowed' }, origin);
    }
    const given = req.headers['x-langcoach-token'];
    const token = opts.token();
    if (token === null || typeof given !== 'string' || !sameSecret(given, token)) {
      res.setHeader('Connection', 'close');
      return reply(res, 401, { ok: false, error: 'unauthorized' }, origin);
    }
    let lessons: unknown[];
    try {
      lessons = parsePayload(await readBody(req, res));
    } catch (err) {
      if (!(err instanceof HttpError)) throw err;
      res.setHeader('Connection', 'close');
      reply(res, err.code, { ok: false, error: err.message }, origin);
      return;
    }
    const results: LessonResult[] = [];
    for (const l of lessons) results.push(await saveOne(l));
    reply(res, 200, { ok: true, results }, origin);
  }

  function readBody(req: IncomingMessage, res: ServerResponse): Promise<string> {
    if (!/^application\/json\s*(;|$)/i.test(req.headers['content-type'] ?? '')) {
      return Promise.reject(new HttpError(400, 'Content-Type must be application/json'));
    }
    const tooLarge = new HttpError(400, 'Request body is larger than 1 MiB');
    if (Number(req.headers['content-length'] ?? 0) > MAX_BODY_BYTES) {
      res.on('finish', () => req.socket.destroy());
      return Promise.reject(tooLarge);
    }
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      let size = 0;
      req.on('data', (c: Buffer) => {
        size += c.length;
        if (size > MAX_BODY_BYTES) {
          req.removeAllListeners('data');
          res.on('finish', () => req.socket.destroy());
          reject(tooLarge);
          return;
        }
        chunks.push(c);
      });
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      req.on('error', () => reject(new HttpError(400, 'Request body could not be read')));
      req.on('close', () => reject(new HttpError(400, 'Request body was cut off'))); // no-op after 'end'
    });
  }

  function parsePayload(text: string): unknown[] {
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      throw new HttpError(400, 'Malformed JSON');
    }
    if (!isObj(body) || !Array.isArray(body.lessons)) throw new HttpError(400, 'Body must be an object with a lessons array');
    if (body.lessons.length < 1 || body.lessons.length > MAX_LESSONS) {
      throw new HttpError(400, `lessons must contain between 1 and ${MAX_LESSONS} entries`);
    }
    return body.lessons;
  }

  async function saveOne(l: unknown): Promise<LessonResult> {
    const id = isObj(l) && typeof l.id === 'string' ? l.id : '';
    if (!isObj(l) || !ID_SHAPE.test(id)) {
      return {
        id: id.slice(0, MAX_ID_CHARS),
        status: 'rejected',
        error: `id must be 1-${MAX_ID_CHARS} characters of letters, digits, _ . : -`,
      };
    }
    try {
      const r = await coach.saveLesson(cleanLesson(l, id));
      if (r.alreadyImported) return { id, status: 'duplicate', lessonId: r.lesson.id };
      st.receivedLessons++;
      st.receivedCards += r.newCards;
      st.lastReceivedAt = new Date().toISOString();
      try {
        await coach.autoComplete(r.lesson.kind, { lessonId: r.lesson.id });
      } catch (err) {
        log(`lesson saved but its planned task was not completed: ${err instanceof Error ? err.message : String(err)}`);
      }
      return { id, status: 'saved', lessonId: r.lesson.id, newCards: r.newCards };
    } catch (err) {
      if (err instanceof InvalidDataError) return { id, status: 'rejected', error: err.message };
      log(`could not save lesson: ${err instanceof Error ? err.message : String(err)}`);
      return { id, status: 'rejected', error: 'Could not save this lesson' };
    }
  }

  listen();

  return {
    status: () => ({ ...st }),
    close: () => {
      closed = true;
      clearTimeout(retry);
      if (!st.listening) return Promise.resolve();
      return new Promise<void>((resolve) => {
        server.close(() => {
          st.listening = false;
          resolve();
        });
        server.closeAllConnections();
      });
    },
  };
}

export interface BridgeController {
  /** enabled: not turned off by LANGCOACH_BRIDGE=off; paired: the token file exists. */
  status(): BridgeStatus & { enabled: boolean; paired: boolean };
  /** Start listening in this process (idempotent; no-op when disabled). */
  start(): void;
  /** The pairing token, created on first use. */
  token(): string;
  /** The port the extension should use (configured, not necessarily bound yet). */
  readonly port: number;
  close(): Promise<void>;
}

/**
 * The listener is opt-in: it starts only once the learner paired an extension (token file exists)
 * or with LANGCOACH_BRIDGE=on. LANGCOACH_BRIDGE=off always disables it.
 */
export function createBridgeController(
  coach: Coach,
  opts: Omit<BridgeOptions, 'token'> & { dataDir: string; mode?: string | undefined },
): BridgeController {
  const enabled = opts.mode !== 'off';
  const tokenFile = join(opts.dataDir, 'bridge-token');
  const token = () => loadOrCreateToken(opts.dataDir);
  let bridge: Bridge | null = null;
  const port = opts.port ?? DEFAULT_BRIDGE_PORT;
  const start = () => {
    if (enabled && !bridge) bridge = startBridge(coach, { ...opts, token: () => readToken(opts.dataDir) });
  };
  if (opts.mode === 'on' || existsSync(tokenFile)) start();
  return {
    port,
    start,
    token,
    status: () => ({
      ...(bridge?.status() ?? {
        listening: false,
        port,
        receivedLessons: 0,
        receivedCards: 0,
        lastReceivedAt: null,
        lastPingAt: null,
        lastError: null,
      }),
      enabled,
      paired: existsSync(tokenFile),
    }),
    close: () => bridge?.close() ?? Promise.resolve(),
  };
}
