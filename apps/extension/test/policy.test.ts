import { describe, expect, it } from 'vitest';
import { isAllowed, type SenderLike } from '../src/background/policy';

const ID = 'abcdef';
const ORIGIN = 'chrome-extension://abcdef/';
const page: SenderLike = { id: ID, url: `${ORIGIN}sidepanel.html` };
const lll: SenderLike = { id: ID, url: 'https://labs.google/lll/en', tab: {} };
const allow = (type: string, s: SenderLike, e2e = false) => isAllowed(type, s, ID, ORIGIN, e2e);

describe('isAllowed', () => {
  it('lets extension pages use UI messages plus undo and saveManual', () => {
    for (const t of [
      'getSnapshot',
      'setProfile',
      'createPlan',
      'completeReview',
      'getDue',
      'review',
      'updateCard',
      'undo',
      'saveManual',
      'exportData',
      'importData',
      'reset',
      'getSettings',
      'setSettings',
    ]) {
      expect(allow(t, page)).toBe(true);
    }
  });
  it('lets content scripts on labs.google/lll use capture/undo/saveManual/openPanel only', () => {
    for (const t of ['capture', 'undo', 'saveManual', 'openPanel']) expect(allow(t, lll)).toBe(true);
    for (const t of ['reset', 'importData', 'getSnapshot', 'setSettings', 'createPlan', 'completeReview']) {
      expect(allow(t, lll)).toBe(false);
    }
  });
  it('keeps capture and openPanel away from extension pages', () => {
    for (const t of ['capture', 'openPanel']) expect(allow(t, page)).toBe(false);
  });
  it('rejects foreign ids, tabless content senders, other sites and lookalikes', () => {
    expect(allow('reset', { ...page, id: 'evil' })).toBe(false);
    expect(allow('capture', { id: ID, url: lll.url })).toBe(false);
    expect(allow('capture', { ...lll, url: 'https://evil.example/lll/' })).toBe(false);
    expect(allow('capture', { ...lll, url: 'https://labs.google/lll.evil' })).toBe(false);
    expect(allow('capture', { ...lll, url: 'https://labs.google.evil.com/lll/x' })).toBe(false);
    expect(allow('reset', { id: ID })).toBe(false);
    expect(allow('bogus', page)).toBe(false);
  });
  it('allows localhost content senders only in e2e', () => {
    const lh: SenderLike = { id: ID, url: 'http://localhost:4173/lll/x', tab: {} };
    const ip: SenderLike = { id: ID, url: 'https://127.0.0.1/x', tab: {} };
    expect(allow('capture', lh)).toBe(false);
    expect(allow('capture', lh, true)).toBe(true);
    expect(allow('capture', ip, true)).toBe(true);
    expect(allow('capture', { ...lh, url: 'http://localhost.evil.com/' }, true)).toBe(false);
  });
});
