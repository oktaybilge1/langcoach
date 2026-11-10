import { z } from 'zod';

// MV3 CSP forbids eval/new Function. Import this module FIRST in every entry that loads core schemas
// (ES imports are hoisted, so schemas are built before any later statement runs).
z.config({ jitless: true });
