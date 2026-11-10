import { weekDates } from './dates.js';
import type { PlanTask, Profile, TaskType, WeekPlan } from './types.js';

/**
 * Deterministic weekly plan: spread study days evenly, alternate lesson types, quiz last.
 * When `fromDate` (YYYY-MM-DD) falls inside `week`, study days are spread over fromDate..Sunday
 * only, so a plan created mid-week never schedules days in the past.
 */
export function buildWeekPlan(
  profile: Profile,
  week: string,
  theme: string,
  newId: () => string,
  fromDate?: string,
): WeekPlan {
  const m = profile.minutesPerDay;
  const allDays = weekDates(week);
  const start = fromDate === undefined ? 0 : Math.max(0, allDays.indexOf(fromDate));
  const days = allDays.slice(start);
  const r = days.length;
  const n = Math.min(profile.daysPerWeek, r);
  const tasks: PlanTask[] = [];

  for (let k = 0; k < n; k++) {
    const date = days[Math.floor((k * r) / n)]!;
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
