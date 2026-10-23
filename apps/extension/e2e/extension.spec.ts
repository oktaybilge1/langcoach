import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, expect, test, type BrowserContext } from '@playwright/test';
import { startMockLllServer } from './mock-lll/server';

const DIST_DIR = fileURLToPath(new URL('../dist', import.meta.url));

async function launchWithExtension(): Promise<{
  context: BrowserContext;
  extensionId: string;
  cleanup: () => Promise<void>;
}> {
  const userDataDir = mkdtempSync(join(tmpdir(), 'langcoach-e2e-'));
  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chromium',
    headless: true,
    locale: 'en-US',
    args: ['--lang=en-US', `--disable-extensions-except=${DIST_DIR}`, `--load-extension=${DIST_DIR}`],
  });

  let [sw] = context.serviceWorkers();
  if (!sw) sw = await context.waitForEvent('serviceworker');
  const extensionId = new URL(sw.url()).host;

  return {
    context,
    extensionId,
    cleanup: async () => {
      await context.close();
      rmSync(userDataDir, { recursive: true, force: true });
    },
  };
}

let mock: Awaited<ReturnType<typeof startMockLllServer>>;

test.beforeAll(async () => {
  mock = await startMockLllServer();
});

test.afterAll(async () => {
  await mock?.close();
});

test('1. onboarding from side panel creates profile and weekly plan', async () => {
  const { context, extensionId, cleanup } = await launchWithExtension();
  try {
    const panel = await context.newPage();
    await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);

    await expect(panel.getByTestId('onboard-form')).toBeVisible();
    await panel.getByTestId('onboard-target').selectOption('Spanish (Spain)');
    await panel.getByTestId('onboard-native').selectOption('Turkish');
    await panel.getByTestId('onboard-level').selectOption('unsure');
    await panel.getByTestId('onboard-goal').selectOption('travel');
    await panel.getByTestId('onboard-minutes').selectOption('15');
    await panel.getByTestId('onboard-days').selectOption('5');
    await panel.getByTestId('onboard-submit').click();

    await expect(panel.getByTestId('tab-today')).toBeVisible();
    await expect(panel.getByTestId('today-task').first()).toBeVisible();
  } finally {
    await cleanup();
  }
});

test('2-5. Tiny Lesson capture -> toast 20 words saved -> regenerate already in deck -> grammar attaches -> Undo removes', async () => {
  const { context, extensionId, cleanup } = await launchWithExtension();
  try {
    const page = await context.newPage();
    await page.goto(`${mock.url}/lll/en/experiments/tiny-lesson`);

    await page.locator('#btn-terms-es').click();
    const toast = page.locator('[data-langcoach-toast]');
    await expect(toast).toContainText('✓ 20 words saved to LangCoach');

    // Grammar arrives within 5 minutes -> attaches to the captured lesson without showing a toast
    await page.locator('#btn-grammar-es').click();

    const panel = await context.newPage();
    await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
    // Complete quick onboarding so we can see Today / Review tabs
    await panel.getByTestId('onboard-submit').click();
    await expect(panel.getByTestId('tab-review')).toContainText('(20)');
    await expect(panel.getByTestId('today-grammar')).toContainText('The conditional tense for polite requests');

    // Undo from the side panel's last capture card removes the 20 unreviewed cards
    await panel.getByTestId('today-undo').click();
    await expect(panel.getByTestId('tab-review')).not.toContainText('(20)');

    // Capture again, then regenerate same Tiny Lesson -> "Already in your deck"
    await page.locator('#btn-terms-es').click();
    await expect(toast).toContainText('✓ 20 words saved to LangCoach');
    await page.locator('#btn-terms-es').click();
    await expect(toast).toContainText('Already in your deck');
  } finally {
    await cleanup();
  }
});

test('6-8. Slang Hang zh with pinyin, Word Cam ja, and Arabic RTL card rendering', async () => {
  const { context, extensionId, cleanup } = await launchWithExtension();
  try {
    const page = await context.newPage();
    await page.goto(`${mock.url}/lll/en/experiments/slang-hang`);
    await page.locator('#btn-slang-zh').click();
    await expect(page.locator('[data-langcoach-toast]')).toContainText('words saved to LangCoach');

    await page.locator('#btn-wordcam-ja').click();
    await expect(page.locator('[data-langcoach-toast]')).toContainText('words saved to LangCoach');

    await page.locator('#btn-terms-ar').click();
    await expect(page.locator('[data-langcoach-toast]')).toContainText('✓ 6 words saved to LangCoach');

    const panel = await context.newPage();
    await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
    await panel.getByTestId('onboard-target').selectOption('Arabic');
    await panel.getByTestId('onboard-submit').click();

    await panel.getByTestId('tab-review').click();
    const termEl = panel.getByTestId('card-term');
    await expect(termEl).toHaveAttribute('dir', 'auto');
    await expect(termEl).toHaveAttribute('lang', 'ar');
  } finally {
    await cleanup();
  }
});

