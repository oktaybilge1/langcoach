import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, expect, test, type BrowserContext, type Page } from '@playwright/test';
import { startBridgeStub } from './bridge-stub/server';
import { startMockLllServer } from './mock-lll/server';

const DIST_DIR = fileURLToPath(new URL('../dist-e2e', import.meta.url));
const SENT = 'sent to your agent';

async function launch(extDir = DIST_DIR): Promise<{ context: BrowserContext; extensionId: string; cleanup: () => Promise<void> }> {
  const userDataDir = mkdtempSync(join(tmpdir(), 'langcoach-e2e-'));
  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chromium',
    headless: true,
    locale: 'en-US',
    args: ['--lang=en-US', `--disable-extensions-except=${extDir}`, `--load-extension=${extDir}`],
  });
  let [sw] = context.serviceWorkers();
  if (!sw) sw = await context.waitForEvent('serviceworker');
  return {
    context,
    extensionId: new URL(sw.url()).host,
    cleanup: async () => {
      await context.close();
      rmSync(userDataDir, { recursive: true, force: true });
    },
  };
}

async function openSettings(context: BrowserContext, extensionId: string): Promise<Page> {
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await panel.getByTestId('onboard-submit').click();
  await panel.getByTestId('tab-settings').click();
  return panel;
}

let mock: Awaited<ReturnType<typeof startMockLllServer>>;
test.beforeAll(async () => {
  mock = await startMockLllServer();
});
test.afterAll(async () => {
  await mock?.close();
});

test('B1. paired: a Tiny Lesson capture reaches the agent stub once; toast and panel say so', async () => {
  const stub = await startBridgeStub();
  const { context, extensionId, cleanup } = await launch();
  try {
    const page = await context.newPage();
    await page.goto(`${mock.url}/lll/en/experiments/tiny-lesson`);
    await page.locator('#btn-terms-es').click();
    await expect(page.locator('[data-langcoach-toast]')).toContainText(`✓ 20 words saved to LangCoach · ${SENT}`);
    expect(stub.lessons.size).toBe(1);
    const [lesson] = [...stub.lessons.values()];
    expect(lesson).toMatchObject({ kind: 'tiny_lesson', source: { app: 'lll', targetLanguage: 'European Spanish' } });
    expect(lesson!.items).toHaveLength(20);

    const panel = await openSettings(context, extensionId);
    await expect(panel.getByTestId('bridge-status')).toContainText('Connected to your agent');
    expect(stub.lessons.size).toBe(1);
  } finally {
    await cleanup();
    await stub.close();
  }
});

test('B2. agent down: capture is kept as a backlog, then flushed when the agent is back', async () => {
  const { context, extensionId, cleanup } = await launch();
  let stub: Awaited<ReturnType<typeof startBridgeStub>> | undefined;
  try {
    const page = await context.newPage();
    await page.goto(`${mock.url}/lll/en/experiments/tiny-lesson`);
    await page.locator('#btn-terms-es').click();
    const toast = page.locator('[data-langcoach-toast]');
    await expect(toast).toContainText('✓ 20 words saved to LangCoach');
    await expect(toast).not.toContainText(SENT);

    const panel = await openSettings(context, extensionId);
    await expect(panel.getByTestId('bridge-status')).toContainText('Waiting for your agent');
    await expect(panel.getByTestId('bridge-status')).toContainText('1 lessons waiting');

    stub = await startBridgeStub();
    // Turning the switch off and on flushes at once (the retry alarm would do it within 2 minutes).
    await panel.getByTestId('pref-bridge').uncheck();
    await expect(panel.getByTestId('bridge-status')).toContainText('Off');
    await panel.getByTestId('pref-bridge').check();
    await expect.poll(() => stub!.lessons.size).toBe(1);
    await panel.reload();
    await panel.getByTestId('tab-settings').click();
    await expect(panel.getByTestId('bridge-status')).toContainText('Connected to your agent');
    await expect(panel.getByTestId('bridge-status')).not.toContainText('waiting');
  } finally {
    await cleanup();
    await stub?.close();
  }
});

test('B3. a server that cannot prove the pairing secret gets nothing', async () => {
  const stub = await startBridgeStub({ proof: 'wrong' });
  const { context, extensionId, cleanup } = await launch();
  try {
    const page = await context.newPage();
    await page.goto(`${mock.url}/lll/en/experiments/tiny-lesson`);
    await page.locator('#btn-terms-es').click();
    const toast = page.locator('[data-langcoach-toast]');
    await expect(toast).toContainText('✓ 20 words saved to LangCoach');
    await expect(toast).not.toContainText(SENT);
    const panel = await openSettings(context, extensionId);
    await expect(panel.getByTestId('bridge-status')).toContainText('Server not verified');
    expect(stub.lessons.size).toBe(0);
    expect(stub.requests.filter((r) => r.method === 'POST')).toHaveLength(0);
  } finally {
    await cleanup();
    await stub.close();
  }
});

test('B4. without a pairing file nothing is sent and the panel says "Not paired"', async () => {
  const stub = await startBridgeStub();
  const unpaired = mkdtempSync(join(tmpdir(), 'langcoach-unpaired-'));
  cpSync(DIST_DIR, unpaired, { recursive: true, filter: (src) => !src.endsWith('pairing.json') });
  const { context, extensionId, cleanup } = await launch(unpaired);
  try {
    const page = await context.newPage();
    await page.goto(`${mock.url}/lll/en/experiments/tiny-lesson`);
    await page.locator('#btn-terms-es').click();
    await expect(page.locator('[data-langcoach-toast]')).toContainText('✓ 20 words saved to LangCoach');
    const panel = await openSettings(context, extensionId);
    await expect(panel.getByTestId('bridge-status')).toContainText('Not paired');
    await expect(panel.getByTestId('bridge-pair-help')).toBeVisible();
    expect(stub.requests).toHaveLength(0);
  } finally {
    await cleanup();
    await stub.close();
    rmSync(unpaired, { recursive: true, force: true });
  }
});
