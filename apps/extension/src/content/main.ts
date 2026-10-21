import { wrapFetch, type RawCapture } from './fetch-wrap';
import { ACK_SOURCE, CAPTURE_SOURCE, NONCE_ATTR } from './protocol';
const WRAPPED = Symbol.for('langcoach.fetchWrapped');

/**
 * MAIN-world entry (document_start): wraps window.fetch and posts lesson captures to the isolated
 * content script. Never throws into the page.
 */
export function startMain(win: Window, opts: { allowLocalhost: boolean }): void {
  try {
    const current = win.fetch as typeof fetch & { [WRAPPED]?: true };
    if (typeof current !== 'function' || current[WRAPPED]) return;

    let nonce: string | null = null;
    const takeNonce = (): string | null => {
      if (nonce) return nonce;
      const v = win.document.documentElement?.getAttribute(NONCE_ATTR);
      if (!v) return null;
      nonce = v; // read once; the isolated script removes the attribute after our ack
      try {
        win.postMessage({ source: ACK_SOURCE, nonce: v }, win.location.origin);
      } catch {
        /* ignore */
      }
      return nonce;
    };
    takeNonce();

    const onCapture = (c: RawCapture) => {
      const n = takeNonce();
      if (!n) return;
      try {
        win.postMessage({ source: CAPTURE_SOURCE, nonce: n, ...c }, win.location.origin);
      } catch {
        /* e.g. DataCloneError: drop silently */
      }
    };
    const wrapped = wrapFetch(current, onCapture, {
      base: () => win.location.href,
      allowLocalhost: opts.allowLocalhost,
    }) as typeof fetch & { [WRAPPED]?: true };
    wrapped[WRAPPED] = true;
    win.fetch = wrapped;
  } catch {
    // never break the page
  }
}
