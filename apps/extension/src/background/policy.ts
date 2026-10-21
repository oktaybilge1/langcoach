export interface SenderLike {
  id?: string;
  url?: string;
  tab?: unknown;
}

/** Messages only content scripts on the lesson site may send. */
const CONTENT_TYPES: ReadonlySet<string> = new Set(['capture', 'undo', 'saveManual', 'openPanel']);
/** Messages only extension pages (side panel) may send. */
const PAGE_TYPES: ReadonlySet<string> = new Set([
  'getSnapshot',
  'setProfile',
  'getDue',
  'review',
  'updateCard',
  'exportData',
  'importData',
  'reset',
  'getSettings',
  'setSettings',
]);

const LLL_PREFIX = 'https://labs.google/lll/';

function isLocalDev(url: string): boolean {
  try {
    const u = new URL(url);
    return (u.protocol === 'http:' || u.protocol === 'https:') && (u.hostname === 'localhost' || u.hostname === '127.0.0.1');
  } catch {
    return false;
  }
}

/** Pure sender policy for runtime messages. */
export function isAllowed(
  type: string,
  sender: SenderLike,
  runtimeId: string,
  extensionOrigin: string,
  e2e: boolean,
): boolean {
  if (!sender || sender.id !== runtimeId) return false;
  const url = typeof sender.url === 'string' ? sender.url : '';
  if (CONTENT_TYPES.has(type)) {
    if (!sender.tab) return false;
    return url.startsWith(LLL_PREFIX) || (e2e && isLocalDev(url));
  }
  if (PAGE_TYPES.has(type)) return url !== '' && url.startsWith(extensionOrigin);
  return false;
}
