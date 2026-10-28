import type { TranslateFn } from '../i18n';

/** Streak flame (flickers unless reduced motion; unlit at 0) plus the streak freezes held. */
export function StreakFlame({
  streak,
  freezes,
  reduced,
  t,
}: {
  streak: number;
  freezes: number;
  reduced: boolean;
  t: TranslateFn;
}) {
  const lit = streak > 0;
  return (
    <div class="streak-box">
      <span
        class={`streak-flame${lit ? '' : ' off'}${lit && !reduced ? ' animated' : ''}`}
        data-testid="streak-flame"
        aria-hidden="true"
      >
        🔥
      </span>
      <div class="streak-text">
        <strong class="streak-count">
          <span data-testid="today-streak">{streak}</span>
        </strong>
        <span class="muted">{t('todayStreak')}</span>
      </div>
      <span class="freeze-pill" data-testid="streak-freezes" aria-label={t('streakFreezesLabel', String(freezes))} title={t('streakFreezesLabel', String(freezes))}>
        <span aria-hidden="true">❄️ {freezes}</span>
      </span>
    </div>
  );
}
