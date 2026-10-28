// @vitest-environment jsdom
import { emptyState } from '@langcoach/core/browser';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { suggestThemes } from '../src/lib/themes';
import type { Message, MessageMap, MessageType, ResponseOf, Snapshot } from '../src/shared/messages';
import type { PanelSend } from '../src/sidepanel/App';
import { createTranslator } from '../src/sidepanel/i18n';
import { Today } from '../src/sidepanel/views/Today';

const { t } = createTranslator('en');
const TINY = 'https://labs.google/lll/en/experiments/tiny-lesson';

const profile = {
  nativeLanguage: 'Turkish',
  targetLanguage: 'Spanish (Spain)',
  level: 'A2' as const,
  goal: 'travel',
  minutesPerDay: 15,
  daysPerWeek: 5,
  createdAt: '2026-10-01T10:00:00Z',
};

function snap(over: Partial<Snapshot> = {}, progress: Partial<Snapshot['progress']> = {}): Snapshot {
  const st = emptyState();
  st.profile = profile;
  return {
    profile,
    today: { date: '2026-10-22', tasks: [], planExists: true },
    plan: null,
    progress: {
      streak: 4,
      totalXp: 120,
      weekly: { done: 1, planned: 5 },
      dueCount: 3,
      todayXp: 12,
      dailyGoalXp: 20,
      streakFreezes: 2,
      ...progress,
    },
    dueCount: 3,
    lastCapture: null,
    state: st,
    ...over,
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
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => host.querySelector<T>(sel);
const $$ = (sel: string) => [...host.querySelectorAll<HTMLElement>(sel)];
const flush = async (n = 1) => {
  for (let i = 0; i < n; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
};
const click = async (el: Element | null) => {
  expect(el, 'element to click').not.toBeNull();
  await act(async () => {
    (el as HTMLElement).click();
  });
  await flush(3);
};

function harness(s = snap(), opts: { reduced?: boolean } = {}) {
  const calls: Message[] = [];
  const send = vi.fn(async <K extends MessageType>(msg: { type: K } & MessageMap[K]['request']) => {
    calls.push(msg as Message);
    return null as ResponseOf<K>;
  }) as unknown as PanelSend;
  const onRefresh = vi.fn(async () => {});
  const onOpenPractice = vi.fn();
  const mount = async (x = s) => {
    await act(async () => {
      render(
        <Today
          snapshot={x}
          uiLocale="en"
          t={t}
          send={send}
          onRefresh={onRefresh}
          onOpenReview={() => {}}
          onOpenPractice={onOpenPractice}
          reducedMotion={opts.reduced ?? false}
        />,
        host,
      );
    });
    await flush();
  };
  return { calls, send, onRefresh, onOpenPractice, mount };
}

/** chrome.tabs with an open Tiny Lesson tab whose content script answers `answer` to startScenario. */
function stubTabs(answer: unknown) {
  const writeText = vi.fn(async () => {});
  vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
  const sendMessage = vi.fn(async (_id: number, m: { type: string }) => (m.type === 'ping' ? { ready: true } : answer));
  const create = vi.fn(async () => ({ id: 77 }));
  vi.stubGlobal('chrome', {
    tabs: {
      query: vi.fn(async () => [{ id: 9, windowId: 1, url: TINY }]),
      sendMessage,
      update: vi.fn(async () => ({})),
      create,
    },
    windows: { update: vi.fn(async () => ({})) },
  });
  return { writeText, sendMessage, create };
}

describe('Today: goal ring and streak (D12)', () => {
  it('goal ring shows today XP against the daily goal as an accessible progressbar', async () => {
    const h = harness();
    await h.mount();
    const ring = $('[data-testid="goal-ring"]')!;
    expect(ring.getAttribute('role')).toBe('progressbar');
    expect(ring.getAttribute('aria-valuenow')).toBe('12');
    expect(ring.getAttribute('aria-valuemax')).toBe('20');
    expect($('[data-testid="today-goal-text"]')!.textContent).toBe(t('pxGoalLine', ['12', '20']));
    expect(ring.classList.contains('is-met')).toBe(false);
  });

  it('a met goal is celebrated', async () => {
    const h = harness(snap({}, { todayXp: 25 }));
    await h.mount();
    expect($('[data-testid="goal-ring"]')!.classList.contains('is-met')).toBe(true);
    expect($('[data-testid="goal-ring"]')!.getAttribute('aria-valuenow')).toBe('20');
    expect(host.textContent).toContain(t('todayGoalMet'));
  });

  it('streak flame with freezes count; animated unless reduced motion', async () => {
    const h = harness();
    await h.mount();
    expect($('[data-testid="today-streak"]')!.textContent).toBe('4');
    expect($('[data-testid="streak-freezes"]')!.textContent).toContain('2');
    expect($('[data-testid="streak-freezes"]')!.getAttribute('aria-label')).toBe(t('streakFreezesLabel', '2'));
    expect($('[data-testid="streak-flame"]')!.classList.contains('animated')).toBe(true);
    const r = harness(snap(), { reduced: true });
    await r.mount();
    expect($('[data-testid="streak-flame"]')!.classList.contains('animated')).toBe(false);
  });

  it('a zero streak shows an unlit flame', async () => {
    const h = harness(snap({}, { streak: 0 }));
    await h.mount();
    expect($('[data-testid="streak-flame"]')!.classList.contains('off')).toBe(true);
  });
});

describe('Today: one-tap scenarios (D12)', () => {
  const themes = suggestThemes('travel', 'A2', 'en', 0).slice(0, 3);

  it('shows 3 scenario cards from suggestThemes', async () => {
    const h = harness();
    await h.mount();
    expect($$('[data-testid="scenario-card"]').map((c) => c.querySelector('.scenario-theme')!.textContent)).toEqual(themes);
  });

  it('Start relays startScenario to the Tiny Lesson tab with the dropdown label', async () => {
    const tabs = stubTabs({ ok: true });
    const h = harness();
    await h.mount();
    await click($$('[data-testid="btn-scenario-start"]')[1]!);
    await flush(5);
    expect(tabs.sendMessage).toHaveBeenCalledWith(9, {
      type: 'startScenario',
      theme: themes[1],
      targetLabel: 'Spanish (Spain)',
    });
    expect($$('[data-testid="scenario-card"]')[1]!.textContent).toContain(t('scenarioStarted'));
    expect(tabs.writeText).not.toHaveBeenCalled();
  });

  it.each([
    ['splash', 'scenarioHintSplash'],
    ['language', 'scenarioHintLanguage'],
    ['generate', 'scenarioHintGenerate'],
    ['field', 'scenarioHintGeneric'],
  ])('failure "%s" shows a hint, a copy fallback and "Open Tiny Lesson"', async (reason, hintKey) => {
    const tabs = stubTabs({ ok: false, reason });
    const h = harness();
    await h.mount();
    await click($$('[data-testid="btn-scenario-start"]')[0]!);
    await flush(5);
    const card = $$('[data-testid="scenario-card"]')[0]!;
    expect(card.querySelector('[role="status"]')!.textContent).toContain(t(hintKey));
    expect(card.querySelector('[data-testid="btn-scenario-open"]')).not.toBeNull();
    await click(card.querySelector('[data-testid="btn-scenario-copy"]'));
    expect(tabs.writeText).toHaveBeenCalledWith(themes[0]);
    expect(card.querySelector('[role="status"]')!.textContent).toContain(t('themeCopiedPaste'));
    expect(card.querySelector('[data-testid="btn-scenario-open"]')).not.toBeNull();
  });

  it('"More ideas" shows three different scenarios', async () => {
    const h = harness();
    await h.mount();
    await click($('[data-testid="btn-more-scenarios"]'));
    const now = $$('[data-testid="scenario-card"] .scenario-theme').map((e) => e.textContent);
    expect(now).toHaveLength(3);
    expect(now).not.toEqual(themes);
  });
});

describe('Today: banners, practice CTAs (D12)', () => {
  it('rollover banners are shown until dismissed (dismissBanner)', async () => {
    const h = harness(
      snap({
        banners: [
          { id: 'freezeUsed:2026-10-21', kind: 'freezeUsed', date: '2026-10-21' },
          { id: 'freezeEarned:2026-10-22', kind: 'freezeEarned', count: 1 },
        ],
      }),
    );
    await h.mount();
    const banners = $$('[data-testid="rollover-banner"]');
    expect(banners).toHaveLength(2);
    expect(banners[0]!.textContent).toContain(t('bannerFreezeUsed', '2026-10-21'));
    expect(banners[1]!.textContent).toContain(t('bannerFreezeEarned'));
    await click(banners[0]!.querySelector('button'));
    expect(h.calls).toContainEqual({ type: 'dismissBanner', id: 'freezeUsed:2026-10-21' });
    expect(h.onRefresh).toHaveBeenCalled();
  });

  it('"Practice now" stays; a capture from today offers "Practice these words"', async () => {
    const at = new Date().toISOString();
    const today = new Date(at);
    const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const h = harness(
      snap({
        today: { date, tasks: [], planExists: true },
        lastCapture: { lessonIds: ['L'], newCards: 6, duplicates: 0, at, tabId: 1 },
      }),
    );
    await h.mount();
    expect($('[data-testid="btn-practice-now"]')).not.toBeNull();
    const cta = $('[data-testid="btn-practice-these"]')!;
    expect(cta.textContent).toContain(t('practiceTheseWords', '6'));
    await click(cta);
    expect(h.onOpenPractice).toHaveBeenCalled();
  });

  it('no "Practice these words" for an old capture or one without new words', async () => {
    const h = harness(
      snap({ lastCapture: { lessonIds: ['L'], newCards: 6, duplicates: 0, at: '2026-01-01T10:00:00Z', tabId: 1 } }),
    );
    await h.mount();
    expect($('[data-testid="btn-practice-these"]')).toBeNull();
  });
});
