import { parseState } from './schema.js';
import { emptyState, type State } from './types.js';

/** What a transaction body returns: a new `state` to save (omit to save nothing) and a `result`. */
export type TransactionOutcome<T> = { state?: State; result: T };
export type TransactionFn<T> = (state: State) => Promise<TransactionOutcome<T>> | TransactionOutcome<T>;

export interface Store {
  load(): Promise<State>;
  save(s: State): Promise<void>;
  backup(): Promise<string | null>;
  /** load → fn → save (only if fn returns `state`), all under one lock. */
  transaction<T>(fn: TransactionFn<T>): Promise<T>;
  /**
   * Under the same lock: back up the current file as raw bytes (even if it is corrupt or
   * invalid), then save `next`. Never loads, so it can restore over a broken data file.
   */
  replace(next: State): Promise<string | null>;
}

/** Promise-chain mutex: runs tasks one at a time, in call order. */
export class Mutex {
  private tail: Promise<unknown> = Promise.resolve();
  run<T>(task: () => Promise<T>): Promise<T> {
    const next = this.tail.then(task, task);
    this.tail = next.catch(() => undefined);
    return next;
  }
}

export class MemoryStore implements Store {
  private state: State = emptyState();
  private readonly mutex = new Mutex();

  async load(): Promise<State> {
    return structuredClone(this.state);
  }
  async save(s: State): Promise<void> {
    parseState(s); // never keep a state that load() would reject
    this.state = structuredClone(s);
  }
  async backup(): Promise<string | null> {
    return null;
  }
  transaction<T>(fn: TransactionFn<T>): Promise<T> {
    return this.mutex.run(async () => {
      const out = await fn(await this.load());
      if (out.state !== undefined) await this.save(out.state);
      return out.result;
    });
  }
  replace(next: State): Promise<string | null> {
    return this.mutex.run(async () => {
      await this.save(next);
      return null;
    });
  }
}
