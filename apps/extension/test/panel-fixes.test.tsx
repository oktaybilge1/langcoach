// @vitest-environment jsdom
import { emptyState, newSrs, type ReviewCard } from '@langcoach/core/browser';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Message, MessageMap, MessageType, ResponseOf, Settings, Snapshot } from '../src/shared/messages';
import { App, type PanelSend } from '../src/sidepanel/App';
import { createTranslator } from '../src/sidepanel/i18n';

const { t } = createTranslator('en');

const flush = async () => {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
};

const settingsFor = (uiLanguage = 'en'): Settings => ({ autoSave: true, reminderTime: null, uiLanguage, hasCamera: false });

const profile = {
  nativeLanguage: 'English',
  targetLanguage: 'Spanish (Spain)',
  level: 'A2' as const,
  goal: 'travel',
  minutesPerDay: 15,
  daysPerWeek: 5,
  createdAt: '2026-03-04T10:00:00Z',
};

function card(id: string, term: string, translation: string): ReviewCard {
  return { id, lessonId: 'l-1', term, translation, example: '', srs: newSrs(new Date('2026-03-04T00:00:00Z')) };
}

const CARDS = [
  card('c1', 'hola', 'hello'),
  card('c2', 'adiós', 'goodbye'),
  card('c3', 'gracias', 'thanks'),
  card('c4', 'la cuenta', 'the bill'),
  card('c5', 'el agua', 'water'),
  card('c6', 'el café', 'coffee'),
];

function snapshot(overrides: Partial<Snapshot> = {}): Snapshot {
  const st = emptyState();
  st.profile = profile;
  st.cards = CARDS;
  const tasks = [{ id: 't1', date: '2026-03-04', type: 'review' as const, minutes: 5, status: 'todo' as const }];
  return {
    profile,
    today: { date: '2026-03-04', tasks, planExists: true },
    plan: { week: '2026-W10', theme: 'cafe', tasks },
    progress: { streak: 1, totalXp: 10, weekly: { done: 0, planned: 5 }, dueCount: 2 },
    dueCount: 2,
    lastCapture: null,
    state: st,
    ...overrides,
  };
}

type Handler = (msg: Message) => unknown;

function mount(handler: Handler, opts: { settings?: Settings; initialTab?: Parameters<typeof App>[0]['initialTab'] } = {}) {
  const calls: Message[] = [];
  const send: PanelSend = vi.fn(async <K extends MessageType>(msg: { type: K } & MessageMap[K]['request']) => {
    calls.push(msg as Message);
    if (msg.type === 'getSettings') return (opts.settings ?? settingsFor()) as ResponseOf<K>;
    const out = handler(msg as Message);
    return (await out) as ResponseOf<K>;
  });
  return { calls, send, opts };
}

let host: HTMLDivElement;

async function renderApp(send: PanelSend, initialTab?: Parameters<typeof App>[0]['initialTab']) {
  await act(async () => {
    render(<App send={send} initialTab={initialTab} />, host);
  });
  await flush();
}

const $ = <T extends Element = HTMLElement>(sel: string) => host.querySelector<T>(sel);
const byTestId = <T extends Element = HTMLElement>(id: string) => $<T>(`[data-testid="${id}"]`);
const buttonByText = (text: string) =>
  [...host.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.includes(text));
const click = async (el: HTMLElement | null | undefined) => {
  expect(el).toBeTruthy();
  await act(async () => {
    el!.click();
  });
  await flush();
};

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  try {
    localStorage.clear();
  } catch {
    /* ignore */
  }
});

