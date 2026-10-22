import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const ZIP = fileURLToPath(new URL('../scripts/zip.mjs', import.meta.url));
const dirs: string[] = [];

function run(manifest: Record<string, unknown>) {
  const root = mkdtempSync(join(tmpdir(), 'lc-zip-'));
  dirs.push(root);
  const dist = join(root, 'dist');
  mkdirSync(dist);
  writeFileSync(join(dist, 'manifest.json'), JSON.stringify(manifest));
  const out = join(root, 'out.zip');
  const r = spawnSync(process.execPath, [ZIP], {
    env: { ...process.env, LANGCOACH_DIST: dist, LANGCOACH_ZIP_OUT: out },
    encoding: 'utf8',
  });
  return { ...r, out };
}

const prod = {
  manifest_version: 3,
  host_permissions: ['https://labs.google/lll/*'],
  content_scripts: [{ matches: ['https://labs.google/lll/*'], js: ['a.js'] }],
};

afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('zip.mjs (I8)', () => {
  it('packages a production manifest', () => {
    const r = run(prod);
    expect(r.status, r.stderr).toBe(0);
    expect(existsSync(r.out)).toBe(true);
  });

  it.each([
    ['localhost host permission', { ...prod, host_permissions: [...prod.host_permissions, 'http://localhost/*'] }],
    ['127.0.0.1 content-script match', { ...prod, content_scripts: [{ matches: ['http://127.0.0.1:4173/*'], js: ['a.js'] }] }],
  ])('refuses a dev/e2e build (%s)', (_n, manifest) => {
    const r = run(manifest);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/localhost|127\.0\.0\.1/);
    expect(r.stderr).toMatch(/npm run build/);
    expect(existsSync(r.out)).toBe(false);
  });
});
