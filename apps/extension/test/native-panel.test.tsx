// @vitest-environment jsdom
import { emptyState, newSrs, type ReviewCard, type State } from '@langcoach/core/browser';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTranslatorCache, type Availability, type TranslatorApi } from '../src/lib/translate';
import type { Message, MessageMap, MessageType, ResponseOf, Settings, Snapshot } from '../src/shared/messages';
import { App, type PanelSend } from '../src/sidepanel/App';

/** Several act() rounds: Preact runs effects after paint, and translator promises resolve after that. */
const flush = async (ms = 0) => {
  for (let i = 0; i < 6; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, ms));
    });
  }
};

const settings: Settings = { autoSave: true, reminderTime: null, uiLanguage: 'en', hasCamera: false, showNativeOnPage: true, soundEffects: true };

function card(i: number, extra: Partial<ReviewCard> = {}): ReviewCard {
  return {
    id: `c${i}`,
    lessonId: 'l-1',
    term: `palabra ${i}`,
    translation: `word ${i}`,
    example: '',
    srs: newSrs(new Date('2026-03-04T00:00:00Z')),
    ...extra,
  };
}

function snapshotWith(cards: ReviewCard[], nativeLanguage = 'Turkish'): Snapshot {
  const profile = {
    nativeLanguage,
    targetLanguage: 'Spanish (Spain)',
    level: 'A2' as const,
    goal: 'travel',
    minutesPerDay: 15,
    daysPerWeek: 5,
    createdAt: '2026-03-04T10:00:00Z',
  };
  const st: State = emptyState();
  st.profile = profile;
  st.cards = cards;
  st.lessons = [
    {
      id: 'l-1',
      kind: 'tiny_lesson',
      situation: 'coffee',
      items: [],
      createdAt: '2026-03-04T10:00:00Z',
      source: { app: 'lll', targetLanguage: 'European Spanish', sourceLanguage: 'English' },
    },
  ];
  return {
    profile,
    today: { date: '2026-03-04', tasks: [], planExists: true },
    plan: null,
    progress: { streak: 0, totalXp: 0, weekly: { done: 0, planned: 0 }, dueCount: 0 },
    dueCount: 0,
    lastCapture: null,
    state: st,
  };
}

