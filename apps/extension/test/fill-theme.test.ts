// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fillPurposeField, startIsolated } from '../src/content/isolated';
import type { Toaster } from '../src/content/toast';
import { stubLayout } from './layout-stub';

const TINY = '/lll/en/experiments/tiny-lesson';

/**
 * Simulates a React controlled input: React tracks the last value it set through an instance-level `value`
 * property and ignores an `input` event when the DOM value equals the tracked value. A plain `el.value = x`
 * updates the tracker too, so React never sees the change; only the native prototype setter gets through.
 */
function reactInput() {
  // Live LLL markup: no type attribute, no maxLength, not inside a form, rotating placeholder.
  const el = document.createElement('input');
  el.placeholder = Math.random() < 0.5 ? 'going on a first date' : 'scuba diving';
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

/** The language picker on the live page: a text input with role="combobox". */
function languageCombobox() {
  const combo = document.createElement('input');
  combo.setAttribute('role', 'combobox');
  combo.setAttribute('aria-label', 'Select Language');
  document.body.append(combo);
  return combo;
}

/** The live page layout: combobox first, then the purpose input in a plain div. */
function livePage() {
  const combo = languageCombobox();
  const wrap = document.createElement('div');
  const { el, reactState } = reactInput();
  wrap.append(el);
  document.body.append(wrap);
  return { combo, el, reactState };
}

beforeEach(() => {
  document.body.replaceChildren();
  history.pushState({}, '', TINY);
  stubLayout(); // jsdom has no layout: isUsable relies on getClientRects()
});
afterEach(() => {
  history.pushState({}, '', '/');
  vi.restoreAllMocks();
});

describe('fillPurposeField (I2)', () => {
  it('fills the only plain text input (live markup) so React sees the change, skipping the combobox', () => {
    const { combo, el, reactState } = livePage();
    expect(el.maxLength).toBe(-1);
    expect(el.hasAttribute('type')).toBe(false);
    expect(fillPurposeField(window, 'ordering coffee at a cafe')).toBe(true);
    expect(el.value).toBe('ordering coffee at a cafe');
    expect(reactState).toEqual(['ordering coffee at a cafe']);
    expect(combo.value).toBe('');
  });

  it('caps the text at 50 characters', () => {
    const { el } = livePage();
    expect(fillPurposeField(window, 'x'.repeat(80))).toBe(true);
    expect(el.value).toHaveLength(50);
  });

  it('ignores hidden, disabled and non-text inputs when counting', () => {
    const { el, reactState } = livePage();
    const hidden = document.createElement('input');
    hidden.type = 'text';
    hidden.hidden = true;
    const disabled = document.createElement('input');
    disabled.disabled = true;
    const invisible = document.createElement('input');
    invisible.style.display = 'none';
    const file = document.createElement('input');
    file.type = 'file';
    const area = document.createElement('textarea');
    document.body.append(hidden, disabled, invisible, file, area);
    expect(fillPurposeField(window, 'hotel check-in')).toBe(true);
    expect(reactState).toEqual(['hotel check-in']);
    expect(el.value).toBe('hotel check-in');
    expect(hidden.value + disabled.value + invisible.value + area.value).toBe('');
  });

  it('reports not found when two plain text inputs exist (ambiguous)', () => {
    const { el } = livePage();
    const decoy = document.createElement('input');
    decoy.type = 'text';
    document.body.prepend(decoy);
    expect(fillPurposeField(window, 'hotel check-in')).toBe(false);
    expect(decoy.value).toBe('');
    expect(el.value).toBe('');
  });

  it('reports not found when only the combobox exists', () => {
    const combo = languageCombobox();
    expect(fillPurposeField(window, 'hotel check-in')).toBe(false);
    expect(combo.value).toBe('');
  });

  it.each(['/lll/en/experiments/slang-hang', '/lll/en', '/lll/en/experiments/tiny-lesson-x', '/other/en/experiments/tiny-lesson'])(
    'does nothing outside the Tiny Lesson page: %s',
    (path) => {
      history.pushState({}, '', path);
      const { el } = livePage();
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
    livePage();
    expect(bg({ type: 'fillTheme', theme: 'hotel check-in' })).toHaveBeenCalledWith({ filled: true });
  });

  it('responds {filled:false} when no single purpose field is found', () => {
    const bg = start();
    livePage();
    document.body.append(document.createElement('input'));
    expect(bg({ type: 'fillTheme', theme: 'hotel check-in' })).toHaveBeenCalledWith({ filled: false });
  });

  it('ignores fillTheme from another extension', () => {
    const bg = start();
    expect(bg({ type: 'fillTheme', theme: 'x' }, 'other')).not.toHaveBeenCalled();
  });
});
