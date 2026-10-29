import { describe, expect, it, vi } from 'vitest';
import { openExperimentUrl, runScenario, type TabsApi } from '../src/sidepanel/tabs';

type Tab = { id: number; windowId: number; url?: string; active?: boolean };

function fakeApi(tabs: Tab[]) {
  const api = {
    tabs: {
      query: vi.fn(async (q: { url?: string | string[]; active?: boolean; currentWindow?: boolean }) => {
        if (q.active) return tabs.filter((t) => t.active);
        if (q.url) return tabs.filter((t) => t.url?.startsWith('https://labs.google/lll/'));
        return tabs;
      }),
      update: vi.fn(async (_id: number, _p: { active?: boolean; url?: string }) => ({})),
      create: vi.fn(async (_p: { url: string }) => ({})),
      sendMessage: vi.fn(async (_id: number, _m: unknown): Promise<unknown> => undefined),
    },
    windows: { update: vi.fn(async (_id: number, _p: { focused: boolean }) => ({})) },
  };
  return api as typeof api & TabsApi;
}

const TINY_EN = 'https://labs.google/lll/en/experiments/tiny-lesson';

describe('openExperimentUrl (I3)', () => {
  it('focuses an existing tab showing that experiment (any site language, any window)', async () => {
    const api = fakeApi([
      { id: 1, windowId: 10, url: 'https://example.com/', active: true },
      { id: 2, windowId: 20, url: 'https://labs.google/lll/es/experiments/tiny-lesson?x=1' },
    ]);
    await openExperimentUrl(TINY_EN, api);
    expect(api.tabs.update).toHaveBeenCalledWith(2, { active: true });
    expect(api.windows.update).toHaveBeenCalledWith(20, { focused: true });
    expect(api.tabs.create).not.toHaveBeenCalled();
    expect(api.tabs.update.mock.calls.some(([, p]) => 'url' in p)).toBe(false);
  });

  it('opens a new tab and never navigates an LLL tab that shows something else', async () => {
    const api = fakeApi([
      { id: 3, windowId: 10, url: 'https://labs.google/lll/en/experiments/slang-hang', active: true },
      { id: 4, windowId: 10, url: 'https://labs.google/lll/en' },
      { id: 5, windowId: 10, url: 'https://evil.example/lll/en/experiments/tiny-lesson' },
    ]);
    await openExperimentUrl(TINY_EN, api);
    expect(api.tabs.create).toHaveBeenCalledWith({ url: TINY_EN });
    expect(api.tabs.update).not.toHaveBeenCalled();
  });

  it('does not match a longer slug', async () => {
    const api = fakeApi([{ id: 6, windowId: 1, url: 'https://labs.google/lll/en/experiments/tiny-lesson-old' }]);
    await openExperimentUrl(TINY_EN, api);
    expect(api.tabs.create).toHaveBeenCalledWith({ url: TINY_EN });
  });
});

describe('openExperimentUrl never rejects (C10)', () => {
  it('a failing tabs.create resolves false instead of an unhandled rejection', async () => {
    const api = fakeApi([]);
    api.tabs.create.mockRejectedValueOnce(new Error('Tabs cannot be edited right now'));
    await expect(openExperimentUrl(TINY_EN, api)).resolves.toBe(false);
  });
  it('resolves true when it opened or focused a tab', async () => {
    const api = fakeApi([]);
    await expect(openExperimentUrl(TINY_EN, api)).resolves.toBe(true);
  });
});

describe('runScenario: panel → Tiny Lesson tab relay (C9)', () => {
  const FAST = { readyTimeoutMs: 200, pollMs: 5 };
  it('focuses an open Tiny Lesson tab and relays startScenario with the dropdown label', async () => {
    const api = fakeApi([{ id: 9, windowId: 4, url: TINY_EN }]);
    api.tabs.sendMessage.mockImplementation(async (_id, m) =>
      (m as { type: string }).type === 'ping' ? { ready: true } : { ok: true },
    );
    const r = await runScenario({ theme: 'tapas', targetLabel: 'Spanish (Spain)', url: TINY_EN }, api, FAST);
    expect(r).toEqual({ ok: true });
    expect(api.tabs.update).toHaveBeenCalledWith(9, { active: true });
    expect(api.windows.update).toHaveBeenCalledWith(4, { focused: true });
    expect(api.tabs.sendMessage).toHaveBeenCalledWith(9, {
      type: 'startScenario',
      theme: 'tapas',
      targetLabel: 'Spanish (Spain)',
    });
  });

  it('opens Tiny Lesson when no tab shows it, waits for the content script, then relays', async () => {
    const api = fakeApi([]);
    api.tabs.create.mockResolvedValueOnce({ id: 11, windowId: 2 } as never);
    let pings = 0;
    api.tabs.sendMessage.mockImplementation(async (_id, m) => {
      if ((m as { type: string }).type === 'ping') {
        if (++pings < 3) throw new Error('Receiving end does not exist');
        return { ready: true };
      }
      return { ok: false, reason: 'splash' };
    });
    const r = await runScenario({ theme: 'tapas', url: TINY_EN }, api, FAST);
    expect(api.tabs.create).toHaveBeenCalledWith({ url: TINY_EN });
    expect(pings).toBe(3);
    expect(r).toEqual({ ok: false, reason: 'splash' });
  });

  it('a tab that never answers → reason "unreachable" (panel offers the copy fallback)', async () => {
    const api = fakeApi([{ id: 9, windowId: 4, url: TINY_EN }]);
    api.tabs.sendMessage.mockRejectedValue(new Error('Receiving end does not exist'));
    expect(await runScenario({ theme: 'tapas', url: TINY_EN }, api, FAST)).toEqual({ ok: false, reason: 'unreachable' });
  });

  it('no chrome.tabs (tests/web) → reason "unreachable", never throws', async () => {
    expect(await runScenario({ theme: 'tapas', url: TINY_EN }, null, FAST)).toEqual({ ok: false, reason: 'unreachable' });
  });

  it('a garbage answer is treated as an error', async () => {
    const api = fakeApi([{ id: 9, windowId: 4, url: TINY_EN }]);
    api.tabs.sendMessage.mockImplementation(async (_id, m) =>
      (m as { type: string }).type === 'ping' ? { ready: true } : 'nope',
    );
    expect(await runScenario({ theme: 'tapas', url: TINY_EN }, api, FAST)).toEqual({ ok: false, reason: 'error' });
  });
});
