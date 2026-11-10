import type { Lesson, Store } from '@langcoach/core/browser';
import { version as EXT_VERSION } from '../../public/manifest.json';
import type { BridgeState, BridgeStatus } from '../shared/messages';
import { SETTINGS_KEY } from './router';
import type { StorageAreaLike } from './store';

/**
 * The local langcoach MCP server (loopback only, token-paired; protocol in packages/mcp/src/bridge.ts).
 * The e2e build talks to a stub on another port, so tests never reach a real agent's data on this machine.
 */
export const BRIDGE_ORIGIN =
  typeof __E2E__ !== 'undefined' && __E2E__ ? 'http://127.0.0.1:47822' : 'http://127.0.0.1:47821';
export const BRIDGE_ALARM = 'langcoach-bridge';
export const BRIDGE_PERIOD_MIN = 2;
export const BRIDGE_TIMEOUT_MS = 4000;
/** Packaged by the agent's bridge_prepare_extension; never part of the store build. */
export const PAIRING_FILE = 'pairing.json';
/** chrome.storage.session cache of the pairing token (cleared when the browser closes; never synced). */
export const PAIRING_SESSION_KEY = 'langcoach:pairing';
/** Lesson ids the agent confirmed (saved or duplicate), oldest first. */
export const SENT_KEY = 'langcoach:bridgeSent';
/** Rejections per lesson id; a lesson rejected MAX_REJECTS times is not sent again. */
export const ERRORS_KEY = 'langcoach:bridgeErrors';
/** { state, lastSentAt, retryAt, failures } */
export const BRIDGE_STATE_KEY = 'langcoach:bridgeState';
export const MAX_SENT = 1000;
export const MAX_REJECTS = 3;
/** After a 401 the token is re-tried at most this often. */
export const UNPAIRED_RETRY_MS = 10 * 60_000;
/** Unverified server: back off 2, 4, 8, 16, then 30 minutes. */
export const MAX_BACKOFF_MS = 30 * 60_000;
const BATCH = 10;
const BACKLOG_LIMIT = 200;
const TOKEN_RE = /^[0-9a-f]{32,256}$/i;

export interface BridgeAlarms {
  create(name: string, info: { periodInMinutes: number }): unknown;
  clear(name: string): Promise<boolean> | unknown;
  get(name: string): Promise<unknown>;
}

export interface BridgeDeps {
  store: Store;
  area: StorageAreaLike;
  alarms: BridgeAlarms;
  /** Reads the packaged pairing file; resolves to its JSON or null. Defaults to fetch(chrome.runtime.getURL(...)). */
  readPairing?: () => Promise<unknown>;
  /** chrome.storage.session when available. */
  session?: StorageAreaLike;
  fetch?: typeof fetch;
  log?: (...a: unknown[]) => void;
  clock?: () => Date;
  timeoutMs?: number;
}

export interface BridgeResult {
  id: string;
  status: 'saved' | 'duplicate' | 'rejected';
  error?: string;
}

export interface FlushResult {
  /** Lesson ids confirmed in this flush. */
  sent: string[];
  /** Lessons still waiting. */
  pending: number;
  state: BridgeState;
}

export type BridgeClient = ReturnType<typeof createBridge>;

interface Persisted {
  state: BridgeState | null;
  lastSentAt: string | null;
  /** No network before this epoch ms (401 / unverified backoff). */
  retryAt: number;
  failures: number;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const hex = (b: ArrayBuffer | Uint8Array) =>
  Array.from(b instanceof Uint8Array ? b : new Uint8Array(b), (x) => x.toString(16).padStart(2, '0')).join('');
const STATES: readonly string[] = ['connected', 'waiting', 'unpaired', 'unverified', 'off'];

/** Constant-time string comparison (length is not secret: both are SHA-256 hex). */
export function ctEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

/** Lowercase hex HMAC-SHA256 with the UTF-8 bytes of `token` as key and of `nonce` as message. */
export async function hmacHex(token: string, nonce: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(token), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, enc.encode(nonce)));
}

