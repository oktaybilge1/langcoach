import type { TranslateFn } from '../i18n';

const weekday = (date: string, locale: string): string => {
  try {
    const [y, m, d] = date.split('-').map(Number) as [number, number, number];
    return new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(new Date(y, m - 1, d));
  } catch {
    return date.slice(5);
  }
};

/** Seven daily XP bars (oldest → today) with the daily goal as a dashed line. */
export function WeekChart({
  days,
  goal,
  locale,
  t,
}: {
  days: { date: string; xp: number }[];
  goal: number;
  locale: string;
  t: TranslateFn;
}) {
  const total = days.reduce((s, d) => s + d.xp, 0);
  const max = Math.max(goal, ...days.map((d) => d.xp), 1);
  const goalPct = (goal / max) * 100;
  const last = days.length - 1;
  return (
    <figure class="week-chart-wrap">
      <div class="week-chart" role="img" data-testid="week-chart" aria-label={t('weekChartLabel', [String(total), String(goal)])}>
        <div class="week-goal-line" data-testid="week-goal-line" style={{ bottom: `${goalPct}%` }} aria-hidden="true" />
        {days.map((d, i) => {
          const h = d.xp > 0 ? Math.max(4, (d.xp / max) * 100) : 0;
          return (
            <div
              key={d.date}
              class={`week-col${i === last ? ' today' : ''}${d.xp >= goal ? ' met' : ''}`}
              data-testid="week-bar"
              data-xp={String(d.xp)}
              aria-hidden="true"
            >
              <span class="week-xp">{d.xp > 0 ? d.xp : ''}</span>
              <span class="week-bar" style={{ height: `${h}%` }} />
              <span class="week-day">{weekday(d.date, locale)}</span>
            </div>
          );
        })}
      </div>
      <table class="sr-only" data-testid="week-table">
        <caption>{t('weekChartHeading')}</caption>
        <tbody>
          {days.map((d) => (
            <tr key={d.date}>
              <th scope="row">{weekday(d.date, locale)}</th>
              <td>{`${d.xp} XP`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
