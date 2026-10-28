/** Named levels by total XP. `key` is the i18n message with the localized level name. */
export interface LevelSpec {
  level: number;
  minXp: number;
  key: string;
}

const THRESHOLDS = [0, 50, 150, 300, 500, 800, 1200, 1700, 2400, 3300] as const;

export const LEVELS: readonly LevelSpec[] = THRESHOLDS.map((minXp, i) => ({
  level: i + 1,
  minXp,
  key: `level${i + 1}`,
}));

export interface LevelInfo extends LevelSpec {
  /** XP where the next level starts, or null at the top level. */
  nextMinXp: number | null;
  /** 0..1 progress from this level to the next (1 at the top). */
  progress: number;
  /** XP still needed for the next level (0 at the top). */
  toNext: number;
}

export function levelFor(totalXp: number): LevelInfo {
  const xp = Number.isFinite(totalXp) ? Math.max(0, totalXp) : 0;
  let i = 0;
  while (i + 1 < LEVELS.length && xp >= LEVELS[i + 1]!.minXp) i++;
  const cur = LEVELS[i]!;
  const next = LEVELS[i + 1];
  if (!next) return { ...cur, nextMinXp: null, progress: 1, toNext: 0 };
  const span = next.minXp - cur.minXp;
  return { ...cur, nextMinXp: next.minXp, progress: Math.min(1, (xp - cur.minXp) / span), toNext: next.minXp - xp };
}