/** The token of a valid pairing file ({"token":"<hex>","port":47821,"v":1}), else null. */
export function parsePairing(v: unknown): string | null {
  if (!isObj(v) || v.v !== 1 || typeof v.token !== 'string' || !TOKEN_RE.test(v.token)) return null;
  if (v.port !== Number(new URL(BRIDGE_ORIGIN).port)) return null;
  return v.token;
}

/** Server field caps: it rejects (never truncates) a lesson over them, so the client never sends one. */
const CAPS = { term: 200, translation: 500, example: 500, note: 500, pronunciation: 200 } as const;
const within = (v: unknown, max: number) => v === undefined || (typeof v === 'string' && v.length <= max);
const itemFits = (i: Lesson['items'][number]) =>
  (Object.keys(CAPS) as (keyof typeof CAPS)[]).every((k) => within(i[k], CAPS[k]));

/** The lesson as sent: items over the caps are skipped; null when nothing sendable is left. */
function payload(l: Lesson) {
  const items = l.items.filter(itemFits);
  const src = l.source;
  if (!items.length || l.situation.length > 200) return null;
  if (src && (!within(src.purpose, 100) || src.targetLanguage.length > 80 || src.sourceLanguage.length > 80)) return null;
  return {
    id: l.id,
    kind: l.kind,
    situation: l.situation,
    items: items.map((i) => ({
      term: i.term,
      translation: i.translation,
      example: i.example,
      ...(i.note !== undefined ? { note: i.note } : {}),
      ...(i.pronunciation !== undefined ? { pronunciation: i.pronunciation } : {}),
    })),
    ...(l.grammar ? { grammar: l.grammar } : {}),
    ...(l.source ? { source: l.source } : {}),
    capturedAt: l.createdAt,
  };
}

const defaultReadPairing = async (): Promise<unknown> => {
  const res = await fetch(chrome.runtime.getURL(PAIRING_FILE));
  return res.ok ? res.json() : null;
};

