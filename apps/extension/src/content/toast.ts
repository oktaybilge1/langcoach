export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastSpec {
  text: string;
  actions?: ToastAction[];
}

export interface Toaster {
  show(spec: ToastSpec): void;
  hide(): void;
  /** The closed shadow root of the current toast (isolated world only; for tests). */
  readonly root: ShadowRoot | null;
}

export const TOAST_MS = 6000;

const CSS = `
:host { all: initial; }
.box {
  position: fixed;
  left: 16px;
  bottom: 16px;
  z-index: 2147483647;
  max-width: 360px;
  box-sizing: border-box;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
  padding: 10px 14px;
  border-radius: 14px;
  font: 500 14px/1.4 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  color: #1d2433;
  background: #ffffff;
  border: 1px solid #d9dee8;
  box-shadow: 0 6px 24px rgba(16, 24, 40, 0.18);
}
.text { flex: 1 1 auto; min-width: 0; overflow-wrap: anywhere; }
.actions { display: flex; gap: 6px; }
button {
  font: inherit;
  font-weight: 600;
  cursor: pointer;
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px solid #b9c3d6;
  background: #f2f5fb;
  color: #1a4fd6;
}
button:hover { background: #e4ebfa; }
button:focus-visible { outline: 3px solid #1a4fd6; outline-offset: 2px; }
@media (prefers-color-scheme: dark) {
  .box { color: #e8ecf4; background: #1f2430; border-color: #3a4256; box-shadow: 0 6px 24px rgba(0, 0, 0, 0.5); }
  button { color: #9ec0ff; background: #2a3142; border-color: #4a5470; }
  button:hover { background: #343c50; }
  button:focus-visible { outline-color: #9ec0ff; }
}
@media (prefers-reduced-motion: no-preference) {
  .box { animation: in 160ms ease-out; }
  @keyframes in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
}
`;

/**
 * One toast at a time, bottom-left (clear of the lesson page's main buttons), in a closed shadow
 * root on a host appended to <html>. Auto-hides after 6 s; hovering or focusing it pauses the timer.
 */
export function createToaster(doc: Document = document, duration = TOAST_MS): Toaster {
  let host: HTMLElement | null = null;
  let root: ShadowRoot | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let deadline = 0;
  let remaining = duration;
  let hovered = false;
  let focused = false;

  const clear = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };
  const start = (ms: number) => {
    clear();
    remaining = ms;
    deadline = Date.now() + ms;
    timer = setTimeout(hide, ms);
  };
  const pause = () => {
    if (timer === undefined) return;
    remaining = Math.max(0, deadline - Date.now());
    clear();
  };
  const resume = () => {
    if (!hovered && !focused && host) start(remaining);
  };

  function hide(): void {
    clear();
    try {
      host?.remove();
    } catch {
      /* ignore */
    }
    host = null;
    root = null;
    hovered = focused = false;
  }

  function show(spec: ToastSpec): void {
    hide();
    const h = doc.createElement('div');
    h.setAttribute('data-langcoach-toast', '');
    const r = h.attachShadow({ mode: 'closed' });
    const style = doc.createElement('style');
    style.textContent = CSS;
    const box = doc.createElement('div');
    box.className = 'box';
    box.setAttribute('role', 'status');
    box.setAttribute('aria-live', 'polite');
    const text = doc.createElement('span');
    text.className = 'text';
    text.textContent = spec.text;
    box.append(text);
    if (spec.actions?.length) {
      const actions = doc.createElement('span');
      actions.className = 'actions';
      for (const a of spec.actions) {
        const b = doc.createElement('button');
        b.type = 'button';
        b.textContent = a.label;
        b.addEventListener('click', (e) => {
          e.stopPropagation();
          a.onClick();
        });
        actions.append(b);
      }
      box.append(actions);
    }
    r.append(style, box);
    h.addEventListener('mouseenter', () => {
      hovered = true;
      pause();
    });
    h.addEventListener('mouseleave', () => {
      hovered = false;
      resume();
    });
    h.addEventListener('focusin', () => {
      focused = true;
      pause();
    });
    h.addEventListener('focusout', () => {
      focused = false;
      resume();
    });
    doc.documentElement.append(h);
    host = h;
    root = r;
    start(duration);
  }

  return {
    show,
    hide,
    get root() {
      return root;
    },
  };
}
