// Integration: the built e2e extension against the REAL langcoach MCP bridge module (in-process,
// temp LANGCOACH_HOME, the e2e port 47822 so it never touches a real agent on 47821).
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, expect, test } from '@playwright/test';
import { Coach, JsonFileStore } from '@langcoach/core';
import { createBridgeController } from '../../../packages/mcp/src/bridge';
import { E2E_BRIDGE_PORT, E2E_TOKEN } from './bridge-stub/server';
import { startMockLllServer } from './mock-lll/server';

const DIST_DIR = fileURLToPath(new URL('../dist-e2e', import.meta.url));

test('A1. real bridge: an LLL capture lands in data.json (origin bridge, externalId) once; a resend is a duplicate', async () => {
  const mock = await startMockLllServer();
  const home = mkdtempSync(join(tmpdir(), 'langcoach-agent-'));
  const userDataDir = mkdtempSync(join(tmpdir(), 'langcoach-e2e-'));
  // Same secret the e2e build packs into its pairing.json, as bridge_prepare_extension would pair them.
  writeFileSync(join(home, 'bridge-token'), E2E_TOKEN);
  const coach = new Coach(new JsonFileStore(join(home, 'data.json')));
  const outcomes: string[] = [];
  const save = coach.saveLesson.bind(coach);
  coach.saveLesson = async (input) => {
    const r = await save(input);
    outcomes.push(r.alreadyImported ? 'duplicate' : 'saved');
    return r;
  };
  const bridge = createBridgeController(coach, { dataDir: home, port: E2E_BRIDGE_PORT, version: 'e2e', log: () => {} });
  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chromium',
    headless: true,
    locale: 'en-US',
    args: ['--lang=en-US', `--disable-extensions-except=${DIST_DIR}`, `--load-extension=${DIST_DIR}`],
  });
  try {
    expect(bridge.status().listening).toBe(true);
    let [sw] = context.serviceWorkers();
    if (!sw) sw = await context.waitForEvent('serviceworker');
    const extensionId = new URL(sw.url()).host;

    const page = await context.newPage();
    await page.goto(`${mock.url}/lll/en/experiments/tiny-lesson`);
    await page.locator('#btn-terms-es').click();
    await expect(page.locator('[data-langcoach-toast]')).toContainText('sent to your agent');

    const readLessons = () => JSON.parse(readFileSync(join(home, 'data.json'), 'utf8')).lessons as Record<string, unknown>[];
    const lessons = readLessons();
    expect(lessons).toHaveLength(1);
    expect(lessons[0]).toMatchObject({ kind: 'tiny_lesson', origin: 'bridge', source: { app: 'lll' } });
    expect(typeof lessons[0]!.externalId).toBe('string');
    expect(lessons[0]!.items).toHaveLength(20);
    expect(bridge.status()).toMatchObject({ receivedLessons: 1, receivedCards: 20 });

    // Forget what was sent and flush again: the bridge sees the same id and creates nothing.
    await sw.evaluate(() => chrome.storage.local.remove('langcoach:bridgeSent'));
    const panel = await context.newPage();
    await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
    await panel.getByTestId('onboard-submit').click();
    await panel.getByTestId('tab-settings').click();
    // Wait for the settings to load, or the switch can flip back mid-click.
    await expect(panel.getByTestId('bridge-status')).toContainText('Connected to your agent');
    await expect(panel.getByTestId('pref-bridge')).toBeChecked();
    await panel.getByTestId('pref-bridge').uncheck();
    await expect(panel.getByTestId('bridge-status')).toContainText('Off');
    await panel.getByTestId('pref-bridge').check();
    await expect.poll(() => outcomes).toEqual(['saved', 'duplicate']);
    expect(readLessons()).toHaveLength(1);
    expect(bridge.status()).toMatchObject({ receivedLessons: 1, receivedCards: 20 });
    await expect(panel.getByTestId('bridge-status')).toContainText('Connected to your agent');
  } finally {
    await context.close();
    await bridge.close();
    await mock.close();
    rmSync(userDataDir, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
});