afterEach(() => {
  render(null, host);
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('I1: list mode has no "Learned" button; card sessions complete the review task', () => {
  it('list mode offers no Learned button and sends no review', async () => {
    const { calls, send } = mount((m) => (m.type === 'getSnapshot' ? snapshot() : m.type === 'getDue' ? [] : null));
    await renderApp(send, 'review');
    await click(byTestId('mode-list'));
    expect(host.textContent).not.toMatch(/Learned \(\+5 XP\)|btnMarkLearned/);
    expect(host.querySelectorAll('.vocab-footer button')).toHaveLength(0);
    expect(host.querySelectorAll('.vocab-item').length).toBe(CARDS.length);
    expect(calls.some((c) => c.type === 'review' || c.type === 'completeReview')).toBe(false);
  });

  it('after visiting list mode, finishing a card session still completes the review task', async () => {
    const due = [CARDS[0]!, CARDS[1]!];
    const { calls, send } = mount((m) => {
      if (m.type === 'getSnapshot') return snapshot();
      if (m.type === 'getDue') return due;
      if (m.type === 'review') return due[0];
      if (m.type === 'completeReview') return { task: null, xpAwarded: 12 };
      return null;
    });
    await renderApp(send, 'review');
    await click(byTestId('mode-list'));
    await click(byTestId('mode-cards'));
    for (let i = 0; i < 2; i++) {
      await click(byTestId('review-show'));
      await click(byTestId('rate-3'));
    }
    expect(calls.filter((c) => c.type === 'completeReview')).toEqual([{ type: 'completeReview', cardsReviewed: 2 }]);
  });
});

describe('I6: list mode search and inline edit', () => {
  it('search filters by term or translation; edit saves the translation via updateCard', async () => {
    const { calls, send } = mount((m) => {
      if (m.type === 'getSnapshot') return snapshot();
      if (m.type === 'getDue') return [];
      if (m.type === 'updateCard') return { ...CARDS[2]!, translation: 'thank you' };
      return null;
    });
    await renderApp(send, 'review');
    await click(byTestId('mode-list'));
    const search = $<HTMLInputElement>(`input[placeholder="${t('searchPlaceholder')}"]`)!;
    await act(async () => {
      search.value = 'THANK';
      search.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const items = host.querySelectorAll('.vocab-item');
    expect(items).toHaveLength(1);
    expect(items[0]!.textContent).toContain('gracias');

    await click(buttonByText(t('btnEditCard')));
    const input = $<HTMLInputElement>(`.vocab-item input[placeholder="${t('placeholderTranslation')}"]`)!;
    await act(async () => {
      input.value = 'thank you';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await click(buttonByText(t('btnSaveCard')));
    expect(calls.find((c) => c.type === 'updateCard')).toEqual({
      type: 'updateCard',
      cardId: 'c3',
      patch: { translation: 'thank you' },
    });
  });

  it('the list/card switch exposes its state with aria-pressed', async () => {
    const { send } = mount((m) => (m.type === 'getSnapshot' ? snapshot() : m.type === 'getDue' ? [] : null));
    await renderApp(send, 'review');
    await click(byTestId('mode-list'));
    expect(byTestId('mode-list')!.getAttribute('aria-pressed')).toBe('true');
    expect(byTestId('mode-cards')!.getAttribute('aria-pressed')).toBe('false');
    expect(host.querySelector('[role="tablist"]')).toBeNull();
  });
});

describe('Review: rapid 1-4 keys rate a card only once', () => {
  it('ignores rating input while a rating is in flight', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const due = [CARDS[0]!, CARDS[1]!];
    const { calls, send } = mount(async (m) => {
      if (m.type === 'getSnapshot') return snapshot();
      if (m.type === 'getDue') return due;
      if (m.type === 'review') {
        await gate;
        return due[0];
      }
      return null;
    });
    await renderApp(send, 'review');
    await click(byTestId('mode-cards'));
    await click(byTestId('review-show'));
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '3' }));
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '3' }));
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '4' }));
    });
    release();
    await flush();
    expect(calls.filter((c) => c.type === 'review')).toEqual([{ type: 'review', cardId: 'c1', rating: 3 }]);
  });
});

