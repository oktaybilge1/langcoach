import { copyFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { CorruptDataError } from './errors.js';
import { parseState } from './schema.js';
import { emptyState, type State } from './types.js';

export { CorruptDataError } from './errors.js';

export interface Store {
  load(): Promise<State>;
  save(s: State): Promise<void>;
  backup(): Promise<string | null>;
}

const stamp = () => new Date().toISOString().replace(/[:.]/g, '-');
const isNotFound = (e: unknown) => (e as NodeJS.ErrnoException)?.code === 'ENOENT';

export class JsonFileStore implements Store {
  constructor(private readonly filePath: string) {}

  async load(): Promise<State> {
    let text: string;
    try {
      text = await readFile(this.filePath, 'utf8');
    } catch (e) {
      if (isNotFound(e)) return emptyState();
      throw e;
    }
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      const preservedAt = join(dirname(this.filePath), `data.corrupt-${stamp()}.json`);
      await copyFile(this.filePath, preservedAt);
      throw new CorruptDataError(
        `Data file is not valid JSON. Original preserved at ${preservedAt}`,
        preservedAt,
      );
    }
    return parseState(raw);
  }

  async save(s: State): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.tmp`;
    await writeFile(tmp, JSON.stringify(s, null, 2), 'utf8');
    await rename(tmp, this.filePath);
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
}

export class MemoryStore implements Store {
  private state: State = emptyState();

  async load(): Promise<State> {
    return structuredClone(this.state);
  }
  async save(s: State): Promise<void> {
    this.state = structuredClone(s);
  }
  async backup(): Promise<string | null> {
    return null;
  }
}

export function defaultDataPath(env: Record<string, string | undefined> = process.env): string {
  const home = env.LANGCOACH_HOME;
  return home ? join(home, 'data.json') : join(homedir(), '.langcoach', 'data.json');
}
