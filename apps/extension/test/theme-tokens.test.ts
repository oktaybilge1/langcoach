import { readFileSync } from 'node:fs';
import { emptyState, NOTEBOOK_TOKENS } from '@langcoach/core/browser';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../src/sidepanel/styles.css', import.meta.url), 'utf8');
const rootBlock = css.match(/:root\s*\{([^}]*)\}/)?.[1] ?? '';
const kebab = (name: string) => name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

describe('notebook theme tokens', () => {
  it('has the exact owner-approved values', () => {
    expect(NOTEBOOK_TOKENS).toMatchObject({
      paper: '#faf7f2',
      rule: '#efe7da',
      border: '#eadfcd',
      shadow: '0 3px 0 #eadfcd',
      streakTile: '#fff1e0',
      wordsTile: '#eef6e8',
      sticker: '#fde68a',
      stickerRotate: '-6deg',
      xpFrom: '#fb923c',
      xpTo: '#facc15',
      learnedBg: '#dcfce7',
      learnedFg: '#166534',
      weakBg: '#ffe4e6',
      weakFg: '#9f1239',
      radius: '14px',
    });
  });

  it('side panel declares every token as --lc-<name> in the first :root', () => {
    for (const [name, value] of Object.entries(NOTEBOOK_TOKENS)) {
      expect(rootBlock, name).toContain(`--lc-${kebab(name)}: ${value};`);
    }
  });

  it('agent dashboard output uses the same values', async () => {
    // Non-literal path keeps the mcp package out of the extension's tsc program.
    const renderPath = '../../../packages/mcp/src/dashboard/render.ts';
    const { renderDashboard } = (await import(/* @vite-ignore */ renderPath)) as {
      renderDashboard: (s: ReturnType<typeof emptyState>, now: Date) => string;
    };
    const html = renderDashboard(emptyState(), new Date(2026, 10, 10, 9, 30));
    for (const [name, value] of Object.entries(NOTEBOOK_TOKENS)) expect(html, name).toContain(value);
  });
});
