import { spawn } from 'node:child_process';

/** Opens a local file in the default app. Never throws, never writes to stdout (the MCP channel). */
export function openInBrowser(file: string, spawnFn: typeof spawn = spawn): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const win = process.platform === 'win32';
      const [cmd, args]: [string, string[]] = win
        ? ['cmd', ['/d', '/s', '/c', `start "" "${file}"`]]
        : [process.platform === 'darwin' ? 'open' : 'xdg-open', [file]];
      const child = spawnFn(cmd, args, { stdio: 'ignore', detached: true, windowsHide: true, windowsVerbatimArguments: win });
      child.on('error', () => resolve(false));
      child.on('spawn', () => resolve(true));
      child.unref();
    } catch {
      resolve(false);
    }
  });
}
