// Builds the extension into dist/. Extra args (e.g. `--mode e2e`) are passed to every vite build.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const extra = process.argv.slice(2);
const viteBin = fileURLToPath(new URL('../../../node_modules/vite/bin/vite.js', import.meta.url));
const isE2e = extra.includes('e2e');

for (const target of ['app', 'content-main', 'content-isolated']) {
  const r = spawnSync(process.execPath, [viteBin, 'build', ...extra], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, LC_TARGET: target },
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

if (isE2e) {
  const manifestPath = fileURLToPath(new URL('../dist/manifest.json', import.meta.url));
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const localHosts = ['http://localhost/*', 'http://127.0.0.1/*'];
  manifest.host_permissions = [...new Set([...manifest.host_permissions, ...localHosts])];
  for (const cs of manifest.content_scripts ?? []) {
    cs.matches = [...new Set([...cs.matches, ...localHosts])];
  }
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
}
