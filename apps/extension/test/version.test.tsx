// @vitest-environment jsdom
import { emptyState } from '@langcoach/core/browser';
import { readFileSync } from 'node:fs';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, type Snapshot } from '../src/shared/messages';
import type { PanelSend } from '../src/sidepanel/App';
import { createTranslator } from '../src/sidepanel/i18n';
import { Settings } from '../src/sidepanel/views/Settings';

const json = (rel: string) => JSON.parse(readFileSync(new URL(rel, import.meta.url), 'utf8'));
const manifest = json('../public/manifest.json');
const pkg = json('../package.json');

describe('release version', () => {
  it('is 0.2.0 in the manifest and the extension package, and they agree', () => {
    expect(manifest.version).toBe('0.2.0');
    expect(pkg.version).toBe(manifest.version);
  });

  it('Settings > About shows the manifest version (no hard-coded copy)', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const st = emptyState();
    const snap: Snapshot = {
      profile: null,
      today: null,
      plan: null,
      progress: { streak: 0, totalXp: 0, weekly: { done: 0, planned: 0 }, dueCount: 0 },
      dueCount: 0,
      lastCapture: null,
      state: st,
    };
    const send = vi.fn(async () => null) as unknown as PanelSend;
    const { t } = createTranslator('en');
    await act(async () => {
      render(<Settings snapshot={snap} settings={DEFAULT_SETTINGS} t={t} send={send} onRefresh={async () => {}} />, host);
    });
    const about = host.querySelector('[data-testid="about-version"]');
    expect(about?.textContent).toBe(`v${manifest.version}`);
    render(null, host);
    host.remove();
  });
});
