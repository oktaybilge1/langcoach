import { expect, test } from 'vitest';
import { parseState, progressOf } from '@langcoach/core';
import { DEMO_NOW, demoState } from './demo-data.mjs';

test('demo learner is valid, deterministic and has a 5-day streak', () => {
  for (const lang of ['en', 'tr']) {
    const s = parseState(demoState(lang));
    expect(s.cards).toHaveLength(90);
    expect(s.lessons).toHaveLength(6);
    expect(progressOf(s, DEMO_NOW).streak).toBe(5);
  }
  expect(JSON.stringify(demoState('tr'))).toBe(JSON.stringify(demoState('tr')));
});
