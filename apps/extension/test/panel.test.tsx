// @vitest-environment jsdom
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { emptyState, newSrs, type ReviewCard } from '@langcoach/core/browser';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Message, MessageMap, MessageType, ResponseOf, Settings, Snapshot } from '../src/shared/messages';
import { App, type PanelSend } from '../src/sidepanel/App';

const flush = async () => {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
};

const defaultSettings: Settings = {
  autoSave: true,
  reminderTime: null,
  uiLanguage: 'en',
  hasCamera: false,
  pendingTargetLanguage: 'European Spanish',
};

const sampleProfile = {
  nativeLanguage: 'Turkish',
  targetLanguage: 'Spanish (Spain)',
  level: 'A2' as const,
  goal: 'travel',
  minutesPerDay: 15,
  daysPerWeek: 5,
  createdAt: '2026-03-04T10:00:00Z',
};

const sampleTasks = [
  { id: 't1', date: '2026-03-04', type: 'tiny_lesson' as const, minutes: 10, status: 'todo' as const },
  { id: 't2', date: '2026-03-04', type: 'review' as const, minutes: 5, status: 'done' as const, completedAt: '2026-03-04T10:05:00Z' },
];

function makeSnapshot(overrides: Partial<Snapshot> = {}): Snapshot {
  const st = emptyState();
  st.profile = sampleProfile;
  return {
    profile: sampleProfile,
    today: { date: '2026-03-04', tasks: sampleTasks, planExists: true },
    plan: { week: '2026-W10', theme: 'Ordering at a cafe', tasks: sampleTasks },
    progress: { streak: 4, totalXp: 140, weekly: { done: 1, planned: 5 }, dueCount: 2 },
    dueCount: 2,
    lastCapture: {
      lessonIds: ['l-1'],
      newCards: 12,
      duplicates: 0,
      at: new Date().toISOString(), // inside the 10-minute undo window
      tabId: 1,
    },
    state: st,
    ...overrides,
  };
}

function makeCard(overrides: Partial<ReviewCard> = {}): ReviewCard {
  return {
    id: 'card-1',
    lessonId: 'l-1',
    term: 'la cuenta',
    translation: 'the bill',
    example: '¿Me trae la cuenta, por favor?',
    pronunciation: 'lah KWEN-tah',
    srs: newSrs(new Date('2026-03-04T00:00:00Z')),
    ...overrides,
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
});

