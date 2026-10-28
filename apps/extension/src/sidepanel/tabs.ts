/** Tab helpers for the side panel (chrome.tabs / chrome.windows are injectable for tests). */

const LLL_ORIGIN = 'https://labs.google';
const LLL_TABS = `${LLL_ORIGIN}/lll/*`;
/** `/lll/<siteLang>/experiments/<slug>` with an optional trailing slash. */
const EXPERIMENT_PATH = /^\/lll\/[^/]+\/experiments\/([^/]+)\/?$/;

type TabLike = { id?: number; windowId?: number; url?: string };

/** Result of a one-tap scenario (content script `startScenario`), plus panel-side failures. */
export type ScenarioOutcome =
  | { ok: true }
  | {
      ok: false;
      reason: 'not_tiny_lesson' | 'splash' | 'field' | 'language' | 'generate' | 'invalid' | 'error' | 'unreachable';
    };
const SCENARIO_REASONS = new Set(['not_tiny_lesson', 'splash', 'field', 'language', 'generate', 'invalid', 'error']);

export interface TabsApi {
  tabs: {
    query(q: { url?: string | string[]; active?: boolean; currentWindow?: boolean }): Promise<TabLike[]>;
    update(tabId: number, props: { active?: boolean }): Promise<unknown>;
    create(props: { url: string }): Promise<unknown>;
    sendMessage(tabId: number, message: unknown): Promise<unknown>;
  };
  windows: { update(windowId: number, props: { focused: boolean }): Promise<unknown> };
}

function chromeApi(): TabsApi | null {
  if (typeof chrome === 'undefined' || !chrome.tabs?.query) return null;
  return chrome as unknown as TabsApi;
}

/** The experiment slug of an LLL URL (`tiny-lesson`), or null for any other URL. */
export function experimentSlug(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.origin !== LLL_ORIGIN) return null;
    return EXPERIMENT_PATH.exec(u.pathname)?.[1] ?? null;
  } catch {
    return null;
  }
}

/**
 * Focuses a tab (in any window) that already shows this experiment, in any LLL site language;
 * otherwise opens a new tab. Never navigates an existing tab away from what it shows.
 * Never rejects: resolves to the tab it focused/opened (true) or false when Chrome refused.
 */
export async function openExperimentUrl(url: string, api: TabsApi | null = chromeApi()): Promise<boolean> {
  return (await focusOrOpen(url, api)) !== null;
}

/** Focuses or opens the experiment tab; its id (or -1 when unknown), or null when that failed. */
async function focusOrOpen(url: string, api: TabsApi | null): Promise<number | null> {
  if (!api) {
    try {
      if (typeof window !== 'undefined') window.open(url, '_blank', 'noopener');
      return -1;
    } catch {
      return null;
    }
  }
  const slug = experimentSlug(url);
  try {
    const tabs = slug ? await api.tabs.query({ url: LLL_TABS }) : [];
    const existing = tabs.find((t) => t.id !== undefined && experimentSlug(t.url) === slug);
    if (existing?.id !== undefined) {
      await api.tabs.update(existing.id, { active: true });
      if (existing.windowId !== undefined) await api.windows.update(existing.windowId, { focused: true }).catch(() => undefined);
      return existing.id;
    }
  } catch {
    /* fall through to a new tab */
  }
  try {
    const created = (await api.tabs.create({ url })) as TabLike | undefined;
    return created?.id ?? -1;
  } catch {
    return null;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * One-tap scenario: focus (or open) the Tiny Lesson tab, wait until its content script answers, then
 * ask it to pick the language, fill the purpose and press Generate. Never throws; on any failure the
 * panel offers the copy fallback.
 */
export async function runScenario(
  req: { theme: string; targetLabel?: string; url: string },
  api: TabsApi | null = chromeApi(),
  timing: { readyTimeoutMs?: number; pollMs?: number } = {},
): Promise<ScenarioOutcome> {
  const readyTimeoutMs = timing.readyTimeoutMs ?? 15_000;
  const pollMs = timing.pollMs ?? 300;
  if (!api) return { ok: false, reason: 'unreachable' };
  try {
    const tabId = await focusOrOpen(req.url, api);
    if (tabId === null || tabId < 0) return { ok: false, reason: 'unreachable' };
    const end = Date.now() + readyTimeoutMs;
    for (;;) {
      const pong = (await api.tabs.sendMessage(tabId, { type: 'ping' }).catch(() => null)) as { ready?: unknown } | null;
      if (pong?.ready === true) break;
      if (Date.now() >= end) return { ok: false, reason: 'unreachable' };
      await sleep(pollMs);
    }
    const msg = { type: 'startScenario', theme: req.theme, ...(req.targetLabel ? { targetLabel: req.targetLabel } : {}) };
    const res = (await api.tabs.sendMessage(tabId, msg)) as { ok?: unknown; reason?: unknown } | undefined;
    if (res && res.ok === true) return { ok: true };
    if (res && res.ok === false && typeof res.reason === 'string' && SCENARIO_REASONS.has(res.reason)) {
      return { ok: false, reason: res.reason as Exclude<ScenarioOutcome, { ok: true }>['reason'] };
    }
    return { ok: false, reason: 'error' };
  } catch {
    return { ok: false, reason: 'unreachable' };
  }
}

/** Asks the active tab's content script to fill the Tiny Lesson purpose field; true only if it did. */
export async function requestFill(theme: string, api: TabsApi | null = chromeApi()): Promise<boolean> {
  if (!api) return false;
  try {
    const [tab] = await api.tabs.query({ active: true, currentWindow: true });
    if (tab?.id === undefined || experimentSlug(tab.url) === null) return false;
    const res = (await api.tabs.sendMessage(tab.id, { type: 'fillTheme', theme })) as { filled?: unknown } | undefined;
    return res?.filled === true;
  } catch {
    return false; // no content script (tab not reloaded since install) or the tab went away
  }
}
