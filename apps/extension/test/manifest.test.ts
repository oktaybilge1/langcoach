import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const raw = readFileSync(new URL('../public/manifest.json', import.meta.url), 'utf8');
const m = JSON.parse(raw);
const msgs = (l: string) =>
  JSON.parse(readFileSync(new URL(`../public/_locales/${l}/messages.json`, import.meta.url), 'utf8'));

describe('manifest', () => {
  it('is MV3 with min Chrome 116', () => {
    expect(m.manifest_version).toBe(3);
    expect(m.minimum_chrome_version).toBe('116');
  });
  it('has exact permissions and host permissions', () => {
    expect([...m.permissions].sort()).toEqual(['alarms', 'contextMenus', 'notifications', 'sidePanel', 'storage', 'unlimitedStorage']);
    expect(m.host_permissions).toEqual(['https://labs.google/lll/*']);
  });
  it('declares the MAIN-world and isolated content scripts at document_start', () => {
    const main = m.content_scripts.find((c: { js: string[] }) => c.js.includes('content-main.js'));
    const iso = m.content_scripts.find((c: { js: string[] }) => c.js.includes('content-isolated.js'));
    expect(main).toMatchObject({ world: 'MAIN', run_at: 'document_start', matches: ['https://labs.google/lll/*'] });
    expect(iso).toMatchObject({ run_at: 'document_start', matches: ['https://labs.google/lll/*'] });
    expect(iso.world).toBeUndefined();
  });
  it('wires side panel, action icons and module service worker', () => {
    expect(m.side_panel.default_path).toBe('sidepanel.html');
    expect(m.background).toEqual({ service_worker: 'background.js', type: 'module' });
    expect(Object.keys(m.action.default_icon)).toEqual(['16', '32', '48', '128']);
    expect(m.default_locale).toBe('en');
  });
  it('has no all_urls, no localhost, no Google in the name', () => {
    expect(raw).not.toContain('<all_urls>');
    expect(raw).not.toContain('localhost');
    for (const l of ['en', 'tr', 'es', 'fr', 'pt_BR']) {
      expect(msgs(l).extName.message).toBe('LangCoach');
      expect(msgs(l).extDescription.message.length).toBeGreaterThan(20);
      expect(msgs(l).extDescription.message.length).toBeLessThanOrEqual(132);
    }
    expect(m.name).toBe('__MSG_extName__');
    expect(m.description).toBe('__MSG_extDescription__');
  });
});
