// Shared guard for every place that ships the extension (zip.mjs, the langcoach npm package):
// returns null for a clean production build, or the reason it must not be shipped.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

export function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out.sort();
}

// The agent bridge (local langcoach MCP server) is the one loopback host a production build may use.
const BRIDGE_HOST = 'http://127.0.0.1:47821/*';
const BRIDGE_ORIGIN = 'http://127.0.0.1:47821';
const REBUILD = 'Run the production build first: npm run build -w @langcoach/extension';

export function checkProductionDist(distDir) {
  const files = walk(distDir);
  const rel = (f) => relative(distDir, f).replace(/\\/g, '/');
  if (!files.some((f) => rel(f) === 'manifest.json')) {
    return 'dist/manifest.json not found. Run npm run build -w @langcoach/extension first.';
  }

  // The pairing file holds this computer's bridge secret; the agent writes it into its own copy only.
  if (files.some((f) => rel(f) === 'pairing.json')) {
    return 'dist/pairing.json is a local pairing secret. Run npm run build -w @langcoach/extension';
  }

  // Never ship a dev/e2e build (e.g. dist left behind by npm run test:e2e): it grants localhost access.
  const manifest = JSON.parse(readFileSync(join(distDir, 'manifest.json'), 'utf8'));
  const urls = [
    ...(manifest.host_permissions ?? []).filter((u) => u !== BRIDGE_HOST),
    ...(manifest.content_scripts ?? []).flatMap((c) => c.matches ?? []),
    ...(manifest.web_accessible_resources ?? []).flatMap((w) => w.matches ?? []),
  ];
  const local = urls.filter((u) => /localhost|127\.0\.0\.1|\[::1\]/i.test(String(u)));
  if (local.length) {
    return `dist/manifest.json is a dev/e2e build (it matches ${local.join(', ')}).\n${REBUILD}`;
  }

  // The bundles themselves must be production builds too: no e2e-only hooks, no dev hosts left in the code.
  const FORBIDDEN = /data-e2e-answer|data-langcoach-e2e|localhost|127\.0\.0\.1/i;
  const tainted = [];
  for (const full of files) {
    if (!/\.(js|mjs|html|css|json)$/i.test(rel(full))) continue;
    const hit = FORBIDDEN.exec(readFileSync(full, 'utf8').split(BRIDGE_ORIGIN).join(''));
    if (hit) tainted.push(`${rel(full)} (${hit[0]})`);
  }
  if (tainted.length) return `dist contains e2e/dev-only code: ${tainted.join(', ')}.\n${REBUILD}`;
  return null;
}
