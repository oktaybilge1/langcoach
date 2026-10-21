import type { LogEntry, TaskType, WeekPlan } from './types.js';

const BASE_XP: Record<TaskType, number> = {
  tiny_lesson: 20,
  slang_hang: 20,
  quiz: 30,
  review: 10,
  word_cam: 20,
};

/** XP for completing a task; reviews earn 1 extra XP per card reviewed. */
export function xpFor(type: TaskType, cardsReviewed = 0): number {
  return BASE_XP[type] + (type === 'review' ? cardsReviewed : 0);
}

/** Previous calendar day of a YYYY-MM-DD string (computed in UTC, so DST-safe). */
function prevDay(date: string): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1, d - 1));
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${p(t.getUTCFullYear(), 4)}-${p(t.getUTCMonth() + 1)}-${p(t.getUTCDate())}`;
}

/** Consecutive active days ending today (or yesterday if today has no activity yet). */
export function streak(log: LogEntry[], today: string): number {
  const days = new Set(log.map((e) => e.date));
  let cursor = days.has(today) ? today : prevDay(today);
  let count = 0;
  while (days.has(cursor)) {
    count++;
    cursor = prevDay(cursor);
  }
  return count;
}

/** Study days in the plan, and how many have all their tasks done. */
export function weeklyGoal(plan: WeekPlan | undefined): { done: number; planned: number } {
  if (!plan) return { done: 0, planned: 0 };
  const byDate = new Map<string, boolean>();
  for (const t of plan.tasks) {
    byDate.set(t.date, (byDate.get(t.date) ?? true) && t.status === 'done');
  }
  return { done: [...byDate.values()].filter(Boolean).length, planned: byDate.size };
}