describe('Today', () => {
  it('hides the Undo card once the 10-minute window is over', async () => {
    const old = { lessonIds: ['l-1'], newCards: 3, duplicates: 0, at: new Date(Date.now() - 11 * 60_000).toISOString(), tabId: 1 };
    const { send } = mount((m) => (m.type === 'getSnapshot' ? snapshot({ lastCapture: old }) : null));
    await renderApp(send);
    expect(byTestId('today-undo')).toBeNull();
  });

  it('shows Undo within the window', async () => {
    const fresh = { lessonIds: ['l-1'], newCards: 3, duplicates: 0, at: new Date(Date.now() - 60_000).toISOString(), tabId: 1 };
    const { send } = mount((m) => (m.type === 'getSnapshot' ? snapshot({ lastCapture: fresh }) : null));
    await renderApp(send);
    expect(byTestId('today-undo')).not.toBeNull();
  });

  function stubChrome(fillResponse: unknown) {
    const writeText = vi.fn(async () => {});
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    const sendMessage = vi.fn(async () => fillResponse);
    vi.stubGlobal('chrome', {
      tabs: {
        query: vi.fn(async () => [{ id: 9, windowId: 1, url: 'https://labs.google/lll/en/experiments/tiny-lesson' }]),
        sendMessage,
        update: vi.fn(),
        create: vi.fn(),
      },
      windows: { update: vi.fn() },
    });
    return { writeText, sendMessage };
  }

  it('Fill shows "Filled" only when the page reports filled:true', async () => {
    const { writeText, sendMessage } = stubChrome({ filled: true });
    const { send } = mount((m) => (m.type === 'getSnapshot' ? snapshot() : null));
    await renderApp(send);
    await click(byTestId('btn-fill-theme'));
    expect(sendMessage).toHaveBeenCalledWith(9, { type: 'fillTheme', theme: expect.any(String) });
    expect(byTestId('btn-fill-theme')!.textContent).toContain(t('btnFilled'));
    expect(writeText).not.toHaveBeenCalled();
  });

  it('when the page is not filled, copies the theme and says to paste it', async () => {
    const { writeText } = stubChrome({ filled: false });
    const { send } = mount((m) => (m.type === 'getSnapshot' ? snapshot() : null));
    await renderApp(send);
    const theme = byTestId('today-theme')!.textContent!.replace(/[“”]/g, '');
    await click(byTestId('btn-fill-theme'));
    expect(writeText).toHaveBeenCalledWith(theme);
    expect(host.textContent).toContain(t('themeCopiedPaste'));
    expect(byTestId('btn-fill-theme')!.textContent).not.toContain(t('btnFilled'));
  });
});

describe('panel language and Settings labels', () => {
  it('sets <html lang> from the UI language', async () => {
    const { send } = mount((m) => (m.type === 'getSnapshot' ? snapshot() : null), {});
    const s2 = mount((m) => (m.type === 'getSnapshot' ? snapshot() : null), { settings: settingsFor('pt_BR') });
    await renderApp(s2.send);
    expect(document.documentElement.lang).toBe('pt-BR');
    render(null, host);
    await renderApp(send);
    expect(document.documentElement.lang).toBe('en');
  });

  it('Settings goal dropdown shows translated labels', async () => {
    const { send } = mount((m) => (m.type === 'getSnapshot' ? snapshot() : null), { settings: settingsFor('tr') });
    await renderApp(send, 'settings');
    const tr = createTranslator('tr').t;
    const options = [...host.querySelectorAll<HTMLOptionElement>('#set-goal option')];
    expect(options.find((o) => o.value === 'travel')!.textContent).toBe(tr('goalTravel'));
    expect(options.find((o) => o.value === 'work')!.textContent).toBe(tr('goalWork'));
  });

  it('export revokes the blob URL only after a delay', async () => {
    const { send } = mount((m) => (m.type === 'getSnapshot' ? snapshot() : m.type === 'exportData' ? { json: '{}' } : null));
    const create = vi.fn(() => 'blob:x');
    const revoke = vi.fn();
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke }));
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const timeouts: [() => void, number | undefined][] = [];
    await renderApp(send, 'settings');
    const realSetTimeout = globalThis.setTimeout;
    vi.spyOn(globalThis, 'setTimeout').mockImplementation(((fn: () => void, ms?: number) => {
      if (ms !== undefined && ms >= 30_000) {
        timeouts.push([fn, ms]);
        return 0 as unknown as ReturnType<typeof setTimeout>;
      }
      return realSetTimeout(fn, ms);
    }) as typeof setTimeout);
    await click(byTestId('btn-export'));
    expect(create).toHaveBeenCalled();
    expect(revoke).not.toHaveBeenCalled();
    expect(timeouts).toHaveLength(1);
    timeouts[0]![0]();
    expect(revoke).toHaveBeenCalledWith('blob:x');
  });
});

