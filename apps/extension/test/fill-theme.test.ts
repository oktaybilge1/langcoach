// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fillPurposeField, startIsolated } from '../src/content/isolated';
import type { Toaster } from '../src/content/toast';

const TINY = '/lll/en/experiments/tiny-lesson';

/**
 * Simulates a React controlled input: React tracks the last value it set through an instance-level `value`
 * property and ignores an `input` event when the DOM value equals the tracked value. A plain `el.value = x`
 * updates the tracker too, so React never sees the change; only the native prototype setter gets through.
 */
function reactInput(attrs: { maxLength?: number; placeholder?: string } = {}) {
  const el = document.createElement('input');
  el.type = 'text';
  if (attrs.maxLength !== undefined) el.maxLength = attrs.maxLength;
  if (attrs.placeholder !== undefined) el.placeholder = attrs.placeholder;
  const native = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!;
  let tracked = '';
  Object.defineProperty(el, 'value', {
    configurable: true,
    get() {
      return native.get!.call(this);
    },
    set(v: string) {
      tracked = String(v);
      native.set!.call(this, v);
    },
  });
  const reactState: string[] = [];
  el.addEventListener('input', () => {
    const current = native.get!.call(el) as string;
    if (current !== tracked) {
      tracked = current;
      reactState.push(current);
    }
  });
  return { el, reactState };
}

function decoys() {
  const search = document.createElement('input');
  search.type = 'text';
  search.placeholder = 'Search';
  const area = document.createElement('textarea');
  document.body.append(search, area);
  return { search, area };
}

beforeEach(() => {
  document.body.innerHTML = '';
  history.pushState({}, '', TINY);
});
afterEach(() => {
  history.pushState({}, '', '/');
  vi.restoreAllMocks();
});

describe('fillPurposeField (I2)', () => {
  it('fills the maxLength=50 input inside the experiment form so React sees the change, skipping decoys', () => {
    const { search, area } = decoys();
    const form = document.createElement('form');
    const other = document.createElement('input');
    other.type = 'text';
    const { el, reactState } = reactInput({ maxLength: 50 });
    form.append(other, el);
    document.body.append(form);

    expect(fillPurposeField(window, 'ordering coffee at a cafe')).toBe(true);
    expect(el.value).toBe('ordering coffee at a cafe');
    expect(reactState).toEqual(['ordering coffee at a cafe']);
    expect(search.value).toBe('');
    expect(area.value).toBe('');
    expect(other.value).toBe('');
  });

  it('caps the text at 50 characters', () => {
    const { el } = reactInput({ maxLength: 50 });
    const form = document.createElement('form');
    form.append(el);
    document.body.append(form);
    expect(fillPurposeField(window, 'x'.repeat(80))).toBe(true);
    expect(el.value).toHaveLength(50);
  });

  it.each([
    ['en', 'What do you want to learn? Describe a situation'],
    ['es', '¿Qué quieres aprender? Describe una situación'],
    ['fr', 'Décrivez une situation'],
    ['pt', 'Descreva uma situação'],
  ])('falls back to a placeholder hint (%s)', (lang, placeholder) => {
    history.pushState({}, '', `/lll/${lang}/experiments/tiny-lesson`);
    decoys();
    const { el, reactState } = reactInput({ placeholder });
    document.body.append(el);
    expect(fillPurposeField(window, 'hotel check-in')).toBe(true);
    expect(reactState).toEqual(['hotel check-in']);
  });

  it('reports not found instead of taking the first input on the page', () => {
    const { search, area } = decoys();
    expect(fillPurposeField(window, 'hotel check-in')).toBe(false);
    expect(search.value).toBe('');
    expect(area.value).toBe('');
  });

  it.each(['/lll/en/experiments/slang-hang', '/lll/en', '/lll/en/experiments/tiny-lesson-x', '/other/en/experiments/tiny-lesson'])(
    'does nothing outside the Tiny Lesson page: %s',
    (path) => {
      history.pushState({}, '', path);
      const { el } = reactInput({ maxLength: 50 });
      const form = document.createElement('form');
      form.append(el);
      document.body.append(form);
      expect(fillPurposeField(window, 'hotel check-in')).toBe(false);
      expect(el.value).toBe('');
    },
  );
});

describe('fillTheme message (I2)', () => {
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
    return (m: unknown, id = 'ext-id') => {
      const respond = vi.fn();
      onMsg!(m, { id }, respond);
      return respond;
    };
  }

  it('responds {filled:true} when the purpose field was filled', () => {
    const bg = start();
    const { el } = reactInput({ maxLength: 50 });
    const form = document.createElement('form');
    form.append(el);
    document.body.append(form);
    expect(bg({ type: 'fillTheme', theme: 'hotel check-in' })).toHaveBeenCalledWith({ filled: true });
  });

  it('responds {filled:false} when no purpose field is found', () => {
    const bg = start();
    decoys();
    expect(bg({ type: 'fillTheme', theme: 'hotel check-in' })).toHaveBeenCalledWith({ filled: false });
  });

  it('ignores fillTheme from another extension', () => {
    const bg = start();
    expect(bg({ type: 'fillTheme', theme: 'x' }, 'other')).not.toHaveBeenCalled();
  });
});
