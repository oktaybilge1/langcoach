// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startIsolated, NONCE_ATTR } from '../src/content/isolated';
import { startMain } from '../src/content/main';
import type { Toaster, ToastSpec } from '../src/content/toast';

const TERMS = 'https://labs.google/lll/api/insights/terms';
const req = { sourceLanguage: 'English', targetLanguage: 'European Spanish', purpose: 'coffee' };
const flush = () => new Promise((r) => setTimeout(r, 0));
const t = (k: string, subs?: string | string[]) => (subs === undefined ? k : `${k}:${([] as string[]).concat(subs).join(',')}`);

function fakeToaster() {
  const shown: ToastSpec[] = [];
  const toaster: Toaster = { show: (s) => void shown.push(s), hide: vi.fn(), root: null };
  const last = () => shown.at(-1);
  const click = (label: string) => last()!.actions!.find((a) => a.label === label)!.onClick();
  return { toaster, shown, last, click };
}

function setupIsolated(reply: (msg: Record<string, unknown>) => unknown = () => ({ ok: true, data: null })) {
  const sent: Record<string, unknown>[] = [];
  const sendMessage = vi.fn(async (m: unknown) => {
    const rec = m as Record<string, unknown>;
    sent.push(rec);
    return reply(rec);
  });
  let onMsg: ((m: unknown, sender: { id?: string }, sendResponse: (r: unknown) => void) => void) | undefined;
  const tt = fakeToaster();
  const iso = startIsolated({
    win: window,
    runtimeId: 'ext-id',
    sendMessage,
    onMessage: { addListener: (fn) => void (onMsg = fn) },
    t,
    toaster: tt.toaster,
  });
  const post = (data: unknown, init: Partial<MessageEventInit> = {}) =>
    window.dispatchEvent(new MessageEvent('message', { data, origin: location.origin, source: window, ...init }));
  const capture = (extra: Record<string, unknown> = {}) =>
    post({ source: 'langcoach-capture', nonce: iso.nonce, kind: 'terms', request: req, response: { a: 1 }, url: TERMS, ...extra });
  return { iso, sent, sendMessage, tt, post, capture, bg: (m: unknown, id = 'ext-id') => onMsg!(m, { id }, () => {}) };
}

