import type { StorageAreaLike } from '../src/background/store';

/** In-memory stand-in for chrome.storage.local (async, structured-clone semantics). */
export function fakeArea(): StorageAreaLike & { data: Map<string, unknown> } {
  const data = new Map<string, unknown>();
  const tick = () => new Promise<void>((r) => setTimeout(r, 0));
  return {
    data,
    async get(keys?: string | string[] | null) {
      await tick();
      const out: Record<string, unknown> = {};
      const list = keys == null ? [...data.keys()] : Array.isArray(keys) ? keys : [keys];
      for (const k of list) if (data.has(k)) out[k] = structuredClone(data.get(k));
      return out;
    },
    async set(items: Record<string, unknown>) {
      await tick();
      for (const [k, v] of Object.entries(items)) data.set(k, structuredClone(v));
    },
    async remove(keys: string | string[]) {
      await tick();
      for (const k of Array.isArray(keys) ? keys : [keys]) data.delete(k);
    },
  };
}