describe('I5: import', () => {
  function chooseFile(content: string) {
    const input = byTestId<HTMLInputElement>('input-import')!;
    const file = new File([content], 'backup.json', { type: 'application/json' });
    Object.defineProperty(input, 'files', { configurable: true, value: [file] });
    Object.defineProperty(input, 'value', { configurable: true, writable: true, value: 'C:\\fakepath\\backup.json' });
    return act(async () => {
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }
  const fileJson = JSON.stringify({ ...emptyState(), cards: [CARDS[0], CARDS[1]] });

  it('a visible, focusable button opens the file picker', async () => {
    const { send } = mount((m) => (m.type === 'getSnapshot' ? snapshot() : null));
    await renderApp(send, 'settings');
    const input = byTestId<HTMLInputElement>('input-import')!;
    const pick = vi.spyOn(input, 'click').mockImplementation(() => {});
    const btn = byTestId<HTMLButtonElement>('btn-import')!;
    expect(btn.tagName).toBe('BUTTON');
    await click(btn);
    expect(pick).toHaveBeenCalled();
  });

  it('asks before replacing (current vs file counts), imports, reports success and resets the input', async () => {
    const { calls, send } = mount((m) =>
      m.type === 'getSnapshot' ? snapshot() : m.type === 'importData' ? { lessons: 1, cards: 2 } : null,
    );
    await renderApp(send, 'settings');
    await chooseFile(fileJson);
    await flush();
    const dialog = byTestId('import-confirm-dialog')!;
    expect(dialog).not.toBeNull();
    expect(dialog.textContent).toContain(t('importReplaceWarning'));
    expect(dialog.textContent).toContain(t('importCounts', [String(CARDS.length), '2']));
    expect(calls.some((c) => c.type === 'importData')).toBe(false);
    expect(byTestId<HTMLInputElement>('input-import')!.value).toBe('');

    await click(byTestId('import-confirm'));
    expect(calls.find((c) => c.type === 'importData')).toEqual({ type: 'importData', json: fileJson });
    expect(host.textContent).toContain(t('importDone', ['2', '1']));
  });

  it('cancel does not import; errors are reported', async () => {
    const { calls, send } = mount((m) => {
      if (m.type === 'getSnapshot') return snapshot();
      if (m.type === 'importData') throw Object.assign(new Error('The file is not valid JSON'), { name: 'InvalidDataError' });
      return null;
    });
    await renderApp(send, 'settings');
    await chooseFile('{nope');
    await flush();
    expect(byTestId('import-confirm-dialog')!.textContent).toContain(t('importCounts', [String(CARDS.length), '?']));
    await click(byTestId('import-cancel'));
    expect(byTestId('import-confirm-dialog')).toBeNull();
    expect(calls.some((c) => c.type === 'importData')).toBe(false);

    await chooseFile('{nope');
    await flush();
    await click(byTestId('import-confirm'));
    expect(host.textContent).toContain(t('importFailed', 'The file is not valid JSON'));
  });
});

describe('I4: load errors', () => {
  it('corrupt data shows a recovery screen with the preserved key, import and reset', async () => {
    let corrupt = true;
    const { calls, send } = mount((m) => {
      if (m.type === 'getSnapshot') {
        if (corrupt) {
          throw Object.assign(new Error('Stored data is not valid JSON.'), {
            name: 'CorruptDataError',
            preservedAt: 'langcoach:corrupt:2026-10-22T10:00:00.000Z-000001',
          });
        }
        return snapshot();
      }
      if (m.type === 'reset') {
        corrupt = false;
        return null;
      }
      return null;
    });
    await renderApp(send);
    const screen = byTestId('recovery-screen')!;
    expect(screen).not.toBeNull();
    expect(screen.textContent).toContain(t('corruptTitle'));
    expect(screen.textContent).toContain('langcoach:corrupt:2026-10-22T10:00:00.000Z-000001');
    expect(byTestId('btn-import')).not.toBeNull();
    expect(byTestId('input-import')).not.toBeNull();

    for (let i = 0; i < 3; i++) await click(byTestId('btn-reset'));
    expect(calls.some((c) => c.type === 'reset')).toBe(true);
    await flush();
    expect(byTestId('recovery-screen')).toBeNull();
    expect(byTestId('tab-today')).not.toBeNull();
  });

  it('a generic error shows a retry banner that reloads', async () => {
    let fail = true;
    const { send } = mount((m) => {
      if (m.type === 'getSnapshot') {
        if (fail) throw new Error('No response from the background worker');
        return snapshot();
      }
      return null;
    });
    await renderApp(send);
    const banner = byTestId('load-error')!;
    expect(banner).not.toBeNull();
    expect(banner.getAttribute('role')).toBe('alert');
    expect(banner.textContent).toContain('No response from the background worker');
    fail = false;
    await click(byTestId('btn-retry'));
    expect(byTestId('load-error')).toBeNull();
    expect(byTestId('tab-today')).not.toBeNull();
  });
});
