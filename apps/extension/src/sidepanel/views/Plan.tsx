import type { Snapshot } from '../../shared/messages';
import type { TranslateFn } from '../i18n';
import { taskIcon, taskTypeLabel } from './Today';

export interface PlanProps {
  snapshot: Snapshot;
  t: TranslateFn;
}

export function Plan({ snapshot, t }: PlanProps) {
  const plan = snapshot.plan;
  if (!plan) {
    return (
      <section class="card">
        <h1>{t('planHeading')}</h1>
        <p class="muted">{t('planEmpty')}</p>
      </section>
    );
  }

  const byDate = new Map<string, typeof plan.tasks>();
  for (const task of plan.tasks) {
    const list = byDate.get(task.date) ?? [];
    list.push(task);
    byDate.set(task.date, list);
  }

  return (
    <div class="form-grid" data-testid="plan-view">
      <section class="card">
        <h1>
          {t('planHeading')} ({plan.week})
        </h1>
        <p class="muted">
          {t('planTheme')}: <strong>{plan.theme}</strong>
        </p>
      </section>

      {[...byDate.entries()].map(([date, dayTasks]) => (
        <section key={date} class="card">
          <h2>{date}</h2>
          <ul class="task-list">
            {dayTasks.map((task) => (
              <li key={task.id} class={`task-item ${task.status === 'done' ? 'done' : ''}`}>
                <span>
                  <span aria-hidden="true">{taskIcon(task.type)} </span>
                  {taskTypeLabel(task.type, t)}
                </span>
                <span class="muted">
                  {t('minutesShort', String(task.minutes))} ·{' '}
                  {task.status === 'done' ? t('taskStatusDone') : t('taskStatusTodo')}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
