// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createToaster } from '../src/content/toast';

beforeEach(() => {
  vi.useFakeTimers();
  document.documentElement.innerHTML = '<head></head><body></body>';
});
afterEach(() => {
  vi.useRealTimers();
});

const host = () => document.documentElement.querySelector(':scope > [data-langcoach-toast]') as HTMLElement | null;

describe('toast', () => {
  it('renders text and buttons in a closed shadow root on documentElement', () => {
    const t = createToaster(document);
    t.show({ text: '✓ 12 words saved to LangCoach', actions: [{ label: 'Undo', onClick: () => {} }, { label: 'Open', onClick: () => {} }] });
    const h = host();
    expect(h).not.toBeNull();
    expect(h!.parentElement).toBe(document.documentElement);
    expect(h!.shadowRoot).toBeNull(); // closed
    const root = t.root!;
    const box = root.querySelector('[role="status"]')!;
    expect(box.getAttribute('aria-live')).toBe('polite');
    expect(box.textContent).toContain('✓ 12 words saved to LangCoach');
    const buttons = [...root.querySelectorAll('button')];
    expect(buttons.map((b) => b.textContent)).toEqual(['Undo', 'Open']);
    expect(buttons.every((b) => b.type === 'button')).toBe(true);
  });

  it('positions bottom-left, max-width 360px, max z-index, color-scheme aware', () => {
    const t = createToaster(document);
    t.show({ text: 'x' });
    const css = t.root!.querySelector('style')!.textContent!;
    expect(css).toContain('max-width: 360px');
    expect(css).toContain('left:');
    expect(css).toContain('bottom:');
    expect(css).toContain('2147483647');
    expect(css).toContain('prefers-color-scheme: dark');
  });

  it('button clicks call their handlers', () => {
    const undo = vi.fn();
    const t = createToaster(document);
    t.show({ text: 'x', actions: [{ label: 'Undo', onClick: undo }] });
    t.root!.querySelector('button')!.click();
    expect(undo).toHaveBeenCalledOnce();
  });

  it('auto-hides after 6 s', () => {
    const t = createToaster(document);
    t.show({ text: 'x' });
    vi.advanceTimersByTime(5999);
    expect(host()).not.toBeNull();
    vi.advanceTimersByTime(1);
    expect(host()).toBeNull();
  });

  it('pauses auto-hide while hovered or focused', () => {
    const t = createToaster(document);
    t.show({ text: 'x', actions: [{ label: 'Open', onClick: () => {} }] });
    vi.advanceTimersByTime(4000);
    host()!.dispatchEvent(new MouseEvent('mouseenter'));
    vi.advanceTimersByTime(20_000);
    expect(host()).not.toBeNull();
    host()!.dispatchEvent(new MouseEvent('mouseleave'));
    vi.advanceTimersByTime(1999);
    expect(host()).not.toBeNull();
    vi.advanceTimersByTime(1);
    expect(host()).toBeNull();

    t.show({ text: 'y', actions: [{ label: 'Open', onClick: () => {} }] });
    host()!.dispatchEvent(new FocusEvent('focusin'));
    vi.advanceTimersByTime(20_000);
    expect(host()).not.toBeNull();
    host()!.dispatchEvent(new FocusEvent('focusout'));
    vi.advanceTimersByTime(6000);
    expect(host()).toBeNull();
  });

  it('a new toast replaces the old one and restarts the timer', () => {
    const t = createToaster(document);
    t.show({ text: 'first' });
    vi.advanceTimersByTime(5000);
    t.show({ text: 'second' });
    expect(document.querySelectorAll('[data-langcoach-toast]')).toHaveLength(1);
    expect(t.root!.textContent).toContain('second');
    expect(t.root!.textContent).not.toContain('first');
    vi.advanceTimersByTime(5000);
    expect(host()).not.toBeNull();
  });

  it('hide() removes it and never throws', () => {
    const t = createToaster(document);
    t.hide();
    t.show({ text: 'x' });
    t.hide();
    expect(host()).toBeNull();
  });
});
