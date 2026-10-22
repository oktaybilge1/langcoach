import { describe, expect, it, vi } from 'vitest';
import { openExperimentUrl, requestFill, type TabsApi } from '../src/sidepanel/tabs';

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

describe('requestFill (I2)', () => {
  it('returns true only when the content script answers {filled:true}', async () => {
    const api = fakeApi([{ id: 7, windowId: 1, url: TINY_EN, active: true }]);
    api.tabs.sendMessage.mockResolvedValueOnce({ filled: true });
    expect(await requestFill('hotel', api)).toBe(true);
    expect(api.tabs.sendMessage).toHaveBeenCalledWith(7, { type: 'fillTheme', theme: 'hotel' });
    api.tabs.sendMessage.mockResolvedValueOnce({ filled: false });
    expect(await requestFill('hotel', api)).toBe(false);
    api.tabs.sendMessage.mockRejectedValueOnce(new Error('Receiving end does not exist'));
    expect(await requestFill('hotel', api)).toBe(false);
  });

  it('returns false without an active LLL tab', async () => {
    const api = fakeApi([{ id: 8, windowId: 1, url: 'https://example.com/', active: true }]);
    expect(await requestFill('hotel', api)).toBe(false);
    expect(api.tabs.sendMessage).not.toHaveBeenCalled();
  });
});
