// README screenshots from the fabricated demo learner (scripts/demo-data.mjs).
// Writes docs/media/dashboard{,.tr}.png (1280×800), dashboard-mobile.png (390×844) and sidepanel{,.tr}.png.
// Usage: npm run screenshots (builds the production extension first).
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { runnerImport } from 'vite';
import { DEMO_NOW, demoState } from './demo-data.mjs';

process.env.TZ = 'UTC';
const root = fileURLToPath(new URL('..', import.meta.url));
const media = join(root, 'docs/media');
const extDir = join(root, 'apps/extension/dist');
const shots = [];

const { module } = await runnerImport(join(root, 'packages/mcp/src/dashboard/render.ts'));
const { renderDashboard } = module;

// Dashboard (the page open_dashboard writes), rendered offline.
const browser = await chromium.launch({ channel: 'chromium' });
try {
  for (const [lang, name, width, height] of [['en', 'dashboard', 1280, 800], ['en', 'dashboard-mobile', 390, 844], ['tr', 'dashboard.tr', 1280, 800]]) {
    const page = await browser.newPage({ viewport: { width, height }, timezoneId: 'UTC', reducedMotion: 'reduce' });
    await page.setContent(renderDashboard(demoState(lang), DEMO_NOW));
    await page.screenshot({ path: join(media, `${name}.png`) });
    shots.push(`${name}.png`);
    await page.close();
  }
} finally {
  await browser.close();
}

// Side panel of the production extension, seeded with the demo state.
const build = spawnSync(process.execPath, [join(root, 'apps/extension/scripts/build.mjs')], { cwd: root, stdio: 'inherit' });
if (build.status !== 0) process.exit(build.status ?? 1);

for (const [lang, locale, name] of [['en', 'en-US', 'sidepanel'], ['tr', 'tr-TR', 'sidepanel.tr']]) {
  const profileDir = mkdtempSync(join(tmpdir(), 'langcoach-shots-'));
  const context = await chromium.launchPersistentContext(profileDir, {
    channel: 'chromium', headless: true, locale, timezoneId: 'UTC', reducedMotion: 'reduce',
    viewport: { width: 400, height: 760 }, deviceScaleFactor: 2,
    args: [`--lang=${locale}`, `--disable-extensions-except=${extDir}`, `--load-extension=${extDir}`],
  });
  try {
    let [sw] = context.serviceWorkers();
    if (!sw) sw = await context.waitForEvent('serviceworker');
    // The service worker computes streak and due words with its own clock: pin it to the demo date.
    await sw.evaluate(([t, raw]) => {
      const Real = Date;
      const off = t - Real.now();
      globalThis.Date = class extends Real {
        constructor(...a) { if (a.length) super(...a); else super(Real.now() + off); }
        static now() { return Real.now() + off; }
      };
      return chrome.storage.local.set({ 'langcoach:state': raw });
    }, [DEMO_NOW.getTime(), JSON.stringify(demoState(lang))]);
    await context.clock.setFixedTime(DEMO_NOW);
    const panel = await context.newPage();
    await panel.goto(`chrome-extension://${new URL(sw.url()).host}/sidepanel.html`);
    await panel.getByTestId('tab-today').click();
    await panel.waitForTimeout(500);
    await panel.screenshot({ path: join(media, `${name}.png`) });
    shots.push(`${name}.png`);
  } finally {
    await context.close();
    rmSync(profileDir, { recursive: true, force: true });
  }
}

for (const f of shots) {
  const kb = statSync(join(media, f)).size / 1024;
  console.log(`${f}  ${kb.toFixed(0)} KB${kb >= 400 ? '  (over 400 KB!)' : ''}`);
  if (kb >= 400) process.exitCode = 1;
}
