// prepack: builds the production browser extension and copies it into packages/mcp/extension/,
// which ships in the npm package so `bridge_prepare_extension` can hand it to the learner.
// Refuses dev/e2e builds and any pairing.json (same guard as the extension's zip script).
import { spawnSync } from 'node:child_process';
import { cpSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { checkProductionDist } from '../../../apps/extension/scripts/check-dist.mjs';

const extBuild = fileURLToPath(new URL('../../../apps/extension/scripts/build.mjs', import.meta.url));
const dist = fileURLToPath(new URL('../../../apps/extension/dist', import.meta.url));
const target = fileURLToPath(new URL('../extension', import.meta.url));

rmSync(target, { recursive: true, force: true });
const r = spawnSync(process.execPath, [extBuild], { stdio: 'inherit' });
if (r.status !== 0) process.exit(r.status ?? 1);
const problem = checkProductionDist(dist);
if (problem) {
  console.error(`Refusing to bundle the extension: ${problem}`);
  process.exit(1);
}
cpSync(dist, target, { recursive: true });
console.error(`Bundled the production extension into ${target}`);