test('9-10. manual save via message and reviewing 3 cards auto-completes review session & increases XP', async () => {
  const { context, extensionId, cleanup } = await launchWithExtension();
  try {
    const panel = await context.newPage();
    await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
    await panel.getByTestId('onboard-submit').click();

    // Save 3 manual cards via runtime message from the panel page
    for (const [term, translation] of [
      ['buenos días', 'good morning'],
      ['buenas tardes', 'good afternoon'],
      ['buenas noches', 'good night'],
    ]) {
      const res = await panel.evaluate(
        ([t, tr]) => chrome.runtime.sendMessage({ type: 'saveManual', term: t, translation: tr }),
        [term, translation],
      );
      expect(res).toMatchObject({ ok: true, data: { duplicate: false } });
    }

    await panel.reload();
    await panel.getByTestId('tab-review').click();

    for (let i = 0; i < 3; i++) {
      await panel.getByTestId('review-show').click();
      await panel.getByTestId('rate-3').click();
    }

    await expect(panel.getByTestId('review-empty')).toBeVisible();
    await panel.getByTestId('tab-progress').click();
    await expect(panel.getByTestId('progress-xp')).toContainText('13'); // 10 base review XP + 3 cards
    await expect(panel.getByTestId('progress-words')).toContainText('3');
  } finally {
    await cleanup();
  }
});

test('11-13. export/import round-trip, API shape change graceful no-op, and reminder alarm scheduling', async () => {
  const { context, extensionId, cleanup } = await launchWithExtension();
  try {
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await page.goto(`${mock.url}/lll/en/experiments/tiny-lesson`);
    await page.locator('#btn-unknown-shape').click();
    await page.waitForTimeout(300);
    await expect(page.locator('[data-langcoach-toast]')).toHaveCount(0);
    expect(errors).toEqual([]);

    const panel = await context.newPage();
    await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
    await panel.getByTestId('onboard-submit').click();

    // Export -> Reset -> Import round-trip
    const exported = await panel.evaluate(() => chrome.runtime.sendMessage({ type: 'exportData' }));
    expect(exported.ok).toBe(true);
    await panel.evaluate(() => chrome.runtime.sendMessage({ type: 'reset' }));
    const snapAfterReset = await panel.evaluate(() => chrome.runtime.sendMessage({ type: 'getSnapshot' }));
    expect(snapAfterReset.data.profile).toBeNull();

    const imported = await panel.evaluate((json) => chrome.runtime.sendMessage({ type: 'importData', json }), exported.data.json);
    expect(imported.ok).toBe(true);
    const snapAfterImport = await panel.evaluate(() => chrome.runtime.sendMessage({ type: 'getSnapshot' }));
    expect(snapAfterImport.data.profile).not.toBeNull();

    // Schedule daily reminder and verify chrome.alarms contains 'langcoach-reminder'
    await panel.evaluate(() =>
      chrome.runtime.sendMessage({ type: 'setSettings', settings: { reminderTime: '19:45' } }),
    );
    const alarm = await panel.evaluate(() => chrome.alarms.get('langcoach-reminder'));
    expect(alarm).toBeTruthy();
    expect(alarm?.periodInMinutes).toBe(1440);
  } finally {
    await cleanup();
  }
});

/** Stubs Chrome's on-device Translator in every page of the context (main world + the e2e marker the
 * isolated content script reads, since init scripts cannot reach that world). */
const TRANSLATOR_STUB = `(() => {
  const PREFIX = '[tr] ';
  const translator = { translate: async (text) => PREFIX + text, destroy() {} };
  globalThis.Translator = {
    availability: async () => 'available',
    create: async () => translator,
  };
  const mark = () => document.documentElement && document.documentElement.setAttribute('data-langcoach-e2e-translate', PREFIX);
  mark();
  if (!document.documentElement) document.addEventListener('readystatechange', mark, { once: true });
})();`;

