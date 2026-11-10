/** Seeded PRNG helpers. The practice module never uses Math.random. */
export type Rng = () => number;

/** mulberry32: small, fast, deterministic; returns floats in [0, 1). */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Integer in [0, n). */
export function randInt(rnd: Rng, n: number): number {
  return Math.floor(rnd() * n);
}

/** Fisher–Yates on a copy. */
export function shuffle<T>(arr: readonly T[], rnd: Rng): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = randInt(rnd, i + 1);
    const tmp = out[i]!;
    out[i] = out[j]!;
    out[j] = tmp;
  }
  return out;
}
