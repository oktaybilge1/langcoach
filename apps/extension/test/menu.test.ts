import { Coach, MemoryStore } from '@langcoach/core/browser';
import { describe, expect, it, vi } from 'vitest';
import { MENU_ID, createMenuClickHandler, registerMenus } from '../src/background/menu';

function fakeMenus() {
  const calls: string[] = [];
  const created: Record<string, unknown>[] = [];
  return {
    calls,
    created,
    api: {
      removeAll: vi.fn(async () => void calls.push('removeAll')),
      create: vi.fn((p: Record<string, unknown>) => {
        calls.push('create');
        created.push(p);
      }),
    },
  };
}

describe('context menu', () => {
  it('removes then creates the selection menu on labs.google/lll only', async () => {
    const m = fakeMenus();
    await registerMenus(m.api, (k) => `msg:${k}`, false);
    expect(m.calls).toEqual(['removeAll', 'create']);
    expect(m.created[0]).toEqual({
      id: MENU_ID,
      title: 'msg:menuSave',
      contexts: ['selection'],
      documentUrlPatterns: ['https://labs.google/lll/*'],
    });
  });

  it('adds localhost patterns only for e2e builds', async () => {
    const m = fakeMenus();
    await registerMenus(m.api, (k) => k, true);
    expect(m.created[0]?.documentUrlPatterns).toEqual([
      'https://labs.google/lll/*',
      'http://localhost/*',
      'http://127.0.0.1/*',
    ]);
  });

  function setup() {
    const coach = new Coach(new MemoryStore(), () => new Date('2026-03-04T10:00:00Z'));
    const sendMessage = vi.fn(async () => undefined);
    const log = vi.fn();
    const onClick = createMenuClickHandler({ coach, tabs: { sendMessage }, log });
    return { coach, sendMessage, onClick, log };
  }

  it('saves the trimmed selection (max 200 chars) and toasts the tab', async () => {
    const { coach, sendMessage, onClick } = setup();
    await onClick({ menuItemId: MENU_ID, selectionText: `  ${'a'.repeat(250)}  ` }, { id: 3 });
    const s = await coach.exportData();
    expect(s.cards[0]?.term).toBe('a'.repeat(200));
    expect(sendMessage).toHaveBeenCalledWith(3, { type: 'toast', variant: 'manual' });
  });

  it('duplicate → "already" toast; empty selection or other menu → nothing', async () => {
    const { coach, sendMessage, onClick } = setup();
    await onClick({ menuItemId: MENU_ID, selectionText: 'hola' }, { id: 3 });
    await onClick({ menuItemId: MENU_ID, selectionText: ' Hola ' }, { id: 3 });
    expect(sendMessage).toHaveBeenLastCalledWith(3, { type: 'toast', variant: 'already' });
    sendMessage.mockClear();
    await onClick({ menuItemId: MENU_ID, selectionText: '   ' }, { id: 3 });
    await onClick({ menuItemId: 'other', selectionText: 'x' }, { id: 3 });
    expect(sendMessage).not.toHaveBeenCalled();
    expect((await coach.exportData()).cards).toHaveLength(1);
  });

  it('never throws: no tab, failed toast delivery, or save errors are logged', async () => {
    const { coach, sendMessage, onClick, log } = setup();
    await expect(onClick({ menuItemId: MENU_ID, selectionText: 'uno' }, undefined)).resolves.toBeUndefined();
    expect((await coach.exportData()).cards).toHaveLength(1);
    sendMessage.mockRejectedValueOnce(new Error('Receiving end does not exist'));
    await expect(onClick({ menuItemId: MENU_ID, selectionText: 'dos' }, { id: 3 })).resolves.toBeUndefined();
    vi.spyOn(coach, 'saveManualCard').mockRejectedValueOnce(new Error('disk'));
    await expect(onClick({ menuItemId: MENU_ID, selectionText: 'tres' }, { id: 3 })).resolves.toBeUndefined();
    expect(log).toHaveBeenCalled();
  });
});