test('14. native translations: capture -> stored on cards -> line on the LLL page (survives re-render) -> panel shows Turkish first', async () => {
  const { context, extensionId, cleanup } = await launchWithExtension();
  try {
    await context.addInitScript({ content: TRANSLATOR_STUB });

    const panel = await context.newPage();
    await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
    await panel.getByTestId('onboard-target').selectOption('Spanish (Spain)');
    await panel.getByTestId('onboard-native').selectOption('Turkish');
    await panel.getByTestId('onboard-submit').click();
    await expect(panel.getByTestId('tab-today')).toBeVisible();

    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${mock.url}/lll/en/experiments/tiny-lesson`);
    await page.locator('#btn-terms-es').click();
    await expect(page.locator('[data-langcoach-toast]')).toContainText('✓ 20 words saved to LangCoach');

    // Overlay: a small Turkish line right under LLL's own "coffee" meaning; LLL's text is untouched.
    const coffee = page.locator('.lll-meaning', { hasText: /^coffee$/ });
    await expect(coffee).toHaveText('coffee');
    const line = coffee.locator('xpath=following-sibling::*[1]');
    await expect(line).toHaveText('[tr] coffee');
    await expect(line).toHaveAttribute('lang', 'tr');
    await expect(page.locator('[data-langcoach-native]')).toHaveCount(20);

    // LLL re-renders the cards: the lines come back.
    await page.locator('#btn-rerender').click();
    await expect(page.locator('[data-langcoach-native]')).toHaveCount(20);

    // Stored on the cards (by the content script, through the background).
    await expect
      .poll(async () => {
        const snap = await panel.evaluate(() => chrome.runtime.sendMessage({ type: 'getSnapshot' }));
        return (snap.data.state.cards as { nativeTranslation?: string }[]).filter((c) => c.nativeTranslation).length;
      })
      .toBe(20);

    // Panel: native meaning first, English beneath.
    await panel.reload();
    await panel.getByTestId('tab-review').click();
    await panel.getByTestId('mode-list').click();
    const natives = panel.getByTestId('vocab-native');
    await expect(natives).toHaveCount(20);
    await expect(panel.getByText('[tr] coffee', { exact: true })).toBeVisible();

    // Settings toggle removes the lines from the open LLL page.
    await panel.getByTestId('tab-settings').click();
    await panel.getByTestId('pref-native-page').uncheck();
    await expect(page.locator('[data-langcoach-native]')).toHaveCount(0);
    expect(errors).toEqual([]);
  } finally {
    await cleanup();
  }
});

test('15. practice: start with captured words -> answer every exercise -> end screen XP -> today XP increased once', async () => {
  const { context, extensionId, cleanup } = await launchWithExtension();
  try {
    const panel = await context.newPage();
    const errors: string[] = [];
    panel.on('pageerror', (e) => errors.push(e.message));
    await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
    await panel.getByTestId('onboard-target').selectOption('Spanish (Spain)');
    await panel.getByTestId('onboard-submit').click();
    await expect(panel.getByTestId('tab-today')).toBeVisible();

    const words: [string, string, string][] = [
      ['la cuenta', 'the bill', '¿Me trae la cuenta, por favor?'],
      ['la mesa', 'the table', 'Una mesa para dos.'],
      ['el menú', 'the menu', '¿Puedo ver el menú?'],
      ['el agua', 'the water', 'Quiero el agua con gas.'],
      ['el postre', 'the dessert', 'El postre está delicioso.'],
    ];
    for (const [term, translation, example] of words) {
      const res = await panel.evaluate(
        ([t, tr, ex]) => chrome.runtime.sendMessage({ type: 'saveManual', term: t, translation: tr, example: ex }),
        [term, translation, example],
      );
      expect(res).toMatchObject({ ok: true });
    }
    const xpOf = async () =>
      (await panel.evaluate(() => chrome.runtime.sendMessage({ type: 'getSnapshot' }))).data.progress.todayXp as number;
    const before = await xpOf();

    // Cards are due: the panel opens on Practice.
    await panel.reload();
    await expect(panel.getByTestId('tab-practice')).toHaveAttribute('aria-current', 'page');
    await panel.getByTestId('btn-start-practice').click();

    for (let i = 0; i < 30; i++) {
      if (await panel.getByTestId('practice-end').isVisible()) break;
      const ex = panel.getByTestId('practice-exercise');
      await expect(ex).toBeVisible();
      const kind = await ex.getAttribute('data-kind');
      const known = (await ex.getAttribute('data-e2e-answer'))!;
      expect(known, 'e2e builds expose the answer').not.toBeNull();
      if (kind === 'match') {
        for (const [ti, mi] of JSON.parse(known) as [number, number][]) {
          await panel.getByTestId(`match-term-${ti}`).click();
          await panel.getByTestId(`match-meaning-${mi}`).click();
        }
      } else if (kind === 'type') {
        await panel.getByTestId('type-input').fill(known);
        await panel.keyboard.press('Enter');
      } else {
        await panel.keyboard.press(String(Number(known) + 1));
        await panel.keyboard.press('Enter');
      }
      await expect(panel.getByTestId('practice-feedback')).toHaveAttribute('data-state', 'correct');
      await panel.getByTestId('btn-continue').click();
    }

    await expect(panel.getByTestId('practice-end')).toBeVisible();
    const xpEl = panel.getByTestId('practice-xp');
    await expect(xpEl).not.toHaveAttribute('data-xp', '');
    const earned = Number(await xpEl.getAttribute('data-xp'));
    expect(earned).toBeGreaterThanOrEqual(15); // 5 words + 5 completion + 5 perfect
    await expect(panel.getByTestId('practice-accuracy')).toContainText('100%');
    await expect.poll(xpOf).toBe(before + earned);

    // Re-rendering the end screen (storage refresh) does not record twice.
    await panel.getByTestId('tab-today').click();
    await panel.getByTestId('tab-practice').click();
    expect(await xpOf()).toBe(before + earned);
    expect(errors).toEqual([]);
  } finally {
    await cleanup();
  }
});
