// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startIsolated } from '../src/content/isolated';
import { startScenario } from '../src/content/scenario';
import type { Toaster } from '../src/content/toast';
import { stubLayout } from './layout-stub';
import { mountBeforeYouBegin, mountSplash, mountTinyLesson } from './lll-dom';

const TINY = '/lll/en/experiments/tiny-lesson';
const FAST = { timeoutMs: 300, stepMs: 5 };

beforeEach(() => {
  document.body.replaceChildren();
  history.pushState({}, '', TINY);
  stubLayout();
});
afterEach(() => {
  history.pushState({}, '', '/');
  vi.restoreAllMocks();
});

describe('startScenario (C9)', () => {
  it('selects the target language, fills the purpose (React sees it) and clicks Generate', async () => {
    const page = mountTinyLesson();
    const r = await startScenario(window, { theme: 'ordering tapas', targetLabel: 'Spanish (Spain)' }, FAST);
    expect(r).toEqual({ ok: true });
    expect(page.language()).toBe('Spanish (Spain)');
    expect(page.reactPurpose).toEqual(['ordering tapas']);
    expect(page.generated).toEqual(['Spanish (Spain)|ordering tapas']);
  });

  it('waits for the page app to render (fresh tab) before acting', async () => {
    let page: ReturnType<typeof mountTinyLesson> | null = null;
    setTimeout(() => (page = mountTinyLesson({ language: 'Turkish' })), 40);
    expect(await startScenario(window, { theme: 'market' }, FAST)).toEqual({ ok: true });
    expect(page!.generated).toEqual(['Turkish|market']);
  });

  it('keeps the current language when it already matches (no menu opened)', async () => {
    const page = mountTinyLesson({ language: 'Spanish (Spain)' });
    expect(await startScenario(window, { theme: 'hotel', targetLabel: 'Spanish (Spain)' }, FAST)).toEqual({ ok: true });
    expect(page.menuOpens()).toBe(0);
    expect(page.generated).toEqual(['Spanish (Spain)|hotel']);
  });

  it('without a target label it keeps whatever language is chosen', async () => {
    const page = mountTinyLesson({ language: 'Japanese' });
    expect(await startScenario(window, { theme: 'hotel' }, FAST)).toEqual({ ok: true });
    expect(page.generated).toEqual(['Japanese|hotel']);
  });

  it('caps the purpose at 50 characters', async () => {
    const page = mountTinyLesson({ language: 'Turkish' });
    await startScenario(window, { theme: 'x'.repeat(80) }, FAST);
    expect(page.purpose.value).toHaveLength(50);
  });

  it('waits for Generate to become enabled (React re-render) before clicking', async () => {
    const page = mountTinyLesson({ language: 'Turkish', enableDelayMs: 40 });
    expect(await startScenario(window, { theme: 'market' }, FAST)).toEqual({ ok: true });
    expect(page.generated).toEqual(['Turkish|market']);
  });

  it('Generate never enabled → {ok:false, reason:"generate"}, nothing clicked', async () => {
    const page = mountTinyLesson({ language: 'Turkish', neverEnable: true });
    expect(await startScenario(window, { theme: 'market' }, FAST)).toEqual({ ok: false, reason: 'generate' });
    expect(page.generated).toEqual([]);
  });

  it('unknown language label → {ok:false, reason:"language"}, purpose untouched', async () => {
    const page = mountTinyLesson({ language: 'Turkish' });
    expect(await startScenario(window, { theme: 'market', targetLabel: 'Klingon' }, FAST)).toEqual({
      ok: false,
      reason: 'language',
    });
    expect(page.purpose.value).toBe('');
    expect(page.generated).toEqual([]);
  });

  it('splash (first visit) → {ok:false, reason:"splash"} and the page is not touched', async () => {
    const start = mountSplash();
    const click = vi.fn();
    start.addEventListener('click', click);
    expect(await startScenario(window, { theme: 'market' }, FAST)).toEqual({ ok: false, reason: 'splash' });
    expect(click).not.toHaveBeenCalled();
  });

  it('"Before you begin" notice → splash too', async () => {
    mountBeforeYouBegin();
    expect(await startScenario(window, { theme: 'market' }, FAST)).toEqual({ ok: false, reason: 'splash' });
  });

  it('ambiguous purpose field → {ok:false, reason:"field"} (never guesses)', async () => {
    const page = mountTinyLesson({ language: 'Turkish' });
    const decoy = document.createElement('input');
    document.body.append(decoy);
    expect(await startScenario(window, { theme: 'market' }, FAST)).toEqual({ ok: false, reason: 'field' });
    expect(page.generated).toEqual([]);
  });

  it('an input inside a display:none parent does not count (getClientRects)', async () => {
    const page = mountTinyLesson({ language: 'Turkish' });
    const box = document.createElement('div');
    box.style.display = 'none';
    box.append(document.createElement('input'));
    document.body.append(box);
    expect(await startScenario(window, { theme: 'market' }, FAST)).toEqual({ ok: true });
    expect(page.generated).toHaveLength(1);
  });

  it.each(['/lll/en/experiments/slang-hang', '/lll/en'])('does nothing outside Tiny Lesson: %s', async (path) => {
    history.pushState({}, '', path);
    const page = mountTinyLesson({ language: 'Turkish' });
    expect(await startScenario(window, { theme: 'market' }, FAST)).toEqual({ ok: false, reason: 'not_tiny_lesson' });
    expect(page.purpose.value).toBe('');
  });

  it('never throws into the page (broken DOM API) → {ok:false, reason:"error"}', async () => {
    mountTinyLesson({ language: 'Turkish' });
    vi.spyOn(document, 'querySelectorAll').mockImplementation(() => {
      throw new Error('boom');
    });
    expect(await startScenario(window, { theme: 'market' }, FAST)).toEqual({ ok: false, reason: 'error' });
  });
});

describe('startScenario message (C9)', () => {
  function start() {
    let onMsg: ((m: unknown, s: { id?: string }, r: (x: unknown) => void) => unknown) | undefined;
    const toaster: Toaster = { show: vi.fn(), hide: vi.fn(), root: null };
    startIsolated({
      win: window,
      runtimeId: 'ext-id',
      sendMessage: vi.fn(async () => ({ ok: true, data: null })),
      onMessage: { addListener: (fn) => void (onMsg = fn) },
      t: (k) => k,
      toaster,
    });
    return (m: unknown, id = 'ext-id') =>
      new Promise<{ keptOpen: unknown; response: unknown }>((resolve) => {
        let keptOpen: unknown;
        keptOpen = onMsg!(m, { id }, (response) => resolve({ keptOpen, response }));
      });
  }

  it('responds asynchronously (keeps the channel open) with the result', async () => {
    const bg = start();
    const page = mountTinyLesson();
    const { keptOpen, response } = await bg({ type: 'startScenario', theme: 'tapas', targetLabel: 'Spanish (Spain)' });
    expect(keptOpen).toBe(true);
    expect(response).toEqual({ ok: true });
    expect(page.generated).toHaveLength(1);
  });

  it('ping answers ready (the panel waits for a freshly opened tab)', async () => {
    const bg = start();
    const { response } = await bg({ type: 'ping' });
    expect(response).toEqual({ ready: true });
  });

  it('a malformed request is answered with reason "invalid"', async () => {
    const bg = start();
    const { response } = await bg({ type: 'startScenario', theme: 5 });
    expect(response).toEqual({ ok: false, reason: 'invalid' });
  });
});
