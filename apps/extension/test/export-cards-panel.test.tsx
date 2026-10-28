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

const settings: Settings = { autoSave: true, reminderTime: null, uiLanguage: 'en', hasCamera: false, showNativeOnPage: true, soundEffects: true };
const profile = {
  nativeLanguage: 'English',
  targetLanguage: 'Spanish (Spain)',
  level: 'A2' as const,
  goal: 'travel',
  minutesPerDay: 15,
  daysPerWeek: 5,
  createdAt: '2026-03-04T10:00:00Z',
};
const card = (id: string, term: string, translation: string): ReviewCard => ({
  id,
  lessonId: 'l-1',
  term,
  translation,
  example: '',
  srs: newSrs(new Date('2026-03-04T00:00:00Z')),
});

function stateWithCards(cards: ReviewCard[]) {
  const st = emptyState();
  st.profile = profile;
  st.cards = cards;
  return st;
}

function snapshot(): Snapshot {
  const tasks = [{ id: 't1', date: '2026-03-04', type: 'review' as const, minutes: 5, status: 'todo' as const }];
  return {
    profile,
    today: { date: '2026-03-04', tasks, planExists: true },
    plan: { week: '2026-W10', theme: 'cafe', tasks },
    progress: { streak: 1, totalXp: 10, weekly: { done: 0, planned: 5 }, dueCount: 0 },
    dueCount: 0,
    lastCapture: null,
    state: stateWithCards([]),
  };
}

let host: HTMLDivElement;

function mount(exportJson: () => string) {
  const send: PanelSend = vi.fn(async <K extends MessageType>(msg: { type: K } & MessageMap[K]['request']) => {
    const m = msg as Message;
    if (m.type === 'getSettings') return settings as ResponseOf<K>;
    if (m.type === 'getSnapshot') return snapshot() as ResponseOf<K>;
    if (m.type === 'exportData') return { json: exportJson() } as ResponseOf<K>;
    return null as ResponseOf<K>;
  });
  return send;
}

const byTestId = (id: string) => host.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const click = async (el: HTMLElement | null) => {
  expect(el).toBeTruthy();
  await act(async () => {
    el!.click();
  });
  await flush();
};

async function renderSettings(send: PanelSend) {
  await act(async () => {
    render(<App send={send} initialTab="settings" />, host);
  });
  await flush();
}

function stubDownload() {
  const blobs: Blob[] = [];
  const create = vi.fn((b: Blob) => {
    blobs.push(b);
    return 'blob:cards';
  });
  const revoke = vi.fn();
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke }));
  const downloads: string[] = [];
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    downloads.push(this.download);
  });
  return { blobs, create, revoke, downloads };
}

const readBlob = (b: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsText(b);
  });

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

const json = () => JSON.stringify(stateWithCards([card('c1', 'hola', 'hello'), card('c2', 'adiós', 'goodbye')]));

describe('Settings: export cards', () => {
  it.each([
    ['btn-export-anki', /^langcoach-anki-\d{4}-\d{2}-\d{2}\.txt$/, 'text/plain;charset=utf-8', '#separator:tab'],
    ['btn-export-quizlet', /^langcoach-quizlet-\d{4}-\d{2}-\d{2}\.txt$/, 'text/plain;charset=utf-8', 'hola\thello'],
    ['btn-export-csv', /^langcoach-cards-\d{4}-\d{2}-\d{2}\.csv$/, 'text/csv;charset=utf-8', 'term,translation'],
  ])('%s downloads the right file', async (id, name, mime, content) => {
    const dl = stubDownload();
    await renderSettings(mount(json));
    await click(byTestId(id));
    expect(dl.downloads).toHaveLength(1);
    expect(dl.downloads[0]).toMatch(name);
    expect(dl.blobs[0]!.type).toBe(mime);
    expect(await readBlob(dl.blobs[0]!)).toContain(content);
    expect(byTestId('export-cards-notice')!.textContent).toContain(t('exportCardsDone', ['2', dl.downloads[0]!]));
  });

  it('revokes the blob URL after 60 s', async () => {
    const dl = stubDownload();
    const timeouts: [() => void, number | undefined][] = [];
    await renderSettings(mount(json));
    const real = globalThis.setTimeout;
    vi.spyOn(globalThis, 'setTimeout').mockImplementation(((fn: () => void, ms?: number) => {
      if (ms === 60_000) {
        timeouts.push([fn, ms]);
        return 0 as unknown as ReturnType<typeof setTimeout>;
      }
      return real(fn, ms);
    }) as typeof setTimeout);
    await click(byTestId('btn-export-anki'));
    expect(dl.revoke).not.toHaveBeenCalled();
    expect(timeouts).toHaveLength(1);
    timeouts[0]![0]();
    expect(dl.revoke).toHaveBeenCalledWith('blob:cards');
  });

  it('shows a failure message and downloads nothing when the state cannot be read', async () => {
    const dl = stubDownload();
    await renderSettings(
      mount(() => {
        throw new Error('boom');
      }),
    );
    await click(byTestId('btn-export-csv'));
    expect(dl.downloads).toHaveLength(0);
    const n = byTestId('export-cards-notice')!;
    expect(n.textContent).toContain('boom');
    expect(n.getAttribute('role')).toBe('alert');
  });

  it('tells the learner when there is nothing to export', async () => {
    const dl = stubDownload();
    await renderSettings(mount(() => JSON.stringify(stateWithCards([]))));
    await click(byTestId('btn-export-anki'));
    expect(dl.downloads).toHaveLength(0);
    expect(byTestId('export-cards-notice')!.textContent).toContain(t('exportCardsNone'));
  });
});
