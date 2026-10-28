/**
 * One-tap scenarios on the LLL Tiny Lesson page: pick the target language in its react-select picker,
 * write the purpose (React-safe) and press Generate. Every step either succeeds or stops with a reason;
 * nothing is guessed and nothing is thrown into the page.
 */

/** LLL caps the Tiny Lesson purpose at 50 characters (51 crashed the page). */
export const PURPOSE_MAX = 50;
const TINY_LESSON_PATH = /^\/lll\/[a-z]{2}(?:[-_][a-z]{2,4})?\/experiments\/tiny-lesson\/?$/i;
const SITE_HOME_PATH = /^\/lll\/[a-z]{2}(?:[-_][a-z]{2,4})?\/?$/i;
/** "Generate" in the LLL site languages (en, es, fr, pt). */
const GENERATE_TEXT = /generat|generar|g[ée]n[ée]rer|gerar/i;

export type ScenarioReason =
  | 'not_tiny_lesson'
  | 'splash'
  | 'field'
  | 'language'
  | 'generate'
  | 'invalid'
  | 'error';
export type ScenarioResult = { ok: true } | { ok: false; reason: ScenarioReason };

export interface ScenarioRequest {
  theme: string;
  /** LLL dropdown label (e.g. "Spanish (Spain)"); absent = keep the language the page shows. */
  targetLabel?: string;
}

export interface ScenarioTiming {
  /** Longest wait for any one step (menu, selection, Generate enabled). */
  timeoutMs?: number;
  stepMs?: number;
}

export const isTinyLessonPage = (win: Window): boolean => TINY_LESSON_PATH.test(win.location.pathname);

/** Rendered (has a layout box) and interactive. */
export function isUsable(el: Element): boolean {
  const h = el as HTMLInputElement;
  if (h.disabled || (h as HTMLElement).hidden || el.closest('[hidden], [aria-hidden="true"], [inert]')) return false;
  return el.getClientRects().length > 0;
}

/**
 * The Tiny Lesson purpose field: exactly one usable `input` whose type is text and that is not the
 * language combobox (live markup: no form, no maxLength, no type attribute, rotating placeholder).
 * Anything else is ambiguous, so null; never "the first input on the page".
 */
export function findPurposeField(win: Window): HTMLInputElement | null {
  const candidates = [...win.document.querySelectorAll('input')].filter(
    (el) => el.type === 'text' && el.getAttribute('role') !== 'combobox' && isUsable(el),
  );
  return candidates.length === 1 ? candidates[0]! : null;
}

/**
 * Writes `theme` into the Tiny Lesson purpose field so that React registers it: the value goes through the
 * element's own prototype setter (bypassing React's instance-level value tracker), then a bubbling `input`
 * event. Returns false (and changes nothing) outside the Tiny Lesson page or when the field is not found.
 */
export function fillPurposeField(win: Window, theme: string): boolean {
  if (!isTinyLessonPage(win)) return false;
  const el = findPurposeField(win);
  return el ? writeValue(win, el, theme) : false;
}

function writeValue(win: Window, el: HTMLInputElement, theme: string): boolean {
  const w = win as Window & typeof globalThis;
  const limit = el.maxLength > 0 ? Math.min(el.maxLength, PURPOSE_MAX) : PURPOSE_MAX;
  const value = [...theme].slice(0, limit).join('');
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')?.set;
  if (!setter) return false;
  el.focus();
  setter.call(el, value);
  el.dispatchEvent(new w.Event('input', { bubbles: true }));
  return true;
}

const norm = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim().toLowerCase();

function languageCombobox(win: Window): HTMLElement | null {
  return [...win.document.querySelectorAll<HTMLElement>('[role="combobox"]')].find(isUsable) ?? null;
}

