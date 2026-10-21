import type { Coach } from '@langcoach/core/browser';
import type { ToastMessage } from '../shared/messages';

export const MENU_ID = 'langcoach-save-selection';
const LLL_PATTERNS = ['https://labs.google/lll/*'];
const LOCAL_PATTERNS = ['http://localhost/*', 'http://127.0.0.1/*'];

export interface MenusLike {
  removeAll(): Promise<void>;
  create(props: { id: string; title: string; contexts: ['selection']; documentUrlPatterns: string[] }): unknown;
}

/** Idempotent: safe on every install/startup. */
export async function registerMenus(menus: MenusLike, t: (key: string) => string, e2e: boolean): Promise<void> {
  await menus.removeAll();
  menus.create({
    id: MENU_ID,
    title: t('menuSave'),
    contexts: ['selection'],
    documentUrlPatterns: e2e ? [...LLL_PATTERNS, ...LOCAL_PATTERNS] : LLL_PATTERNS,
  });
}

export interface MenuClickDeps {
  coach: Pick<Coach, 'saveManualCard'>;
  tabs: { sendMessage(tabId: number, msg: ToastMessage): Promise<unknown> };
  log: (...args: unknown[]) => void;
}

/** "Save to LangCoach" on selected text: a card with the selection as its term, then a toast in the tab. */
export function createMenuClickHandler(deps: MenuClickDeps) {
  return async (
    info: { menuItemId: string | number; selectionText?: string },
    tab: { id?: number } | undefined,
  ): Promise<void> => {
    if (info.menuItemId !== MENU_ID) return;
    const term = (info.selectionText ?? '').trim().slice(0, 200);
    if (!term) return;
    try {
      const r = await deps.coach.saveManualCard({ term });
      if (tab?.id === undefined || tab.id < 0) return;
      await deps.tabs.sendMessage(tab.id, { type: 'toast', variant: r.duplicate ? 'already' : 'manual' });
    } catch (e) {
      deps.log('LangCoach: manual save failed', e);
    }
  };
}