describe('side panel UI', () => {
  it('onboarding prefills target language from pendingTargetLanguage and calls setProfile + createPlan with chosen values', async () => {
    const calls: Message[] = [];
    let currentSnap: Snapshot = makeSnapshot({ profile: null, today: null, plan: null });
    const send: PanelSend = vi.fn(async <K extends MessageType>(msg: { type: K } & MessageMap[K]['request']) => {
      calls.push(msg as Message);
      if (msg.type === 'getSettings') return defaultSettings as ResponseOf<K>;
      if (msg.type === 'getSnapshot') return currentSnap as ResponseOf<K>;
      if (msg.type === 'setProfile') {
        const p = (msg as MessageMap['setProfile']['request']).profile;
        currentSnap = makeSnapshot({
          profile: { ...p, createdAt: '2026-03-04T10:00:00Z' },
        });
        return currentSnap.profile as ResponseOf<K>;
      }
      if (msg.type === 'setSettings') return { ...defaultSettings, ...(msg as MessageMap['setSettings']['request']).settings } as ResponseOf<K>;
      if (msg.type === 'createPlan') return currentSnap.plan! as ResponseOf<K>;
      return null as ResponseOf<K>;
    });

    await act(async () => {
      render(<App send={send} />, host);
    });
    await flush();

    // Target language prefilled from 'European Spanish' -> 'Spanish (Spain)'
    const targetSelect = host.querySelector<HTMLSelectElement>('[data-testid="onboard-target"]')!;
    expect(targetSelect).not.toBeNull();
    expect(targetSelect.value).toBe('Spanish (Spain)');

    // Choose native language = Turkish, level = unsure (-> A2), goal = work, minutes = 20, days = 4
    const nativeSelect = host.querySelector<HTMLSelectElement>('[data-testid="onboard-native"]')!;
    nativeSelect.value = 'Turkish';
    nativeSelect.dispatchEvent(new Event('change', { bubbles: true }));

    const levelSelect = host.querySelector<HTMLSelectElement>('[data-testid="onboard-level"]')!;
    levelSelect.value = 'unsure';
    levelSelect.dispatchEvent(new Event('change', { bubbles: true }));

    const goalSelect = host.querySelector<HTMLSelectElement>('[data-testid="onboard-goal"]')!;
    goalSelect.value = 'work';
    goalSelect.dispatchEvent(new Event('change', { bubbles: true }));

    const minSelect = host.querySelector<HTMLSelectElement>('[data-testid="onboard-minutes"]')!;
    minSelect.value = '20';
    minSelect.dispatchEvent(new Event('change', { bubbles: true }));

    const daysSelect = host.querySelector<HTMLSelectElement>('[data-testid="onboard-days"]')!;
    daysSelect.value = '4';
    daysSelect.dispatchEvent(new Event('change', { bubbles: true }));

    const form = host.querySelector<HTMLFormElement>('[data-testid="onboard-form"]')!;
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    await flush();

    const setProf = calls.find((c) => c.type === 'setProfile');
    expect(setProf).toEqual({
      type: 'setProfile',
      profile: {
        nativeLanguage: 'Turkish',
        targetLanguage: 'Spanish (Spain)',
        level: 'A2',
        goal: 'work',
        minutesPerDay: 20,
        daysPerWeek: 4,
      },
    });
    expect(calls.some((c) => c.type === 'createPlan')).toBe(true);
  });

  it('Today renders tasks from a snapshot fixture and allows Undo on last capture', async () => {
    const calls: Message[] = [];
    const send: PanelSend = vi.fn(async <K extends MessageType>(msg: { type: K } & MessageMap[K]['request']) => {
      calls.push(msg as Message);
      if (msg.type === 'getSettings') return defaultSettings as ResponseOf<K>;
      if (msg.type === 'getSnapshot') return makeSnapshot() as ResponseOf<K>;
      if (msg.type === 'undo') return { removedCards: 12 } as ResponseOf<K>;
      return null as ResponseOf<K>;
    });

    await act(async () => {
      render(<App send={send} />, host);
    });
    await flush();

    const taskItems = host.querySelectorAll('[data-testid="today-task"]');
    expect(taskItems).toHaveLength(2);
    expect(host.textContent).toContain('10');
    expect(host.textContent).toContain('4'); // streak

    const undoBtn = host.querySelector<HTMLButtonElement>('[data-testid="today-undo"]')!;
    expect(undoBtn).not.toBeNull();
    await act(async () => {
      undoBtn.click();
    });
    await flush();
    expect(calls.find((c) => c.type === 'undo')).toEqual({ type: 'undo', lessonIds: ['l-1'] });
  });

  it('Review flips card, rating button sends review message, and key "3" rates Good', async () => {
    const calls: Message[] = [];
    const cards = [makeCard({ id: 'c1', term: 'hola', translation: 'hello' }), makeCard({ id: 'c2', term: 'adiós', translation: 'goodbye' })];
    const send: PanelSend = vi.fn(async <K extends MessageType>(msg: { type: K } & MessageMap[K]['request']) => {
      calls.push(msg as Message);
      if (msg.type === 'getSettings') return defaultSettings as ResponseOf<K>;
      if (msg.type === 'getSnapshot') return makeSnapshot() as ResponseOf<K>;
      if (msg.type === 'getDue') return cards as ResponseOf<K>;
      if (msg.type === 'review') return cards[0]! as ResponseOf<K>;
      if (msg.type === 'completeReview') return { task: null, xpAwarded: 12 } as ResponseOf<K>;
      return null as ResponseOf<K>;
    });

    await act(async () => {
      render(<App send={send} />, host);
    });
    await flush();

    // Switch to Review tab
    const reviewTab = host.querySelector<HTMLButtonElement>('[data-testid="tab-review"]')!;
    await act(async () => {
      reviewTab.click();
    });
    await flush();

    // Front of card 1 visible, answer hidden
    expect(host.querySelector('[data-testid="card-term"]')?.textContent).toBe('hola');
    expect(host.querySelector('[data-testid="card-translation"]')).toBeNull();

    // Flip card via Show answer button
    const flipBtn = host.querySelector<HTMLButtonElement>('[data-testid="review-show"]')!;
    await act(async () => {
      flipBtn.click();
    });
    expect(host.querySelector('[data-testid="card-translation"]')?.textContent).toContain('hello');

    // Rate card 1 via button click (Hard = 2)
    const rate2 = host.querySelector<HTMLButtonElement>('[data-testid="rate-2"]')!;
    await act(async () => {
      rate2.click();
    });
    await flush();
    expect(calls.find((c) => c.type === 'review')).toEqual({ type: 'review', cardId: 'c1', rating: 2 });

    // Card 2 is now shown; flip with Space and rate Good (3) with key "3"
    expect(host.querySelector('[data-testid="card-term"]')?.textContent).toBe('adiós');
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
    });
    expect(host.querySelector('[data-testid="card-translation"]')?.textContent).toContain('goodbye');

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '3' }));
    });
    await flush();

    const reviewCalls = calls.filter((c) => c.type === 'review');
    expect(reviewCalls).toEqual([
      { type: 'review', cardId: 'c1', rating: 2 },
      { type: 'review', cardId: 'c2', rating: 3 },
    ]);
    // Session ended after reviewing 2 cards -> completeReview called automatically
    expect(calls.find((c) => c.type === 'completeReview')).toEqual({ type: 'completeReview', cardsReviewed: 2 });
  });

  it('Arabic card element has dir="auto" and lang="ar"', async () => {
    const arProfile = { ...sampleProfile, targetLanguage: 'Arabic' };
    const arCard = makeCard({ id: 'ar1', term: 'مرحبا', translation: 'hello', pronunciation: 'marhaban' });
    const send: PanelSend = vi.fn(async <K extends MessageType>(msg: { type: K } & MessageMap[K]['request']) => {
      if (msg.type === 'getSettings') return defaultSettings as ResponseOf<K>;
      if (msg.type === 'getSnapshot') return makeSnapshot({ profile: arProfile }) as ResponseOf<K>;
      if (msg.type === 'getDue') return [arCard] as ResponseOf<K>;
      return null as ResponseOf<K>;
    });

    await act(async () => {
      render(<App send={send} />, host);
    });
    await flush();

    await act(async () => {
      host.querySelector<HTMLButtonElement>('[data-testid="tab-review"]')!.click();
    });
    await flush();

    const termEl = host.querySelector<HTMLElement>('[data-testid="card-term"]')!;
    expect(termEl).not.toBeNull();
    expect(termEl.getAttribute('dir')).toBe('auto');
    expect(termEl.getAttribute('lang')).toBe('ar');
  });

  it('every message key used in source exists in all 5 locales', () => {
    const cwd = process.cwd();
    const extRoot = existsSync(join(cwd, 'public', 'manifest.json')) ? cwd : join(cwd, 'apps', 'extension');
    const locales = ['en', 'tr', 'es', 'fr', 'pt_BR'] as const;
    const catalogs = Object.fromEntries(
      locales.map((l) => [
        l,
        JSON.parse(readFileSync(join(extRoot, 'public', '_locales', l, 'messages.json'), 'utf8')) as Record<
          string,
          { message: string }
        >,
      ]),
    );

    function walk(dir: string): string[] {
      const out: string[] = [];
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) out.push(...walk(full));
        else if (/\.(ts|tsx|json|html)$/.test(entry)) out.push(full);
      }
      return out;
    }

    const files = [...walk(join(extRoot, 'src')), join(extRoot, 'public', 'manifest.json')];
    const usedKeys = new Set<string>();
    for (const file of files) {
      const src = readFileSync(file, 'utf8');
      for (const m of src.matchAll(/\bt\(\s*['"]([a-zA-Z0-9_]+)['"]/g)) {
        usedKeys.add(m[1]!);
      }
      for (const m of src.matchAll(/__MSG_([a-zA-Z0-9_]+)__/g)) {
        usedKeys.add(m[1]!);
      }
    }

    expect(usedKeys.size).toBeGreaterThan(10);
    for (const key of usedKeys) {
      for (const l of locales) {
        expect(catalogs[l]?.[key]?.message, `${l}.${key} must be defined and non-empty`).toMatch(/\S/);
      }
    }
  });
});
