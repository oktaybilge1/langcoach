// Builds the extension into dist/. Extra args (e.g. `--mode e2e`) are passed to every vite build.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const extra = process.argv.slice(2);
const viteBin = fileURLToPath(new URL('../../../node_modules/vite/bin/vite.js', import.meta.url));
const isE2e = extra.includes('e2e');
// The e2e build gets its own folder, so a production build running meanwhile cannot swap it mid-test.
const outDir = isE2e ? 'dist-e2e' : 'dist';

for (const target of ['app', 'content-main', 'content-isolated']) {
  const r = spawnSync(process.execPath, [viteBin, 'build', ...extra], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, LC_TARGET: target, LC_OUT_DIR: outDir },
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

if (isE2e) {
  const manifestPath = fileURLToPath(new URL(`../${outDir}/manifest.json`, import.meta.url));
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const localHosts = ['http://localhost/*', 'http://127.0.0.1/*'];
  manifest.host_permissions = [...new Set([...manifest.host_permissions, ...localHosts])];
  for (const cs of manifest.content_scripts ?? []) {
    cs.matches = [...new Set([...cs.matches, ...localHosts])];
  }
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  // Fake pairing secret shared with e2e/bridge-stub (the e2e bridge port is 47822, never a real agent).
  const pairingPath = fileURLToPath(new URL(`../${outDir}/pairing.json`, import.meta.url));
  writeFileSync(pairingPath, JSON.stringify({ token: 'e2e0'.repeat(16), port: 47822, v: 1 }) + '\n', 'utf8');
}
