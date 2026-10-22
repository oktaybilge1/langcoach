/** Tab helpers for the side panel (chrome.tabs / chrome.windows are injectable for tests). */

const LLL_ORIGIN = 'https://labs.google';
const LLL_TABS = `${LLL_ORIGIN}/lll/*`;
/** `/lll/<siteLang>/experiments/<slug>` with an optional trailing slash. */
const EXPERIMENT_PATH = /^\/lll\/[^/]+\/experiments\/([^/]+)\/?$/;

type TabLike = { id?: number; windowId?: number; url?: string };

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
 */
export async function openExperimentUrl(url: string, api: TabsApi | null = chromeApi()): Promise<void> {
  if (!api) {
    if (typeof window !== 'undefined') window.open(url, '_blank', 'noopener');
    return;
  }
  const slug = experimentSlug(url);
  try {
    const tabs = slug ? await api.tabs.query({ url: LLL_TABS }) : [];
    const existing = tabs.find((t) => t.id !== undefined && experimentSlug(t.url) === slug);
    if (existing?.id !== undefined) {
      await api.tabs.update(existing.id, { active: true });
      if (existing.windowId !== undefined) await api.windows.update(existing.windowId, { focused: true });
      return;
    }
  } catch {
    /* fall through to a new tab */
  }
  await api.tabs.create({ url });
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