/** Bridge client. Never throws: every failure is logged (never the token) and leaves the lesson in the backlog. */
export function createBridge(deps: BridgeDeps) {
  const { store, area, alarms } = deps;
  const doFetch = deps.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  const log = deps.log ?? ((...a: unknown[]) => console.warn(...a));
  const clock = deps.clock ?? (() => new Date());
  const timeoutMs = deps.timeoutMs ?? BRIDGE_TIMEOUT_MS;
  let token: string | null | undefined; // undefined: not read yet in this worker

  let tail: Promise<unknown> = Promise.resolve();
  const serialized = <T>(task: () => Promise<T>): Promise<T> => {
    const next = tail.then(task, task);
    tail = next.catch(() => undefined);
    return next;
  };

  /** Memory, then the session cache, then the packaged file. */
  async function getToken(): Promise<string | null> {
    if (token !== undefined) return token;
    try {
      const cached = deps.session ? (await deps.session.get(PAIRING_SESSION_KEY))[PAIRING_SESSION_KEY] : undefined;
      if (typeof cached === 'string' && TOKEN_RE.test(cached)) return (token = cached);
    } catch {
      /* no session storage */
    }
    try {
      token = parsePairing(await (deps.readPairing ?? defaultReadPairing)());
    } catch {
      token = null; // no pairing file: not paired
    }
    if (token && deps.session) await deps.session.set({ [PAIRING_SESSION_KEY]: token }).catch(() => undefined);
    return token;
  }

  /** Status code and JSON body, or null on network failure / timeout / bad JSON. */
  async function request(path: string, init: RequestInit): Promise<{ status: number; body: Record<string, unknown> | null } | null> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await doFetch(`${BRIDGE_ORIGIN}${path}`, { ...init, signal: ctrl.signal });
      let body: unknown = null;
      try {
        body = await res.json();
      } catch {
        /* not JSON */
      }
      return { status: res.status, body: isObj(body) ? body : null };
    } catch {
      return null; // agent not running (connection refused) or timed out
    } finally {
      clearTimeout(timer);
    }
  }

  async function enabled(): Promise<boolean> {
    const st = (await area.get(SETTINGS_KEY))[SETTINGS_KEY];
    return !(isObj(st) && st.bridgeEnabled === false);
  }

  async function readState(): Promise<{ sent: string[]; errors: Record<string, number>; p: Persisted }> {
    const got = await area.get([SENT_KEY, ERRORS_KEY, BRIDGE_STATE_KEY]);
    const sent = Array.isArray(got[SENT_KEY]) ? (got[SENT_KEY] as unknown[]).filter((x): x is string => typeof x === 'string') : [];
    const errors: Record<string, number> = {};
    if (isObj(got[ERRORS_KEY])) {
      for (const [k, v] of Object.entries(got[ERRORS_KEY])) if (typeof v === 'number') errors[k] = v;
    }
    const b = isObj(got[BRIDGE_STATE_KEY]) ? got[BRIDGE_STATE_KEY] : {};
    return {
      sent,
      errors,
      p: {
        state: STATES.includes(b.state as string) ? (b.state as BridgeState) : null,
        lastSentAt: typeof b.lastSentAt === 'string' ? b.lastSentAt : null,
        retryAt: typeof b.retryAt === 'number' ? b.retryAt : 0,
        failures: typeof b.failures === 'number' ? b.failures : 0,
      },
    };
  }

  /** LLL lessons not confirmed yet and not given up on, newest BACKLOG_LIMIT in time order. */
  async function backlog(sent: string[], errors: Record<string, number>): Promise<Lesson[]> {
    const done = new Set(sent);
    const lessons = (await store.load()).lessons.filter(
      (l) => l.source?.app === 'lll' && !done.has(l.id) && (errors[l.id] ?? 0) < MAX_REJECTS && payload(l) !== null,
    );
    return lessons.slice(-BACKLOG_LIMIT);
  }

  /**
   * Authenticates the server before anything is sent: it must answer a fresh nonce with
   * HMAC-SHA256(token, nonce). 'waiting' = nobody answered; 'unverified' = something answered without proof.
   */
  async function ping(): Promise<'connected' | 'waiting' | 'unverified' | 'unpaired'> {
    const tk = await getToken();
    if (!tk) return 'unpaired';
    const nonce = hex(crypto.getRandomValues(new Uint8Array(16)));
    const r = await request(`/v1/ping?nonce=${nonce}`, { method: 'GET', headers: { 'X-LangCoach': '1' } });
    if (!r) return 'waiting';
    const b = r.body;
    if (r.status !== 200 || !b || b.ok !== true || b.app !== 'langcoach' || typeof b.proof !== 'string') return 'unverified';
    return ctEqual(b.proof.toLowerCase(), await hmacHex(tk, nonce)) ? 'connected' : 'unverified';
  }

  /**
   * Posts in batches of BATCH to an already verified server; stops at the first failed batch.
   * `results` is null when nothing reached the agent; `unauthorized` on a 401 (token not accepted).
   */
  async function sendLessons(lessons: Lesson[]): Promise<{ results: BridgeResult[] | null; unauthorized: boolean }> {
    const tk = await getToken();
    if (!tk) return { results: null, unauthorized: true };
    const out: BridgeResult[] = [];
    for (let i = 0; i < lessons.length; i += BATCH) {
      const r = await request('/v1/lessons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-LangCoach': '1', 'X-LangCoach-Token': tk },
        body: JSON.stringify({
          client: { name: 'langcoach-extension', version: EXT_VERSION },
          lessons: lessons.slice(i, i + BATCH).flatMap((l) => payload(l) ?? []),
        }),
      });
      if (r?.status === 401) return { results: out.length ? out : null, unauthorized: true };
      if (!r || r.status !== 200 || !r.body || r.body.ok !== true || !Array.isArray(r.body.results)) {
        return { results: out.length ? out : null, unauthorized: false };
      }
      for (const x of r.body.results) {
        if (isObj(x) && typeof x.id === 'string' && ['saved', 'duplicate', 'rejected'].includes(x.status as string)) {
          out.push(x as unknown as BridgeResult);
        }
      }
    }
    return { results: out, unauthorized: false };
  }

  async function syncAlarm(on: boolean): Promise<void> {
    if (!on) await alarms.clear(BRIDGE_ALARM);
    else if (!(await alarms.get(BRIDGE_ALARM))) await alarms.create(BRIDGE_ALARM, { periodInMinutes: BRIDGE_PERIOD_MIN });
  }

  async function flushOnce(): Promise<FlushResult> {
    if (!(await enabled())) {
      await syncAlarm(false);
      return { sent: [], pending: 0, state: 'off' };
    }
    const { sent, errors, p } = await readState();
    const todo = await backlog(sent, errors);
    if (!(await getToken())) {
      await syncAlarm(false); // the pairing file only appears with a reinstall, which restarts the worker
      await area.set({ [BRIDGE_STATE_KEY]: { ...p, state: 'unpaired' } });
      return { sent: [], pending: todo.length, state: 'unpaired' };
    }
    const now = clock().getTime();
    if (p.retryAt > now && p.state) {
      await syncAlarm(true);
      return { sent: [], pending: todo.length, state: p.state };
    }

    let state: BridgeState = await ping();
    const confirmed: string[] = [];
    const next: Persisted = { ...p, retryAt: 0, failures: 0 };
    if (state === 'connected' && todo.length) {
      const { results, unauthorized } = await sendLessons(todo);
      if (unauthorized) state = 'unpaired';
      else if (results === null) state = 'waiting';
      const known = new Set(todo.map((l) => l.id));
      for (const r of results ?? []) {
        if (!known.has(r.id)) continue;
        if (r.status === 'rejected') {
          errors[r.id] = (errors[r.id] ?? 0) + 1;
          log(`LangCoach: the agent rejected lesson ${r.id}: ${r.error ?? 'no reason given'}`);
        } else {
          confirmed.push(r.id);
          delete errors[r.id];
        }
      }
    }
    if (state === 'unpaired') {
      next.retryAt = now + UNPAIRED_RETRY_MS;
      log('LangCoach: the agent did not accept this extension\'s pairing; reinstall it from your agent');
    } else if (state === 'unverified') {
      next.failures = p.failures + 1;
      next.retryAt = now + Math.min(BRIDGE_PERIOD_MIN * 60_000 * 2 ** (next.failures - 1), MAX_BACKOFF_MS);
      log('LangCoach: something on the bridge port did not prove it is your LangCoach agent; nothing was sent');
    }
    next.state = state;
    if (confirmed.length) next.lastSentAt = clock().toISOString();

    const items: Record<string, unknown> = { [BRIDGE_STATE_KEY]: next };
    if (confirmed.length) items[SENT_KEY] = [...new Set([...sent, ...confirmed])].slice(-MAX_SENT);
    if (todo.length) {
      // Keep counters only for lessons still in the backlog, so the map stays small.
      items[ERRORS_KEY] = Object.fromEntries(Object.entries(errors).filter(([id]) => todo.some((l) => l.id === id)));
    }
    await area.set(items);
    const pending = todo.filter((l) => !confirmed.includes(l.id) && (errors[l.id] ?? 0) < MAX_REJECTS).length;
    await syncAlarm(pending > 0 || state !== 'connected');
    return { sent: confirmed, pending, state };
  }

  async function flush(): Promise<FlushResult> {
    return serialized(async () => {
      try {
        return await flushOnce();
      } catch (e) {
        log('LangCoach: agent bridge flush failed', e);
        return { sent: [], pending: 0, state: 'waiting' };
      }
    });
  }

  async function status(): Promise<BridgeStatus> {
    try {
      const { sent, errors, p } = await readState();
      if (!(await enabled())) return { state: 'off', pending: 0, lastSentAt: p.lastSentAt };
      const pending = (await backlog(sent, errors)).length;
      // A 401 is remembered until its retry time: a ping cannot tell that the token was refused.
      const state = p.state === 'unpaired' && p.retryAt > clock().getTime() ? 'unpaired' : await ping();
      return { state, pending, lastSentAt: p.lastSentAt };
    } catch (e) {
      log('LangCoach: agent bridge status failed', e);
      return { state: 'waiting', pending: 0, lastSentAt: null };
    }
  }

  return {
    ping,
    sendLessons,
    flush,
    status,
    /** chrome.alarms listener: flushes on the bridge alarm only. */
    async onAlarm(alarm: { name: string }): Promise<void> {
      if (alarm.name === BRIDGE_ALARM) await flush();
    },
  };
}
