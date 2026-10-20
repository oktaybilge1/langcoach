import { weekDates } from './dates.js';
import type { PlanTask, Profile, TaskType, WeekPlan } from './types.js';

/** Deterministic weekly plan: spread study days evenly, alternate lesson types, quiz last. */
export function buildWeekPlan(profile: Profile, week: string, theme: string, newId: () => string): WeekPlan {
  const n = profile.daysPerWeek;
  const m = profile.minutesPerDay;
  const days = weekDates(week);
  const tasks: PlanTask[] = [];

  for (let k = 0; k < n; k++) {
    const date = days[Math.floor((k * 7) / n)]!;
    const main: TaskType = k === n - 1 && n >= 2 ? 'quiz' : k % 2 === 0 ? 'tiny_lesson' : 'slang_hang';
    let mainMinutes = m;
    if (k > 0) {
      const reviewMinutes = Math.max(5, Math.round(m * 0.3));
      mainMinutes = Math.max(5, m - reviewMinutes);
      tasks.push({ id: newId(), date, type: 'review', minutes: reviewMinutes, status: 'todo' });
    }
    tasks.push({ id: newId(), date, type: main, minutes: mainMinutes, status: 'todo' });
  }

  return { week, theme, tasks };
}
