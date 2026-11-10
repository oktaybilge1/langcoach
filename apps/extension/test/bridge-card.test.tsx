// @vitest-environment jsdom
import { emptyState } from '@langcoach/core/browser';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BridgeStatus, Message, MessageMap, MessageType, ResponseOf, Settings, Snapshot } from '../src/shared/messages';
import { App, type PanelSend } from '../src/sidepanel/App';
import { createTranslator } from '../src/sidepanel/i18n';

const { t } = createTranslator('en');
const flush = async () => {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
};
const profile = {
  nativeLanguage: 'English',
  targetLanguage: 'Spanish (Spain)',
  level: 'A2' as const,
  goal: 'travel',
  minutesPerDay: 15,
  daysPerWeek: 5,
  createdAt: '2026-03-04T10:00:00Z',
};
const snapshot = (): Snapshot => {
  const st = emptyState();
  st.profile = profile;
  return {
    profile,
    today: { date: '2026-03-04', tasks: [], planExists: true },
    plan: { week: '2026-W10', theme: 'cafe', tasks: [] },
    progress: { streak: 0, totalXp: 0, weekly: { done: 0, planned: 0 }, dueCount: 0 },
    dueCount: 0,
    lastCapture: null,
    state: st,
  };
};

let host: HTMLDivElement;
beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
});
afterEach(() => {
  render(null, host);
  host.remove();
});

function mount(status: BridgeStatus) {
  let settings: Settings = {
    autoSave: true,
    reminderTime: null,
    uiLanguage: 'en',
    hasCamera: false,
    showNativeOnPage: true,
    soundEffects: true,
    bridgeEnabled: status.state !== 'off',
  };
  const send = vi.fn(async <K extends MessageType>(msg: { type: K } & MessageMap[K]['request']) => {
    const m = msg as Message;
    if (m.type === 'getSettings') return settings as ResponseOf<K>;
    if (m.type === 'getSnapshot') return snapshot() as ResponseOf<K>;
    if (m.type === 'setSettings') {
      settings = { ...settings, ...m.settings };
      status = { ...status, state: settings.bridgeEnabled ? 'connected' : 'off' };
      return settings as ResponseOf<K>;
    }
    if (m.type === 'bridgeStatus') return status as ResponseOf<K>;
    return null as ResponseOf<K>;
  });
  return send as unknown as PanelSend & typeof send;
}

const byTestId = (id: string) => host.querySelector<HTMLElement>(`[data-testid="${id}"]`);
async function open(send: PanelSend) {
  await act(async () => {
    render(<App send={send} initialTab="settings" />, host);
  });
  await flush();
  await flush();
}

describe('Settings: Your AI agent card', () => {
  it.each<[BridgeStatus['state'], string]>([
    ['connected', 'bridgeConnected'],
    ['waiting', 'bridgeWaiting'],
    ['unpaired', 'bridgeNotPaired'],
    ['unverified', 'bridgeUnverified'],
    ['off', 'bridgeOff'],
  ])('shows the %s status', async (state, key) => {
    await open(mount({ state, pending: 0, lastSentAt: null }));
    const card = byTestId('bridge-card')!;
    expect(card.querySelector('h2')!.textContent).toBe(t('bridgeSection'));
    expect(byTestId('bridge-status')!.textContent).toContain(t(key));
    expect(card.querySelector<HTMLAnchorElement>('a')!.href).toMatch(/^https:\/\/github\.com\/oktaybilge1\/langcoach/);
    expect(!!byTestId('bridge-pair-help')).toBe(state === 'unpaired');
  });

  it('shows the backlog count', async () => {
    await open(mount({ state: 'waiting', pending: 2, lastSentAt: null }));
    expect(byTestId('bridge-status')!.textContent).toContain(t('bridgePending', '2'));
  });

  it('the toggle saves bridgeEnabled and refreshes the status', async () => {
    const send = mount({ state: 'connected', pending: 0, lastSentAt: null });
    await open(send);
    const box = byTestId('pref-bridge') as HTMLInputElement;
    expect(box.checked).toBe(true);
    await act(async () => {
      box.click();
    });
    await flush();
    await flush();
    expect(send).toHaveBeenCalledWith({ type: 'setSettings', settings: { bridgeEnabled: false } });
    expect(byTestId('bridge-status')!.textContent).toContain(t('bridgeOff'));
  });
});