beforeEach(() => {
  document.documentElement.removeAttribute(NONCE_ATTR);
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('isolated content script', () => {
  it('publishes a random per-page nonce on documentElement', () => {
    const { iso } = setupIsolated();
    expect(iso.nonce).toMatch(/^[0-9a-f]{32}$/);
    expect(document.documentElement.getAttribute(NONCE_ATTR)).toBe(iso.nonce);
  });

  it('forwards a valid capture to the background', async () => {
    const { capture, sent } = setupIsolated();
    capture();
    await flush();
    expect(sent).toEqual([{ type: 'capture', kind: 'terms', request: req, response: { a: 1 }, pageUrl: location.href }]);
  });

  it.each<[string, Record<string, unknown>, Partial<MessageEventInit>]>([
    ['wrong nonce', { nonce: 'f'.repeat(32) }, {}],
    ['missing nonce', { nonce: undefined }, {}],
    ['wrong data.source', { source: 'someone' }, {}],
    ['foreign origin', {}, { origin: 'https://evil.example' }],
    ['source is not this window', {}, { source: null }],
  ])('drops captures with %s', async (_n, extra, init) => {
    const { iso, post, sent } = setupIsolated();
    post({ source: 'langcoach-capture', nonce: iso.nonce, kind: 'terms', request: req, response: {}, url: TERMS, ...extra }, init);
    await flush();
    expect(sent).toEqual([]);
  });

  it('removes the nonce attribute after the main world acknowledges it', () => {
    const { iso, post } = setupIsolated();
    post({ source: 'langcoach-ack', nonce: 'nope' });
    expect(document.documentElement.hasAttribute(NONCE_ATTR)).toBe(true);
    post({ source: 'langcoach-ack', nonce: iso.nonce });
    expect(document.documentElement.hasAttribute(NONCE_ATTR)).toBe(false);
  });

  it('saved → toast with count, xp, Undo and Open; Undo sends lesson ids and shows Removed', async () => {
    const { capture, sent, tt } = setupIsolated((m) =>
      m.type === 'capture'
        ? { ok: true, data: { status: 'saved', lessonIds: ['L1', 'L2'], newCards: 12, duplicates: 0, xp: 20 } }
        : m.type === 'undo'
          ? { ok: true, data: { removedCards: 12 } }
          : { ok: true, data: null },
    );
    capture();
    await flush();
    expect(tt.last()?.text).toBe('toastSaved:12 · toastXp:20');
    expect(tt.last()?.actions?.map((a) => a.label)).toEqual(['toastUndo', 'toastOpen']);
    tt.click('toastUndo');
    await flush();
    expect(sent.at(-1)).toEqual({ type: 'undo', lessonIds: ['L1', 'L2'] });
    expect(tt.last()).toEqual({ text: 'toastRemoved' });
  });

  it('Open asks the background to open the side panel (from the click handler)', async () => {
    const { capture, sent, tt } = setupIsolated((m) =>
      m.type === 'capture' ? { ok: true, data: { status: 'saved', lessonIds: ['L'], newCards: 1, duplicates: 0, xp: 0 } } : { ok: true, data: null },
    );
    capture();
    await flush();
    expect(tt.last()?.text).toBe('toastSaved:1'); // no xp suffix when xp is 0
    tt.click('toastOpen');
    expect(sent.at(-1)).toEqual({ type: 'openPanel' }); // sent synchronously in the gesture
    expect(tt.toaster.hide).toHaveBeenCalled();
  });

  it('only duplicates → "Already in your deck"', async () => {
    const { capture, tt } = setupIsolated(() => ({ ok: true, data: { status: 'saved', lessonIds: ['L'], newCards: 0, duplicates: 5, xp: 20 } }));
    capture();
    await flush();
    expect(tt.last()?.text).toBe('toastAlready · toastXp:20');
    expect(tt.last()?.actions?.map((a) => a.label)).toEqual(['toastOpen']);
  });

  it('autoSave off → "Save N words" re-sends the capture with force:true', async () => {
    const { capture, sent, tt } = setupIsolated((m) =>
      m.force
        ? { ok: true, data: { status: 'saved', lessonIds: ['L'], newCards: 20, duplicates: 0, xp: 20 } }
        : { ok: true, data: { status: 'pending', count: 20 } },
    );
    capture();
    await flush();
    expect(tt.last()?.actions?.map((a) => a.label)).toEqual(['toastSaveN:20']);
    tt.click('toastSaveN:20');
    await flush();
    expect(sent.at(-1)).toEqual({ type: 'capture', kind: 'terms', request: req, response: { a: 1 }, pageUrl: location.href, force: true });
    expect(tt.last()?.text).toBe('toastSaved:20 · toastXp:20');
  });

  it('shows nothing for errors, ignored captures, grammar, or a dead background', async () => {
    for (const reply of [
      () => ({ ok: false, error: { name: 'Error', message: 'x' } }),
      () => ({ ok: true, data: null }),
      () => ({ ok: true, data: { status: 'grammar' } }),
      () => {
        throw new Error('Extension context invalidated');
      },
      () => undefined,
    ]) {
      const { capture, tt } = setupIsolated(reply);
      capture();
      await flush();
      expect(tt.shown).toEqual([]);
    }
  });

  it('shows manual-save toasts sent by the background (context menu), only from this extension', () => {
    const { bg, tt } = setupIsolated();
    bg({ type: 'toast', variant: 'manual' }, 'other-ext');
    expect(tt.shown).toEqual([]);
    bg({ type: 'toast', variant: 'manual' });
    expect(tt.last()?.text).toBe('toastSavedManual');
    expect(tt.last()?.actions?.map((a) => a.label)).toEqual(['toastOpen']);
    bg({ type: 'toast', variant: 'already' });
    expect(tt.last()?.text).toBe('toastAlready');
  });
});

describe('main-world script', () => {
  let posted: [unknown, string][];
  beforeEach(() => {
    posted = [];
    vi.spyOn(window, 'postMessage').mockImplementation(((d: unknown, o: string) => void posted.push([d, o])) as never);
  });

  const okFetch = () =>
    vi.fn(async () => new Response(JSON.stringify({ vocabulary: [] }), { status: 200 })) as unknown as typeof fetch;

  it('reads the nonce, acknowledges it, and posts captures to the same origin', async () => {
    document.documentElement.setAttribute(NONCE_ATTR, 'n'.repeat(32));
    window.fetch = okFetch();
    startMain(window, { allowDevHosts: false });
    expect(posted[0]).toEqual([{ source: 'langcoach-ack', nonce: 'n'.repeat(32) }, location.origin]);
    const res = await window.fetch(TERMS, { method: 'POST', body: JSON.stringify(req) });
    expect(res).toBeInstanceOf(Response);
    await flush();
    expect(posted[1]).toEqual([
      { source: 'langcoach-capture', nonce: 'n'.repeat(32), kind: 'terms', request: req, response: { vocabulary: [] }, url: TERMS },
      location.origin,
    ]);
  });

  it('reads the nonce lazily if the isolated script ran later', async () => {
    window.fetch = okFetch();
    startMain(window, { allowDevHosts: false });
    expect(posted).toEqual([]);
    document.documentElement.setAttribute(NONCE_ATTR, 'm'.repeat(32));
    await window.fetch(TERMS, { method: 'POST', body: JSON.stringify(req) });
    await flush();
    expect(posted.map(([d]) => (d as { source: string }).source)).toEqual(['langcoach-ack', 'langcoach-capture']);
  });

  it('drops captures when no nonce exists and never throws into the page', async () => {
    window.fetch = okFetch();
    startMain(window, { allowDevHosts: false });
    await window.fetch(TERMS, { method: 'POST', body: JSON.stringify(req) });
    await flush();
    expect(posted).toEqual([]);

    document.documentElement.setAttribute(NONCE_ATTR, 'k'.repeat(32));
    vi.mocked(window.postMessage).mockImplementation(() => {
      throw new DOMException('could not be cloned', 'DataCloneError');
    });
    window.fetch = okFetch();
    startMain(window, { allowDevHosts: false });
    await expect(window.fetch(TERMS, { method: 'POST', body: JSON.stringify(req) })).resolves.toBeInstanceOf(Response);
    await flush();
  });

  it('installs only once', () => {
    document.documentElement.setAttribute(NONCE_ATTR, 'n'.repeat(32));
    const f = okFetch();
    window.fetch = f;
    startMain(window, { allowDevHosts: false });
    const wrapped = window.fetch;
    startMain(window, { allowDevHosts: false });
    expect(window.fetch).toBe(wrapped);
    expect(window.fetch).not.toBe(f);
  });
});
