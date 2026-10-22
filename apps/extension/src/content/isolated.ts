import type { CaptureResult, Response } from '../shared/messages';
import { ACK_SOURCE, CAPTURE_SOURCE, NONCE_ATTR } from './protocol';
import { createToaster, type Toaster } from './toast';

export { NONCE_ATTR } from './protocol';

const KINDS = ['terms', 'grammar', 'conversation', 'object-descriptors'];

export interface IsolatedDeps {
  win: Window;
  runtimeId: string;
  sendMessage: (msg: unknown) => Promise<unknown>;
  onMessage: {
    addListener(fn: (msg: unknown, sender: { id?: string }, sendResponse: (response: unknown) => void) => void): void;
  };
  /** chrome.i18n.getMessage */
  t: (key: string, substitutions?: string | string[]) => string;
  toaster?: Toaster;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** LLL caps the Tiny Lesson purpose at 50 characters. */
export const PURPOSE_MAX = 50;
const TINY_LESSON_PATH = /^\/lll\/[a-z]{2}(?:[-_][a-z]{2,4})?\/experiments\/tiny-lesson\/?$/i;
/** Placeholder hints of the purpose field in LLL's 4 UI languages (en, es, fr, pt); fallback only. */
const PLACEHOLDER_HINT = /purpose|situation|situación|propósito|objectif|décri|situação|objetivo|descreva/i;
const TEXT_TYPES = ['text', 'search', ''];

function isTextInput(el: Element): el is HTMLInputElement {
  return el.tagName === 'INPUT' && TEXT_TYPES.includes((el.getAttribute('type') ?? '').toLowerCase());
}

/** The Tiny Lesson purpose field, or null; never just "the first input on the page". */
function findPurposeField(doc: Document): HTMLInputElement | HTMLTextAreaElement | null {
  const inForm = [...doc.querySelectorAll('form input')].filter(isTextInput);
  const byMax = inForm.find((el) => el.maxLength === PURPOSE_MAX);
  if (byMax) return byMax;
  const candidates = [...doc.querySelectorAll('input, textarea')].filter(
    (el): el is HTMLInputElement | HTMLTextAreaElement => el.tagName === 'TEXTAREA' || isTextInput(el),
  );
  return candidates.find((el) => PLACEHOLDER_HINT.test(el.placeholder ?? '')) ?? null;
}

/**
 * Writes `theme` into the Tiny Lesson purpose field so that React registers it: the value goes through the
 * native prototype setter (bypassing React's value tracker) followed by a bubbling `input` event.
 * Returns false (and changes nothing) outside the Tiny Lesson page or when the field is not found.
 */
export function fillPurposeField(win: Window, theme: string): boolean {
  const w = win as Window & typeof globalThis;
  if (!TINY_LESSON_PATH.test(win.location.pathname)) return false;
  const el = findPurposeField(win.document);
  if (!el) return false;
  const limit = el.maxLength > 0 ? Math.min(el.maxLength, PURPOSE_MAX) : PURPOSE_MAX;
  const value = [...theme].slice(0, limit).join('');
  const proto = el.tagName === 'TEXTAREA' ? w.HTMLTextAreaElement.prototype : w.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (!setter) return false;
  el.focus();
  setter.call(el, value);
  el.dispatchEvent(new w.Event('input', { bubbles: true }));
  return true;
}

function randomNonce(win: Window): string {
  const b = new Uint8Array(16);
  win.crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

/**
 * Isolated-world entry (document_start). Publishes a per-page nonce for the MAIN-world script, accepts
 * only same-window, same-origin captures carrying that nonce, relays them to the background and shows
 * the result as a toast. A page script that reads the nonce could still forge a capture; the worst it
 * can do is add vocabulary to the learner's own deck.
 */
export function startIsolated(deps: IsolatedDeps): { nonce: string } {
  const { win, t } = deps;
  const toaster = deps.toaster ?? createToaster(win.document);
  const nonce = randomNonce(win);
  win.document.documentElement.setAttribute(NONCE_ATTR, nonce);

  /** Resolves to the response data, or undefined on any failure (errors stay in the extension). */
  async function ask<T>(msg: unknown): Promise<T | undefined> {
    try {
      const res = (await deps.sendMessage(msg)) as Response<T> | undefined;
      return res && res.ok ? res.data : undefined;
    } catch {
      return undefined; // e.g. extension reloaded: "Extension context invalidated"
    }
  }

  const openAction = () => ({
    label: t('toastOpen'),
    onClick: () => {
      // Sent synchronously from the click so the background still has the user gesture for sidePanel.open().
      void ask({ type: 'openPanel' });
      toaster.hide();
    },
  });

  function withXp(text: string, xp: number): string {
    return xp > 0 ? `${text} · ${t('toastXp', String(xp))}` : text;
  }

  function showResult(r: CaptureResult | null | undefined, capture: Record<string, unknown>): void {
    if (!isObj(r)) return;
    if (r.status === 'pending') {
      toaster.show({
        text: t('extName'),
        actions: [
          {
            label: t('toastSaveN', String(r.count)),
            onClick: () => {
              toaster.hide();
              void ask<CaptureResult | null>({ ...capture, force: true }).then((res) => showResult(res, capture));
            },
          },
        ],
      });
      return;
    }
    if (r.status !== 'saved') return;
    if (r.newCards === 0) {
      toaster.show({ text: withXp(t('toastAlready'), r.xp), actions: [openAction()] });
      return;
    }
    const lessonIds = r.lessonIds;
    toaster.show({
      text: withXp(t('toastSaved', String(r.newCards)), r.xp),
      actions: [
        {
          label: t('toastUndo'),
          onClick: () => {
            toaster.hide();
            void ask<{ removedCards: number }>({ type: 'undo', lessonIds }).then((u) => {
              if (u) toaster.show({ text: t('toastRemoved') });
            });
          },
        },
        openAction(),
      ],
    });
  }

  win.addEventListener('message', (e: MessageEvent) => {
    try {
      if (e.source !== win || e.origin !== win.location.origin) return;
      const d: unknown = e.data;
      if (!isObj(d) || d.nonce !== nonce) return;
      if (d.source === ACK_SOURCE) {
        win.document.documentElement.removeAttribute(NONCE_ATTR);
        return;
      }
      if (d.source !== CAPTURE_SOURCE || !KINDS.includes(d.kind as string)) return;
      const capture = {
        type: 'capture',
        kind: d.kind,
        request: d.request,
        response: d.response,
        pageUrl: win.location.href,
      };
      // Pending captures (autoSave off) live only in this closure, never in storage.
      void ask<CaptureResult | null>(capture).then((r) => showResult(r, capture));
    } catch {
      /* never break the page */
    }
  });

  deps.onMessage.addListener((msg, sender, sendResponse) => {
    if (sender?.id !== deps.runtimeId || !isObj(msg)) return;
    if (msg.type === 'fillTheme' && typeof msg.theme === 'string') {
      let filled = false;
      try {
        filled = fillPurposeField(win, msg.theme);
      } catch {
        /* never break the page */
      }
      sendResponse?.({ filled });
      return;
    }
    if (msg.type !== 'toast') return;
    if (msg.variant === 'manual') toaster.show({ text: t('toastSavedManual'), actions: [openAction()] });
    else if (msg.variant === 'already') toaster.show({ text: t('toastAlready'), actions: [openAction()] });
  });

  return { nonce };
}
