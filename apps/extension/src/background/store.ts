import {
  CorruptDataError,
  emptyState,
  parseState,
  type State,
  type Store,
  type TransactionFn,
} from '@langcoach/core/browser';

export const STATE_KEY = 'langcoach:state';
export const BACKUP_PREFIX = 'langcoach:backup:';
export const CORRUPT_PREFIX = 'langcoach:corrupt:';
export const MAX_BACKUPS = 3;

/** The subset of chrome.storage.StorageArea that the store needs (so tests can inject a fake). */
export interface StorageAreaLike {
  get(keys?: string | string[] | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
}

/** Promise-chain mutex: runs tasks one at a time, in call order. */
class Mutex {
  private tail: Promise<unknown> = Promise.resolve();
  run<T>(task: () => Promise<T>): Promise<T> {
    const next = this.tail.then(task, task);
    this.tail = next.catch(() => undefined);
    return next;
  }
}

let seq = 0;
/** Sortable, unique-per-process suffix: ISO time then a monotonic counter. */
const stamp = () => `${new Date().toISOString()}-${String(++seq % 1_000_000).padStart(6, '0')}`;

/** State kept as a JSON string in chrome.storage.local; the background service worker is its only writer. */
export class ChromeStorageStore implements Store {
  private readonly mutex = new Mutex();

  constructor(private readonly area: StorageAreaLike = chrome.storage.local) {}

  async load(): Promise<State> {
    const raw = (await this.area.get(STATE_KEY))[STATE_KEY];
    if (raw === undefined) return emptyState();
    let parsed: unknown;
    try {
      if (typeof raw !== 'string') throw new Error('stored state is not a string');
      parsed = JSON.parse(raw);
    } catch {
      const all = await this.area.get(null);
      // Preserve once: reuse an existing copy with identical bytes.
      const existing = Object.keys(all).find((k) => k.startsWith(CORRUPT_PREFIX) && all[k] === raw);
      const preservedAt = existing ?? `${CORRUPT_PREFIX}${stamp()}`;
      if (!existing) await this.area.set({ [preservedAt]: raw });
      throw new CorruptDataError(
        `Stored data is not valid JSON. The original was preserved under ${preservedAt}. ` +
          'Import a backup or reset to start fresh.',
        preservedAt,
      );
    }
    return parseState(parsed);
  }

  async save(s: State): Promise<void> {
    parseState(s); // never write a state that load() would reject
    await this.area.set({ [STATE_KEY]: JSON.stringify(s) });
  }

  async backup(): Promise<string | null> {
    const raw = (await this.area.get(STATE_KEY))[STATE_KEY];
    if (raw === undefined) return null;
    const key = `${BACKUP_PREFIX}${stamp()}`;
    await this.area.set({ [key]: raw });
    const all = Object.keys(await this.area.get(null))
      .filter((k) => k.startsWith(BACKUP_PREFIX))
      .sort();
    if (all.length > MAX_BACKUPS) await this.area.remove(all.slice(0, all.length - MAX_BACKUPS));
    return key;
  }

  transaction<T>(fn: TransactionFn<T>): Promise<T> {
    return this.mutex.run(async () => {
      const out = await fn(await this.load());
      if (out.state !== undefined) await this.save(out.state);
      return out.result;
    });
  }

  async replace(next: State): Promise<string | null> {
    parseState(next); // invalid input leaves no trace
    return this.mutex.run(async () => {
      const key = await this.backup();
      await this.save(next);
      return key;
    });
  }
}
