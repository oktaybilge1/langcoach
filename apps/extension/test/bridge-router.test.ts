import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Coach } from '@langcoach/core/browser';
import { describe, expect, it, vi } from 'vitest';
import type { FlushResult } from '../src/background/bridge';
import { isAllowed } from '../src/background/policy';
import { createRouter } from '../src/background/router';
import { ChromeStorageStore } from '../src/background/store';
import type { BridgeStatus, CaptureResult, Message, Settings } from '../src/shared/messages';
import { fakeArea } from './chrome-fake';

const fx = (n: string): unknown =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`./fixtures/${n}`, import.meta.url)), 'utf8'));
const capture = {
  type: 'capture',
  kind: 'terms',
  request: { sourceLanguage: 'English', targetLanguage: 'European Spanish', purpose: 'ordering coffee at a cafe' },
  response: fx('terms-es.json'),
  pageUrl: 'https://labs.google/lll/en/experiments/tiny-lesson',
};

type Res<T> = { ok: boolean; data?: T; error?: { code?: string } };

function setup(flush: () => Promise<FlushResult>) {
  const area = fakeArea();
  const store = new ChromeStorageStore(area);
  const coach = new Coach(store, () => new Date('2026-11-09T10:00:00Z'));
  const bridge = {
    flush: vi.fn(flush),
    status: vi.fn(async (): Promise<BridgeStatus> => ({ state: 'connected', pending: 0, lastSentAt: null })),
  };
  const log = vi.fn();
  const router = createRouter({ coach, store, area, log, bridge });
  const call = <T>(m: Record<string, unknown>) => router.handle(m as Message, { tabId: 1 }) as Promise<Res<T>>;
  return { call, bridge, log, store };
}

describe('router: bridge', () => {
  it('bridgeEnabled defaults to true and is validated', async () => {
    const { call } = setup(async () => ({ sent: [], pending: 0, state: 'connected' as const }));
    expect((await call<Settings>({ type: 'getSettings' })).data!.bridgeEnabled).toBe(true);
    const off = await call<Settings>({ type: 'setSettings', settings: { bridgeEnabled: false } });
    expect(off.data!.bridgeEnabled).toBe(false);
    const bad = await call({ type: 'setSettings', settings: { bridgeEnabled: 'yes' } });
    expect(bad).toMatchObject({ ok: false, error: { code: 'invalid' } });
  });

  it('capture flushes once after the save and marks the result forwarded when the agent took it', async () => {
    const { call, bridge, store } = setup(async () => {
      const ids = (await store.load()).lessons.map((l) => l.id);
      return { sent: ids, pending: 0, state: 'connected' as const };
    });
    const r = await call<CaptureResult>(capture);
    expect(r.data).toMatchObject({ status: 'saved', forwarded: true });
    expect(bridge.flush).toHaveBeenCalledTimes(1);
  });

  it('a bridge failure never affects the capture', async () => {
    const { call, log, store } = setup(async () => {
      throw new Error('boom');
    });
    const r = await call<CaptureResult>(capture);
    expect(r.ok).toBe(true);
    expect(r.data).toMatchObject({ status: 'saved' });
    expect((r.data as { forwarded?: boolean }).forwarded).toBeUndefined();
    expect((await store.load()).lessons).toHaveLength(1);
    expect(log).toHaveBeenCalled();
  });

  it('not forwarded when the agent is not there', async () => {
    const { call } = setup(async () => ({ sent: [], pending: 1, state: 'waiting' as const }));
    const r = await call<CaptureResult>(capture);
    expect((r.data as { forwarded?: boolean }).forwarded).toBeUndefined();
  });

  it('bridgeStatus answers from the bridge', async () => {
    const { call, bridge } = setup(async () => ({ sent: [], pending: 0, state: 'connected' as const }));
    expect((await call<BridgeStatus>({ type: 'bridgeStatus' })).data).toEqual({ state: 'connected', pending: 0, lastSentAt: null });
    expect(bridge.status).toHaveBeenCalledOnce();
  });

  it('bridgeStatus is for extension pages only', () => {
    const ID = 'abc';
    const ORIGIN = 'chrome-extension://abc/';
    expect(isAllowed('bridgeStatus', { id: ID, url: `${ORIGIN}sidepanel.html` }, ID, ORIGIN, false)).toBe(true);
    expect(isAllowed('bridgeStatus', { id: ID, url: 'https://labs.google/lll/en', tab: {} }, ID, ORIGIN, false)).toBe(false);
  });
});
