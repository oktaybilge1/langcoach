import { describe, expect, it } from 'vitest';
import '../src/background/zod-config';
import { z } from 'zod';
import { parseState, emptyState } from '@langcoach/core/browser';

describe('zod-config', () => {
  it('sets jitless before core schemas are used', () => {
    expect(z.config().jitless).toBe(true);
    expect(parseState(emptyState())).toEqual(emptyState());
  });
});
