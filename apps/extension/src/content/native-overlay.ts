/**
 * Best-effort native-language line under LLL's own meanings ("coffee" → "kahve"). Finds leaf elements
 * whose visible text equals a saved English meaning (or, when no meaning element exists for an entry,
 * the term) and inserts one small marked span right after them. LLL's own nodes are never edited; a
 * debounced MutationObserver re-applies after LLL re-renders. Every failure is swallowed.
 */

export const NATIVE_ATTR = 'data-langcoach-native';

export interface OverlayEntry {
  /** Target-language term as saved (gendered pairs joined with " / "). */
  term?: string;
  /** The English meaning shown by LLL (or a grammar example translation). */
  meaning: string;
  /** Native-language text to show. */
  native: string;
}

export interface NativeOverlay {
  add(entries: OverlayEntry[]): void;
  setEnabled(enabled: boolean): void;
  destroy(): void;
}

const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'TEXTAREA', 'INPUT', 'SELECT', 'OPTION', 'TITLE', 'HEAD']);
const MAX_ENTRIES = 1000;
const MAX_TEXT = 500;

const norm = (s: string): string => s.replace(/\s+/g, ' ').trim();
const termVariants = (term: string): string[] => {
  const n = norm(term);
  return n.includes(' / ') ? [n, norm(n.split(' / ').join(' '))] : [n];
};

const isOurs = (el: Element): boolean => el.hasAttribute(NATIVE_ATTR) || el.closest('[data-langcoach-toast]') !== null;

export function createNativeOverlay(doc: Document, opts: { lang: string; debounceMs?: number }): NativeOverlay {
  const debounceMs = opts.debounceMs ?? 250;
  /** meaning key → native; term key → native (fallback only). */
  const byMeaning = new Map<string, string>();
  const byTerm = new Map<string, { native: string; meaning: string }>();
  let enabled = true;
  let destroyed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let observer: MutationObserver | undefined;

  function makeSpan(key: string, native: string): HTMLElement {
    const span = doc.createElement('span');
    span.className = 'langcoach-native';
    span.setAttribute(NATIVE_ATTR, key);
    span.setAttribute('dir', 'auto');
    span.setAttribute('lang', opts.lang);
    span.style.display = 'block';
    span.style.fontSize = '0.85em';
    span.style.lineHeight = '1.3';
    span.style.opacity = '0.72';
    span.style.marginTop = '2px';
    span.style.fontStyle = 'normal';
    span.textContent = native;
    return span;
  }

  function removeAll(): void {
    for (const s of [...doc.querySelectorAll(`[${NATIVE_ATTR}]`)]) s.remove();
  }

  /** Puts `native` right after `el` (updating our existing span there); returns true if the DOM changed. */
  function place(el: Element, key: string, native: string): void {
    const next = el.nextElementSibling;
    if (next && next.hasAttribute(NATIVE_ATTR)) {
      if (next.getAttribute(NATIVE_ATTR) !== key) next.setAttribute(NATIVE_ATTR, key);
      if (next.textContent !== native) next.textContent = native;
      return;
    }
    el.after(makeSpan(key, native));
  }

  function apply(): void {
    try {
      if (destroyed || !doc.body) return;
      if (!enabled || (byMeaning.size === 0 && byTerm.size === 0)) {
        if (doc.querySelector(`[${NATIVE_ATTR}]`)) removeAll();
        return;
      }
      const meaningHits: [Element, string, string][] = [];
      const termHits: [Element, string, string, string][] = [];
      for (const el of doc.body.querySelectorAll('*')) {
        if (el.childElementCount !== 0 || SKIP.has(el.tagName) || isOurs(el)) continue;
        const text = el.textContent;
        if (!text || text.length > MAX_TEXT * 2) continue;
        const k = norm(text);
        const m = byMeaning.get(k);
        if (m !== undefined) {
          meaningHits.push([el, k, m]);
          continue;
        }
        const t = byTerm.get(k);
        if (t !== undefined) termHits.push([el, k, t.native, t.meaning]);
      }
      const keep = new Set<Element>();
      const shownMeanings = new Set(meaningHits.map(([, k]) => k));
      for (const [el, k, native] of meaningHits) {
        place(el, k, native);
        keep.add(el.nextElementSibling!);
      }
      for (const [el, k, native, meaning] of termHits) {
        if (shownMeanings.has(meaning)) continue; // LLL shows the meaning: the line goes there, not under the term
        place(el, k, native);
        keep.add(el.nextElementSibling!);
      }
      // Lines whose anchor changed or vanished are removed.
      for (const s of [...doc.querySelectorAll(`[${NATIVE_ATTR}]`)]) if (!keep.has(s)) s.remove();
    } catch {
      /* never break the page */
    }
  }

  function schedule(): void {
    if (destroyed) return;
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      apply();
    }, debounceMs);
  }

  function observe(): void {
    if (observer || destroyed) return;
    try {
      const MO = (doc.defaultView as (Window & typeof globalThis) | null)?.MutationObserver;
      if (!MO || !doc.body) return;
      observer = new MO((records) => {
        // Our own span insertions/removals do not need another pass.
        const foreign = records.some((r) => {
          const nodes = [...r.addedNodes, ...r.removedNodes];
          if (r.type === 'characterData') {
            const p = r.target.parentElement;
            return !(p && p.hasAttribute(NATIVE_ATTR));
          }
          if (r.type === 'childList' && r.target instanceof Element && r.target.hasAttribute(NATIVE_ATTR)) return false;
          return nodes.length === 0 || nodes.some((n) => !(n instanceof Element && n.hasAttribute(NATIVE_ATTR)));
        });
        if (foreign) schedule();
      });
      observer.observe(doc.body, { childList: true, subtree: true, characterData: true });
    } catch {
      observer = undefined;
    }
  }

  return {
    add(entries: OverlayEntry[]): void {
      try {
        if (destroyed || !Array.isArray(entries)) return;
        for (const e of entries) {
          if (!e || typeof e.meaning !== 'string' || typeof e.native !== 'string') continue;
          const native = norm(e.native).slice(0, MAX_TEXT);
          const meaning = norm(e.meaning);
          if (!native || !meaning || meaning.length > MAX_TEXT) continue;
          if (byMeaning.size >= MAX_ENTRIES && !byMeaning.has(meaning)) continue;
          byMeaning.set(meaning, native);
          if (typeof e.term === 'string' && e.term.trim()) {
            for (const v of termVariants(e.term)) if (v !== meaning) byTerm.set(v, { native, meaning });
          }
        }
        apply();
        observe();
      } catch {
        /* never break the page */
      }
    },
    setEnabled(next: boolean): void {
      enabled = next;
      apply();
    },
    destroy(): void {
      destroyed = true;
      if (timer !== undefined) clearTimeout(timer);
      observer?.disconnect();
      observer = undefined;
      try {
        removeAll();
      } catch {
        /* ignore */
      }
    },
  };
}
