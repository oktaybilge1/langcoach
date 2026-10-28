import { createTranslatorCache, type TranslatorCache } from '../lib/translate';
import type { CaptureResult, Response } from '../shared/messages';
import { createNativeOverlay, type NativeOverlay, type OverlayEntry } from './native-overlay';
import { fillPurposeField, startScenario, type ScenarioResult } from './scenario';
import { ACK_SOURCE, CAPTURE_SOURCE, NONCE_ATTR } from './protocol';
import { createToaster, type Toaster } from './toast';

export { NONCE_ATTR } from './protocol';
export { PURPOSE_MAX, fillPurposeField } from './scenario';

const KINDS = ['terms', 'grammar', 'conversation', 'object-descriptors'];

export interface IsolatedDeps {
  win: Window;
  runtimeId: string;
  sendMessage: (msg: unknown) => Promise<unknown>;
  onMessage: {
    /** Returning true keeps the response channel open for an asynchronous sendResponse. */
    addListener(
      fn: (msg: unknown, sender: { id?: string }, sendResponse: (response: unknown) => void) => boolean | void,
    ): void;
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
    if (msg.type === 'ping') {
      sendResponse?.({ ready: true });
      return;
    }
    if (msg.type === 'startScenario') {
      const valid =
        typeof msg.theme === 'string' &&
        msg.theme.trim() !== '' &&
        (msg.targetLabel === undefined || typeof msg.targetLabel === 'string');
      if (!valid) {
        sendResponse?.({ ok: false, reason: 'invalid' } satisfies ScenarioResult);
        return;
      }
      void startScenario(win, {
        theme: msg.theme as string,
        ...(typeof msg.targetLabel === 'string' && msg.targetLabel ? { targetLabel: msg.targetLabel } : {}),
      })
        .catch((): ScenarioResult => ({ ok: false, reason: 'error' }))
        .then((r) => {
          try {
            sendResponse?.(r);
          } catch {
            /* the panel went away */
          }
        });
      return true;
    }
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
