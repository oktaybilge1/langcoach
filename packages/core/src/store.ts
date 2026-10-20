import { randomBytes } from 'node:crypto';
import { copyFile, mkdir, open, readFile, readdir, rename, stat, unlink } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { CorruptDataError } from './errors.js';
import { parseState } from './schema.js';
import { emptyState, type State } from './types.js';

export { CorruptDataError } from './errors.js';

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

export interface JsonFileStoreOptions {
  /** Give up waiting for the cross-process lock after this long (default 5000 ms). */
  lockTimeoutMs?: number;
  /** A lock file older than this is considered abandoned and removed (default 10000 ms). */
  staleLockMs?: number;
}

const stamp = () =>
  `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomBytes(3).toString('hex')}`;
const code = (e: unknown) => (e as NodeJS.ErrnoException)?.code;
const isNotFound = (e: unknown) => code(e) === 'ENOENT';
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Promise-chain mutex: runs tasks one at a time, in call order. */
class Mutex {
  private tail: Promise<unknown> = Promise.resolve();
  run<T>(task: () => Promise<T>): Promise<T> {
    const next = this.tail.then(task, task);
    this.tail = next.catch(() => undefined);
    return next;
  }
}

// One in-process mutex per data file, shared by every JsonFileStore on that path.
const fileMutexes = new Map<string, Mutex>();
function mutexFor(path: string): Mutex {
  const key = process.platform === 'win32' || process.platform === 'darwin' ? path.toLowerCase() : path;
  let m = fileMutexes.get(key);
  if (!m) {
    m = new Mutex();
    fileMutexes.set(key, m);
  }
  return m;
}

export class JsonFileStore implements Store {
  private readonly filePath: string;
  private readonly lockPath: string;
  private readonly lockTimeoutMs: number;
  private readonly staleLockMs: number;

  constructor(filePath: string, opts: JsonFileStoreOptions = {}) {
    this.filePath = resolve(filePath);
    this.lockPath = `${this.filePath}.lock`;
    this.lockTimeoutMs = opts.lockTimeoutMs ?? 5000;
    this.staleLockMs = opts.staleLockMs ?? 10_000;
  }

  async load(): Promise<State> {
    let bytes: Buffer;
    try {
      bytes = await readFile(this.filePath);
    } catch (e) {
      if (isNotFound(e)) return emptyState();
      throw e;
    }
    let raw: unknown;
    try {
      raw = JSON.parse(bytes.toString('utf8'));
    } catch {
      const preservedAt = await this.preserveCorrupt(bytes);
      throw new CorruptDataError(
        `Data file is not valid JSON. Original preserved at ${preservedAt}. ` +
          'Restore with import_data from a data.backup-*.json, or move data.json aside to start fresh.',
        preservedAt,
      );
    }
    return parseState(raw);
  }

  async save(s: State): Promise<void> {
    const dir = dirname(this.filePath);
    await mkdir(dir, { recursive: true });
    const tmp = join(dir, `${basename(this.filePath)}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`);
    try {
      const fh = await open(tmp, 'wx');
      try {
        await fh.writeFile(JSON.stringify(s, null, 2), 'utf8');
        await fh.sync();
      } finally {
        await fh.close();
      }
      await renameWithRetry(tmp, this.filePath);
    } catch (e) {
      await unlink(tmp).catch(() => undefined);
      throw e;
    }
  }

  async backup(): Promise<string | null> {
    const dest = join(dirname(this.filePath), `data.backup-${stamp()}.json`);
    try {
      await copyFile(this.filePath, dest);
    } catch (e) {
      if (isNotFound(e)) return null;
      throw e;
    }
    return dest;
  }

  transaction<T>(fn: TransactionFn<T>): Promise<T> {
    return mutexFor(this.filePath).run(async () => {
      const token = await this.acquireLock();
      try {
        const out = await fn(await this.load());
        if (out.state !== undefined) await this.save(out.state);
        return out.result;
      } finally {
        await this.releaseLock(token);
      }
    });
  }

  replace(next: State): Promise<string | null> {
    return mutexFor(this.filePath).run(async () => {
      const token = await this.acquireLock();
      try {
        const backupPath = await this.backup();
        await this.save(next);
        return backupPath;
      } finally {
        await this.releaseLock(token);
      }
    });
  }

  /** Copy corrupt bytes aside once: reuse an existing data.corrupt-*.json with identical bytes. */
  private async preserveCorrupt(bytes: Buffer): Promise<string> {
    const dir = dirname(this.filePath);
    const names = await readdir(dir).catch(() => [] as string[]);
    for (const name of names) {
      if (!/^data\.corrupt-.*\.json$/.test(name)) continue;
      const p = join(dir, name);
      const other = await readFile(p).catch(() => null);
      if (other && other.equals(bytes)) return p;
    }
    const preservedAt = join(dir, `data.corrupt-${stamp()}.json`);
    await copyFile(this.filePath, preservedAt);
    return preservedAt;
  }

