// @vitest-environment jsdom
import { emptyState } from '@langcoach/core/browser';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, type Message, type MessageMap, type MessageType, type ResponseOf, type Snapshot } from '../src/shared/messages';
import type { PanelSend } from '../src/sidepanel/App';
import { createTranslator } from '../src/sidepanel/i18n';
import { Onboarding } from '../src/sidepanel/views/Onboarding';
import { Settings } from '../src/sidepanel/views/Settings';

const { t } = createTranslator('en');
const profile = {
  nativeLanguage: 'Turkish',
  targetLanguage: 'Spanish (Spain)',
  level: 'A2' as const,
  goal: 'travel',
  minutesPerDay: 15,
  daysPerWeek: 5,
  createdAt: '2026-10-01T10:00:00Z',
  dailyGoalXp: 20 as const,
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
const $ = <T extends HTMLElement = HTMLElement>(sel: string) => host.querySelector<T>(sel);
const flush = async () => {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
};

function sender() {
  const calls: Message[] = [];
  const send = vi.fn(async <K extends MessageType>(msg: { type: K } & MessageMap[K]['request']) => {
    calls.push(msg as Message);
    if (msg.type === 'setProfile') return { ...profile, ...(msg as { profile: object }).profile } as ResponseOf<K>;
    return null as ResponseOf<K>;
  }) as unknown as PanelSend;
  return { calls, send };
}

describe('daily goal picker (D14)', () => {
  it('Onboarding offers Casual 10 / Regular 20 / Serious 30 / Intense 50 (radio group, Regular default)', async () => {
    const { calls, send } = sender();
    await act(async () => {
      render(<Onboarding settings={DEFAULT_SETTINGS} uiLocale="en" t={t} send={send} onComplete={async () => {}} />, host);
    });
    const group = $('[data-testid="goal-picker"]')!;
    expect(group.getAttribute('role')).toBe('radiogroup');
    const radios = [...group.querySelectorAll<HTMLInputElement>('input[type="radio"]')];
    expect(radios.map((r) => r.value)).toEqual(['10', '20', '30', '50']);
    expect(radios.find((r) => r.checked)!.value).toBe('20');
    expect(group.textContent).toContain(t('goalCasual'));
    expect(group.textContent).toContain(t('goalIntense'));

    await act(async () => {
      radios[3]!.click();
    });
    await act(async () => {
      $<HTMLFormElement>('[data-testid="onboard-form"]')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    await flush();
    const sp = calls.find((c) => c.type === 'setProfile') as Message & { type: 'setProfile' };
    expect(sp.profile.dailyGoalXp).toBe(50);
  });

  it('Settings saves a new daily goal right away with setProfile', async () => {
    const { calls, send } = sender();
    const st = emptyState();
    st.profile = profile;
    const snap: Snapshot = {
      profile,
      today: null,
      plan: null,
      progress: { streak: 0, totalXp: 0, weekly: { done: 0, planned: 0 }, dueCount: 0 },
      dueCount: 0,
      lastCapture: null,
      state: st,
    };
    const onRefresh = vi.fn(async () => {});
    await act(async () => {
      render(<Settings snapshot={snap} settings={DEFAULT_SETTINGS} t={t} send={send} onRefresh={onRefresh} />, host);
    });
    const radios = [...$('[data-testid="goal-picker"]')!.querySelectorAll<HTMLInputElement>('input[type="radio"]')];
    expect(radios.find((r) => r.checked)!.value).toBe('20');
    await act(async () => {
      radios[2]!.click();
    });
    await flush();
    const sp = calls.find((c) => c.type === 'setProfile') as Message & { type: 'setProfile' };
    expect(sp.profile).toMatchObject({ targetLanguage: 'Spanish (Spain)', level: 'A2', dailyGoalXp: 30 });
    expect(onRefresh).toHaveBeenCalled();
  });
});