function fakeApi(availability: () => Availability) {
  const translate = vi.fn(async (s: string) => `[tr] ${s}`);
  const api = {
    availability: vi.fn(async () => availability()),
    create: vi.fn(async (o: { monitor?: (m: EventTarget) => void }) => {
      if (o.monitor) {
        const m = new EventTarget();
        o.monitor(m);
        m.dispatchEvent(Object.assign(new Event('downloadprogress'), { loaded: 0.4 }));
      }
      return { translate, destroy: () => {} };
    }),
  };
  return { api: api as unknown as TranslatorApi, raw: api, translate };
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

function harness(snap: Snapshot, st: Settings = settings) {
  const calls: Message[] = [];
  let current = snap;
  let currentSettings = st;
  const send: PanelSend = vi.fn(async <K extends MessageType>(msg: { type: K } & MessageMap[K]['request']) => {
    calls.push(msg as Message);
    if (msg.type === 'getSettings') return currentSettings as ResponseOf<K>;
    if (msg.type === 'setSettings') {
      currentSettings = { ...currentSettings, ...(msg as MessageMap['setSettings']['request']).settings };
      return currentSettings as ResponseOf<K>;
    }
    if (msg.type === 'getSnapshot') return current as ResponseOf<K>;
    if (msg.type === 'getDue') return current.state!.cards as ResponseOf<K>;
    if (msg.type === 'setNativeTranslations') {
      const entries = (msg as MessageMap['setNativeTranslations']['request']).entries;
      const st = structuredClone(current.state!);
      for (const e of entries) {
        const c = st.cards.find((x) => x.id === e.cardId);
        if (c) c.nativeTranslation = e.text;
      }
      current = { ...current, state: st };
      return { updated: entries.length } as ResponseOf<K>;
    }
    return null as ResponseOf<K>;
  });
  return { send, calls, stored: () => calls.filter((c) => c.type === 'setNativeTranslations') };
}

const banner = () => host.querySelector('[data-testid="native-banner"]');

describe('native translations in the side panel', () => {
  it("'available': translates missing cards in batches of 50 and stores them", async () => {
    const cards = Array.from({ length: 120 }, (_, i) => card(i));
    cards[3]!.nativeTranslation = 'zaten var';
    const h = harness(snapshotWith(cards));
    const f = fakeApi(() => 'available');
    await act(async () => {
      render(<App send={h.send} translator={createTranslatorCache(f.api)} />, host);
    });
    await flush(20);
    const batches = h.stored().map((m) => (m as MessageMap['setNativeTranslations']['request'] & Message).entries);
    expect(batches.map((b) => b.length)).toEqual([50, 50, 19]);
    expect(batches.flat().some((e) => e.cardId === 'c3')).toBe(false);
    expect(batches[0]![0]).toEqual({ cardId: 'c0', text: '[tr] word 0' });
  });

  it("'downloadable': shows the one-time download button; clicking downloads with progress, then translates", async () => {
    let state: Availability = 'downloadable';
    const h = harness(snapshotWith([card(1), card(2)]));
    const f = fakeApi(() => state);
    await act(async () => {
      render(<App send={h.send} translator={createTranslatorCache(f.api)} />, host);
    });
    await flush(10);
    expect(f.raw.create).not.toHaveBeenCalled();
    const btn = host.querySelector<HTMLButtonElement>('[data-testid="native-download"]')!;
    expect(btn.textContent).toBe('Download translations (one-time, on-device)');
    state = 'available';
    await act(async () => {
      btn.click();
    });
    await flush(20);
    expect(f.raw.create).toHaveBeenCalled();
    expect(h.stored()).toHaveLength(1);
  });

  it("'unavailable' / API missing: a quiet note, English stays, nothing stored", async () => {
    const h = harness(snapshotWith([card(1)]));
    await act(async () => {
      render(<App send={h.send} translator={createTranslatorCache(undefined, () => undefined)} />, host);
    });
    await flush(10);
    expect(banner()?.textContent).toContain("Your browser can't translate English→Turkish on-device yet; showing English.");
    expect(h.stored()).toHaveLength(0);
  });

  it('a failed download brings the button back with a short error line', async () => {
    const h = harness(snapshotWith([card(1)]));
    const f = fakeApi(() => 'downloadable');
    f.raw.create.mockRejectedValueOnce(new Error('network'));
    await act(async () => {
      render(<App send={h.send} translator={createTranslatorCache(f.api)} />, host);
    });
    await flush(10);
    await act(async () => {
      host.querySelector<HTMLButtonElement>('[data-testid="native-download"]')!.click();
    });
    await flush(10);
    expect(host.querySelector('[data-testid="native-download"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="native-download-failed"]')?.textContent).toBe(
      "Download didn't finish — try again",
    );
    expect(host.querySelector('[data-testid="native-unavailable"]')).toBeNull();
  });

  it("the 'unavailable' note can be dismissed per language pair and stays dismissed", async () => {
    const h = harness(snapshotWith([card(1)]));
    await act(async () => {
      render(<App send={h.send} translator={createTranslatorCache(undefined, () => undefined)} />, host);
    });
    await flush(10);
    await act(async () => {
      host.querySelector<HTMLButtonElement>('[data-testid="native-dismiss"]')!.click();
    });
    await flush(10);
    expect(banner()).toBeNull();
    expect(h.calls).toContainEqual({ type: 'setSettings', settings: { dismissedNativePairs: ['en:tr'] } });
    render(null, host);

    const h2 = harness(snapshotWith([card(1)]), { ...settings, dismissedNativePairs: ['en:tr'] });
    await act(async () => {
      render(<App send={h2.send} translator={createTranslatorCache(undefined, () => undefined)} />, host);
    });
    await flush(10);
    expect(banner()).toBeNull();
  });

  it('no banner for an English learner or when nothing is missing', async () => {
    for (const snap of [snapshotWith([card(1)], 'English'), snapshotWith([card(1, { nativeTranslation: 'x' })])]) {
      const h = harness(snap);
      const f = fakeApi(() => 'available');
      await act(async () => {
        render(<App send={h.send} translator={createTranslatorCache(f.api)} />, host);
      });
      await flush(10);
      expect(banner()).toBeNull();
      expect(h.stored()).toHaveLength(0);
      render(null, host);
    }
  });

  it('Review shows the native meaning first with the English meaning beneath (list and card)', async () => {
    const h = harness(snapshotWith([card(1, { nativeTranslation: 'kelime 1' }), card(2)]));
    await act(async () => {
      render(<App send={h.send} initialTab="review" translator={createTranslatorCache(undefined, () => undefined)} />, host);
    });
    await flush(10);
    // card mode (Words opens as the list): flip the first card
    await act(async () => {
      host.querySelector<HTMLButtonElement>('[data-testid="mode-cards"]')!.click();
    });
    await flush(10);
    await act(async () => {
      host.querySelector<HTMLButtonElement>('[data-testid="review-show"]')!.click();
    });
    const native = host.querySelector('[data-testid="card-native"]')!;
    expect(native.textContent).toBe('kelime 1');
    expect(native.getAttribute('lang')).toBe('tr');
    const en = host.querySelector('[data-testid="card-translation"]')!;
    expect(en.textContent).toBe('word 1');
    expect(native.compareDocumentPosition(en) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    await act(async () => {
      host.querySelector<HTMLButtonElement>('[data-testid="mode-list"]')!.click();
    });
    const natives = [...host.querySelectorAll('[data-testid="vocab-native"]')].map((x) => x.textContent);
    expect(natives).toEqual(['kelime 1']);
  });

  it('Settings has a "Show my language on the page" toggle', async () => {
    const h = harness(snapshotWith([]));
    await act(async () => {
      render(<App send={h.send} initialTab="settings" translator={createTranslatorCache(undefined, () => undefined)} />, host);
    });
    await flush(10);
    const box = host.querySelector<HTMLInputElement>('[data-testid="pref-native-page"]')!;
    expect(box.checked).toBe(true);
    expect(box.closest('label')!.textContent).toContain('Show my language on the page');
    await act(async () => {
      box.click();
    });
    await flush();
    expect(h.calls).toContainEqual({ type: 'setSettings', settings: { showNativeOnPage: false } });
  });
});