  private async acquireLock(): Promise<string> {
    const dir = dirname(this.filePath);
    await mkdir(dir, { recursive: true });
    const token = randomBytes(8).toString('hex');
    const deadline = Date.now() + this.lockTimeoutMs;
    let delay = 20;
    for (;;) {
      let openCode: string | undefined;
      try {
        const fh = await open(this.lockPath, 'wx');
        try {
          await fh.writeFile(JSON.stringify({ pid: process.pid, at: Date.now(), token }), 'utf8');
        } catch (e) {
          // Never leave an empty or partial lock behind (e.g. ENOSPC).
          await fh.close().catch(() => undefined);
          await unlink(this.lockPath).catch(() => undefined);
          throw e;
        }
        await fh.close();
        return token;
      } catch (e) {
        openCode = code(e);
        if (openCode !== 'EEXIST' && openCode !== 'EPERM' && openCode !== 'EACCES') throw e;
      }
      const lock = await this.inspectLock();
      // The lock was released or we removed a stale one: real progress, retry at once.
      if (lock === 'removed' || (lock === 'missing' && openCode === 'EEXIST')) continue;
      if (Date.now() >= deadline) {
        if (lock === 'missing') {
          // EPERM/EACCES with no lock file present: not contention, the folder rejects new files.
          throw new Error(
            `LangCoach cannot create files in its data folder (${dir}): the folder is not writable. ` +
              'Check its permissions or set LANGCOACH_HOME to a writable folder.',
          );
        }
        if (lock === 'stuck') {
          throw new Error(
            `LangCoach could not remove an old lock file: ${this.lockPath}. ` +
              'Make sure no other LangCoach is running, delete that file and try again.',
          );
        }
        throw new Error('LangCoach data file is busy, try again.');
      }
      await sleep(Math.min(delay, Math.max(1, deadline - Date.now())));
      delay = Math.min(delay * 2, 200);
    }
  }

  /**
   * Look at the existing lock file: 'missing' (no lock file), 'held' (fresh, or unreadable),
   * 'removed' (it was stale and we deleted it) or 'stuck' (stale but could not be deleted).
   */
  private async inspectLock(): Promise<'missing' | 'held' | 'removed' | 'stuck'> {
    let mtime: number;
    try {
      mtime = (await stat(this.lockPath)).mtimeMs;
    } catch (e) {
      return isNotFound(e) ? 'missing' : 'held';
    }
    let at = mtime;
    try {
      const parsed = JSON.parse(await readFile(this.lockPath, 'utf8')) as { at?: unknown };
      if (typeof parsed.at === 'number') at = Math.max(parsed.at, mtime);
    } catch {
      // Unreadable or half-written lock: fall back to its mtime.
    }
    if (Date.now() - at <= this.staleLockMs) return 'held';
    try {
      await unlink(this.lockPath);
      return 'removed';
    } catch (e) {
      return isNotFound(e) ? 'removed' : 'stuck';
    }
  }

  private async releaseLock(token: string): Promise<void> {
    try {
      const parsed = JSON.parse(await readFile(this.lockPath, 'utf8')) as { token?: unknown };
      if (parsed.token !== token) return; // our lock was cleared as stale and someone else holds it now
    } catch (e) {
      if (isNotFound(e)) return;
      // Unreadable lock content: it can only be ours, since we wrote it fully before returning.
    }
    await unlink(this.lockPath).catch(() => undefined);
  }
}

async function renameWithRetry(from: string, to: string): Promise<void> {
  const deadline = Date.now() + 1000;
  let delay = 10;
  for (;;) {
    try {
      await rename(from, to);
      return;
    } catch (e) {
      const c = code(e);
      if ((c !== 'EPERM' && c !== 'EACCES' && c !== 'EBUSY') || Date.now() >= deadline) throw e;
      await sleep(delay);
      delay = Math.min(delay * 2, 100);
    }
  }
}

export class MemoryStore implements Store {
  private state: State = emptyState();
  private readonly mutex = new Mutex();

  async load(): Promise<State> {
    return structuredClone(this.state);
  }
  async save(s: State): Promise<void> {
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

export function defaultDataPath(env: Record<string, string | undefined> = process.env): string {
  const home = env.LANGCOACH_HOME;
  return home ? join(home, 'data.json') : join(homedir(), '.langcoach', 'data.json');
}