/** First visit: the intro splash ("Start" → site home) or the "Before you begin" notice (checkbox). */
function isSplash(win: Window): boolean {
  if (languageCombobox(win)) return false;
  const doc = win.document;
  const toHome = [...doc.querySelectorAll<HTMLAnchorElement>('a[href]')].some((a) => {
    try {
      const u = new URL(a.href, win.location.href);
      return u.origin === win.location.origin && SITE_HOME_PATH.test(u.pathname) && isUsable(a);
    } catch {
      return false;
    }
  });
  const consent = [...doc.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')].some(isUsable);
  return toHome || consent;
}

function selectControl(combo: HTMLElement): HTMLElement | null {
  return combo.closest<HTMLElement>('[class*="__control"]') ?? combo.closest<HTMLElement>('[class*="control"]');
}

function selectRoot(combo: HTMLElement): HTMLElement | null {
  return combo.closest<HTMLElement>('[class*="-container"]') ?? selectControl(combo)?.parentElement ?? null;
}

function currentLanguage(combo: HTMLElement): string {
  const control = selectControl(combo);
  return norm(control?.querySelector('[class*="single-value"]')?.textContent);
}

async function waitFor<T>(
  win: Window,
  probe: () => T | null | undefined | false,
  timing: Required<ScenarioTiming>,
): Promise<T | null> {
  const end = Date.now() + timing.timeoutMs;
  for (;;) {
    const v = probe();
    if (v) return v;
    if (Date.now() >= end) return null;
    await new Promise((r) => win.setTimeout(r, timing.stepMs));
  }
}

function mouse(win: Window, el: Element, type: 'mousedown' | 'mouseup'): void {
  const w = win as Window & typeof globalThis;
  el.dispatchEvent(new w.MouseEvent(type, { bubbles: true, cancelable: true, button: 0 }));
}

/** Chooses `label` in the react-select picker; true when the control then shows it. */
async function chooseLanguage(
  win: Window,
  combo: HTMLElement,
  label: string,
  timing: Required<ScenarioTiming>,
): Promise<boolean> {
  const want = norm(label);
  if (currentLanguage(combo) === want) return true;
  const control = selectControl(combo);
  if (!control) return false;
  mouse(win, control, 'mousedown'); // react-select opens its menu on mousedown on the control
  const options = await waitFor(
    win,
    () => {
      const list = [...win.document.querySelectorAll<HTMLElement>('[role="listbox"] [role="option"]')];
      return list.length > 0 ? list : null;
    },
    timing,
  );
  const option = options?.find((o) => norm(o.textContent) === want);
  if (!option) {
    if (options) mouse(win, control, 'mousedown'); // close the menu we opened
    return false;
  }
  mouse(win, option, 'mousedown');
  mouse(win, option, 'mouseup');
  option.click();
  return (await waitFor(win, () => currentLanguage(combo) === want, timing)) === true;
}

/** The Generate button: after the purpose field, outside the picker, labelled Generate (or the only one). */
function findGenerate(win: Window, purpose: HTMLInputElement, combo: HTMLElement | null): HTMLButtonElement | null {
  const picker = combo ? selectRoot(combo) : null;
  const after = [...win.document.querySelectorAll<HTMLButtonElement>('button')].filter(
    (b) =>
      purpose.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING &&
      !(picker && picker.contains(b)) &&
      b.getClientRects().length > 0,
  );
  const named = after.find((b) => GENERATE_TEXT.test(b.textContent ?? '') || GENERATE_TEXT.test(b.getAttribute('aria-label') ?? ''));
  if (named) return named;
  // Unlabelled: accept only an unambiguous single button sharing the purpose field's container.
  for (let box = purpose.parentElement; box && box !== win.document.body; box = box.parentElement) {
    const inBox = after.filter((b) => box.contains(b));
    if (inBox.length === 1) return inBox[0]!;
    if (inBox.length > 1) return null;
  }
  return null;
}

const enabled = (b: HTMLButtonElement) => !b.disabled && b.getAttribute('aria-disabled') !== 'true';

/**
 * Starts a Tiny Lesson for `theme`: (a) splash → reason 'splash'; (b) select the target language when it
 * differs; (c) fill the purpose (≤50 chars, React-safe); (d) wait ≤timeout for Generate, click it.
 */
export async function startScenario(
  win: Window,
  req: ScenarioRequest,
  timingIn: ScenarioTiming = {},
): Promise<ScenarioResult> {
  const timing = { timeoutMs: timingIn.timeoutMs ?? 3000, stepMs: timingIn.stepMs ?? 50 };
  try {
    if (!isTinyLessonPage(win)) return { ok: false, reason: 'not_tiny_lesson' };
    // A freshly opened tab may still be rendering: wait for the form or the splash to appear.
    await waitFor(win, () => isSplash(win) || !!findPurposeField(win), timing);
    if (isSplash(win)) return { ok: false, reason: 'splash' };
    if (!findPurposeField(win)) return { ok: false, reason: 'field' };
    const combo = languageCombobox(win);
    if (req.targetLabel) {
      if (!combo || !(await chooseLanguage(win, combo, req.targetLabel, timing))) return { ok: false, reason: 'language' };
    }
    const purpose = findPurposeField(win); // React may have re-rendered it
    if (!purpose || !writeValue(win, purpose, req.theme)) return { ok: false, reason: 'field' };
    const button = await waitFor(
      win,
      () => {
        const b = findGenerate(win, purpose, combo);
        return b && enabled(b) ? b : null;
      },
      timing,
    );
    if (!button) return { ok: false, reason: 'generate' };
    button.click();
    return { ok: true };
  } catch {
    return { ok: false, reason: 'error' };
  }
}
