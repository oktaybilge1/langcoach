// Builds the extension into dist/. Extra args (e.g. `--mode e2e`) are passed to every vite build.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const extra = process.argv.slice(2);
const viteBin = fileURLToPath(new URL('../../../node_modules/vite/bin/vite.js', import.meta.url));

for (const target of ['app', 'content-main', 'content-isolated']) {
  const r = spawnSync(process.execPath, [viteBin, 'build', ...extra], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, LC_TARGET: target },
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
}
