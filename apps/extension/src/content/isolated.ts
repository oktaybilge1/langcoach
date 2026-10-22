import { createTranslatorCache, type TranslatorCache } from '../lib/translate';
import type { CaptureResult, Response } from '../shared/messages';
import { createNativeOverlay, type NativeOverlay, type OverlayEntry } from './native-overlay';
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
  /** On-device translator (defaults to the global Translator API; absent → no translations). */
  translator?: TranslatorCache;
  /** Subscribes to settings.showNativeOnPage changes (chrome.storage.onChanged in production). */
  onShowNativeChanged?: (cb: (show: boolean) => void) => void;
  overlayDebounceMs?: number;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** LLL caps the Tiny Lesson purpose at 50 characters. */
export const PURPOSE_MAX = 50;
const TINY_LESSON_PATH = /^\/lll\/[a-z]{2}(?:[-_][a-z]{2,4})?\/experiments\/tiny-lesson\/?$/i;

function isUsable(win: Window, el: HTMLInputElement): boolean {
  if (el.disabled || el.hidden || el.closest('[hidden], [aria-hidden="true"]')) return false;
  const cs = win.getComputedStyle(el);
  return cs.display !== 'none' && cs.visibility !== 'hidden';
}

/**
 * The Tiny Lesson purpose field: exactly one usable `input` whose type is text and that is not the
 * language combobox (live markup: no form, no maxLength, no type attribute, rotating placeholder).
 * Anything else is ambiguous, so null; never "the first input on the page".
 */
function findPurposeField(win: Window): HTMLInputElement | null {
  const candidates = [...win.document.querySelectorAll('input')].filter(
    (el) => el.type === 'text' && el.getAttribute('role') !== 'combobox' && isUsable(win, el),
  );
  return candidates.length === 1 ? candidates[0]! : null;
}

/**
 * Writes `theme` into the Tiny Lesson purpose field so that React registers it: the value goes through the
 * element's own prototype setter (bypassing React's instance-level value tracker), then a bubbling `input`
 * event. Returns false (and changes nothing) outside the Tiny Lesson page or when the field is not found.
 */
export function fillPurposeField(win: Window, theme: string): boolean {
  const w = win as Window & typeof globalThis;
  if (!TINY_LESSON_PATH.test(win.location.pathname)) return false;
  const el = findPurposeField(win);
  if (!el) return false;
  const limit = el.maxLength > 0 ? Math.min(el.maxLength, PURPOSE_MAX) : PURPOSE_MAX;
  const value = [...theme].slice(0, limit).join('');
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')?.set;
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
export function startIsolated(deps: IsolatedDeps): { nonce: string; dispose: () => void } {
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

  const translator = deps.translator ?? createTranslatorCache();
  let overlay: NativeOverlay | null = null;
  let overlayLang = '';
  let showOnPage = true;

  function overlayFor(lang: string): NativeOverlay {
    if (!overlay || overlayLang !== lang) {
      overlay?.destroy();
      overlay = createNativeOverlay(win.document, { lang, debounceMs: deps.overlayDebounceMs });
      overlayLang = lang;
    }
    overlay.setEnabled(showOnPage);
    return overlay;
  }

  try {
    deps.onShowNativeChanged?.((show) => {
      showOnPage = show;
      overlay?.setEnabled(show);
    });
  } catch {
    /* settings changes are optional */
  }

  const str = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';

  /**
   * After the background saved a capture: translate meanings that have no native translation yet (only
   * when the model is already on this device; no download without a click), store them, and show them
   * under LLL's meanings. Grammar examples are only shown, not stored. Any failure leaves English as is.
   */
  async function applyNative(r: CaptureResult): Promise<void> {
    try {
      const hint = (r as { native?: unknown }).native;
      if (!isObj(hint) || !str(hint.source) || !str(hint.target)) return;
      const { source, target } = hint;
      if (typeof hint.overlay === 'boolean') showOnPage = hint.overlay;
      const shown: OverlayEntry[] = [];
      if (r.status === 'saved') {
        const items = (Array.isArray(hint.items) ? hint.items : [])
          .filter((i): i is Record<string, unknown> => isObj(i) && str(i.cardId) && str(i.meaning))
          .map((i) => ({
            cardId: i.cardId as string,
            term: typeof i.term === 'string' ? i.term : '',
            meaning: i.meaning as string,
            native: str(i.native) ? i.native : undefined,
          }));
        if (items.length === 0) return;
        const missing = items.filter((i) => !i.native);
        const out = missing.length ? await translator.translateMany(missing.map((i) => i.meaning), source, target) : [];
        const entries: { cardId: string; text: string }[] = [];
        missing.forEach((i, k) => {
          const text = out[k];
          if (text) {
            i.native = text;
            entries.push({ cardId: i.cardId, text });
          }
        });
        if (entries.length) void ask({ type: 'setNativeTranslations', entries: entries.slice(0, 500) });
        for (const i of items) if (i.native) shown.push({ term: i.term, meaning: i.meaning, native: i.native });
      } else if (r.status === 'grammar') {
        const examples = (Array.isArray(hint.examples) ? hint.examples : []).filter(str).slice(0, 100);
        const out = examples.length ? await translator.translateMany(examples, source, target) : [];
        examples.forEach((ex, k) => {
          const text = out[k];
          if (text) shown.push({ meaning: ex, native: text });
        });
      }
      if (shown.length) overlayFor(target).add(shown);
    } catch {
      /* never break the page; English stays */
    }
  }

  function withXp(text: string, xp: number): string {
    return xp > 0 ? `${text} · ${t('toastXp', String(xp))}` : text;
  }

  function showResult(r: CaptureResult | null | undefined, capture: Record<string, unknown>): void {
    if (!isObj(r)) return;
    if (r.status === 'saved' || r.status === 'grammar') void applyNative(r);
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

  return {
    nonce,
    /** Removes the native-language lines and stops observing the page (tests, extension reload). */
    dispose: () => {
      overlay?.destroy();
      overlay = null;
    },
  };
}
