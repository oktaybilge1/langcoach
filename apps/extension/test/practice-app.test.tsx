// @vitest-environment jsdom
import { emptyState, newSrs, type ReviewCard } from '@langcoach/core/browser';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, type MessageMap, type MessageType, type ResponseOf, type Snapshot } from '../src/shared/messages';
import { App, type PanelSend } from '../src/sidepanel/App';
import { createTranslatorCache } from '../src/lib/translate';

const profile = {
  nativeLanguage: 'English',
  targetLanguage: 'Spanish (Spain)',
  level: 'A2' as const,
  goal: 'travel',
  minutesPerDay: 15,
  daysPerWeek: 5,
  createdAt: '2026-03-01T10:00:00Z',
};

function snap(due: number): Snapshot {
  const st = emptyState();
  st.profile = profile;
  st.cards = Array.from({ length: 5 }, (_, i): ReviewCard => ({
    id: `c${i}`,
    lessonId: 'l1',
    term: `palabra${i}`,
    translation: `word${i}`,
    example: '',
    srs: newSrs(new Date('2026-03-01T00:00:00Z')),
  }));
  return {
    profile,
    today: { date: '2026-03-04', tasks: [], planExists: true },
    plan: null,
    progress: { streak: 0, totalXp: 0, weekly: { done: 0, planned: 5 }, dueCount: due },
    dueCount: due,
    lastCapture: null,
    state: st,
  };
}

let host: HTMLDivElement;
beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
});
afterEach(() => {
  render(null, host);
  host.remove();
});

const flush = async () => {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
};

function sendFor(s: Snapshot): PanelSend {
  return vi.fn(async <K extends MessageType>(msg: { type: K } & MessageMap[K]['request']) => {
    if (msg.type === 'getSettings') return { ...DEFAULT_SETTINGS, uiLanguage: 'en' } as ResponseOf<K>;
    if (msg.type === 'getSnapshot') return s as ResponseOf<K>;
    return null as ResponseOf<K>;
  }) as unknown as PanelSend;
}

const translator = createTranslatorCache(undefined);

describe('Practice tab wiring', () => {
  it('opens on Practice when cards are due, between Today and Review', async () => {
    await act(async () => {
      render(<App send={sendFor(snap(3))} translator={translator} />, host);
    });
    await flush();
    const tabs = [...host.querySelectorAll('.tab-bar [data-testid^="tab-"]')].map((b) => b.getAttribute('data-testid'));
    expect(tabs.slice(0, 3)).toEqual(['tab-today', 'tab-practice', 'tab-review']);
    expect(host.querySelector('[data-testid="tab-practice"]')!.getAttribute('aria-current')).toBe('page');
    expect(host.querySelector('[data-testid="practice-start"]')).not.toBeNull();
  });

  it('opens on Today when nothing is due; the Practice now CTA switches tabs', async () => {
    await act(async () => {
      render(<App send={sendFor(snap(0))} translator={translator} />, host);
    });
    await flush();
    expect(host.querySelector('[data-testid="tab-today"]')!.getAttribute('aria-current')).toBe('page');
    const cta = host.querySelector<HTMLButtonElement>('[data-testid="btn-practice-now"]')!;
    expect(cta).not.toBeNull();
    await act(async () => {
      cta.click();
    });
    await flush();
    expect(host.querySelector('[data-testid="tab-practice"]')!.getAttribute('aria-current')).toBe('page');
  });

  it('an explicit initialTab wins over the due-cards default', async () => {
    await act(async () => {
      render(<App send={sendFor(snap(3))} initialTab="settings" translator={translator} />, host);
    });
    await flush();
    expect(host.querySelector('[data-testid="tab-settings"]')!.getAttribute('aria-current')).toBe('page');
    expect(host.querySelector('[data-testid="pref-sound-effects"]')).not.toBeNull();
  });
});
