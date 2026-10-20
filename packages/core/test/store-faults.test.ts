import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { existsSync, mkdtempSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Fault injection for the lock file: the real fs/promises, with switchable failures.
const faults = vi.hoisted(() => ({
  lockOpen: null as string | null, // errno code thrown by open(<lock>, 'wx')
  lockWrite: null as string | null, // errno code thrown when writing the new lock
  lockUnlink: null as string | null, // errno code thrown by unlink(<lock>)
  lockOpenCalls: 0,
}));

vi.mock('node:fs/promises', async (importOriginal) => {
  const real = await importOriginal<typeof import('node:fs/promises')>();
  const err = (code: string, path: string) =>
    Object.assign(new Error(`${code}: injected, '${path}'`), { code, path });
  const isLock = (p: unknown) => String(p).endsWith('.lock');
  const open = (async (path: Parameters<typeof real.open>[0], flags?: string | number, mode?: number) => {
    if (isLock(path) && flags === 'wx') {
      faults.lockOpenCalls++;
      if (faults.lockOpen) throw err(faults.lockOpen, String(path));
      const fh = await real.open(path, flags, mode);
      if (faults.lockWrite) {
        const code = faults.lockWrite;
        return new Proxy(fh, {
          get(target, prop, receiver) {
            if (prop === 'writeFile') return async () => {
              throw err(code, String(path));
            };
            const v = Reflect.get(target, prop, receiver);
            return typeof v === 'function' ? v.bind(target) : v;
          },
        });
      }
      return fh;
    }
    return real.open(path, flags, mode);
  }) as typeof real.open;
  const unlink = (async (path: Parameters<typeof real.unlink>[0]) => {
    if (isLock(path) && faults.lockUnlink) throw err(faults.lockUnlink, String(path));
    return real.unlink(path);
  }) as typeof real.unlink;
  return { ...real, default: { ...real, open, unlink }, open, unlink };
});

const { JsonFileStore } = await import('../src/store.js');

let dir: string;
let file: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'langcoach-faults-'));
  file = join(dir, 'data.json');
  faults.lockOpen = null;
  faults.lockWrite = null;
  faults.lockUnlink = null;
  faults.lockOpenCalls = 0;
});
afterEach(() => {
  faults.lockUnlink = null;
  rmSync(dir, { recursive: true, force: true });
});

const tx = (store: InstanceType<typeof JsonFileStore>) => store.transaction((s) => ({ state: s, result: null }));

describe('lock file faults', () => {
  test.each(['EACCES', 'EPERM'])(
    'N2: %s creating the lock with no lock present → backs off, then "not writable" naming the folder',
    async (code) => {
      faults.lockOpen = code;
      const store = new JsonFileStore(file, { lockTimeoutMs: 400 });
      const started = Date.now();
      const e = (await tx(store).catch((x: Error) => x)) as Error;
      expect(e).toBeInstanceOf(Error);
      expect(e.message).toMatch(/not writable/);
      expect(e.message).toContain(dir);
      expect(Date.now() - started).toBeGreaterThanOrEqual(350);
      // Backoff 20 → 200 ms over 400 ms is a handful of attempts, not a busy loop.
      expect(faults.lockOpenCalls).toBeLessThan(15);
    },
  );

  test('N2: a transient EPERM on the lock is retried and the transaction succeeds', async () => {
    faults.lockOpen = 'EPERM';
    setTimeout(() => {
      faults.lockOpen = null;
    }, 100);
    const store = new JsonFileStore(file, { lockTimeoutMs: 2000 });
    await tx(store);
    expect(readdirSync(dir)).toEqual(['data.json']);
  });

  test('N3: writing the new lock fails (ENOSPC) → error surfaces and no empty lock is left', async () => {
    faults.lockWrite = 'ENOSPC';
    const store = new JsonFileStore(file);
    await expect(tx(store)).rejects.toMatchObject({ code: 'ENOSPC' });
    expect(existsSync(`${file}.lock`)).toBe(false);
    faults.lockWrite = null;
    await tx(store);
    expect(readdirSync(dir)).toEqual(['data.json']);
  });

  test('N4: a stale lock that cannot be removed → backs off, then a clear error naming the lock', async () => {
    const lock = `${file}.lock`;
    const old = Date.now() - 60_000;
    writeFileSync(lock, JSON.stringify({ pid: 999999, at: old }));
    utimesSync(lock, old / 1000, old / 1000);
    faults.lockUnlink = 'EPERM';
    const store = new JsonFileStore(file, { lockTimeoutMs: 400 });
    const started = Date.now();
    const e = (await tx(store).catch((x: Error) => x)) as Error;
    expect(e).toBeInstanceOf(Error);
    expect(e.message).toContain(lock);
    expect(e.message).toMatch(/could not remove/i);
    expect(Date.now() - started).toBeGreaterThanOrEqual(350);
    expect(faults.lockOpenCalls).toBeLessThan(15);
  });
});
