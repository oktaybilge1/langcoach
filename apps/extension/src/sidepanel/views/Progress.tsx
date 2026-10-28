import { addDays, emptyState } from '@langcoach/core/browser';
import { achievements, type AchievementId } from '../../lib/achievements';
import { levelFor } from '../../lib/levels';
import type { UiLocale } from '../../lib/themes';
import type { Snapshot } from '../../shared/messages';
import { WeekChart } from '../components/WeekChart';
import type { TranslateFn } from '../i18n';

export interface ProgressProps {
  snapshot: Snapshot;
  t: TranslateFn;
  uiLocale?: UiLocale;
}

const ACH_ICON: Record<AchievementId, string> = {
  first_lesson: '📘',
  streak_3: '🔥',
  streak_7: '🔥',
  streak_30: '🌋',
  cards_50: '🗂️',
  cards_100: '📚',
  cards_500: '🏛️',
  reviews_100: '🔁',
  perfect_session: '🏆',
  xp_100_day: '⚡',
  sessions_10: '🎯',
  first_match: '🧩',
};

function achievementTitle(id: AchievementId, t: TranslateFn): string {
  return t(`ach_${id}`);
}

export function Progress({ snapshot, t, uiLocale = 'en' }: ProgressProps) {
  const st = snapshot.state ?? emptyState();
  const todayDate = snapshot.today?.date ?? new Date().toISOString().slice(0, 10);
  const wordsLearned = st.cards.filter((c) => c.srs.reps >= 1).length;
  const level = levelFor(snapshot.progress.totalXp);
  const levelPct = Math.round(level.progress * 100);
  const weekly = snapshot.progress.weekly;
  const weeklyPct = weekly.planned > 0 ? Math.min(100, Math.round((weekly.done / weekly.planned) * 100)) : 0;
  const goal = snapshot.progress.dailyGoalXp ?? 20;
  const weekXp =
    snapshot.progress.weekXp ?? Array.from({ length: 7 }, (_, i) => ({ date: addDays(todayDate, i - 6), xp: 0 }));
  const achList = achievements(st, todayDate);
  const unlocked = achList.filter((a) => a.unlocked).length;
  const locale = uiLocale === 'pt_BR' ? 'pt-BR' : uiLocale;

  return (
    <div class="form-grid" data-testid="progress-view">
      <h1>{t('progressHeading')}</h1>

      <section class="card level-card" aria-labelledby="level-heading">
        <div class="level-badge" aria-hidden="true">
          <span data-testid="level-number">{level.level}</span>
        </div>
        <div class="level-body">
          <p class="muted level-kicker" id="level-heading">
            {t('statLevel')} {level.level}
          </p>
          <h2 class="level-name" data-testid="level-name">
            {t(level.key)}
          </h2>
          <div
            class="progress-bar level-bar"
            role="progressbar"
            data-testid="level-progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={levelPct}
            aria-label={t('levelProgressLabel', String(levelPct))}
          >
            <div class="progress-fill" style={{ width: `${levelPct}%` }} />
          </div>
          <p class="muted" data-testid="level-next">
            {level.nextMinXp === null
              ? t('levelMax')
              : t('levelToNext', [String(level.toNext), t(`level${level.level + 1}`)])}
          </p>
        </div>
      </section>

      <div class="stats-grid">
        <div class="stat-box">
          <div class="muted">{t('statStreak')}</div>
          <div class="stat-value">🔥 {snapshot.progress.streak}</div>
        </div>
        <div class="stat-box">
          <div class="muted">{t('statTotalXp')}</div>
          <div class="stat-value" data-testid="progress-xp">
            ⭐ {snapshot.progress.totalXp}
          </div>
        </div>
        <div class="stat-box">
          <div class="muted">{t('statFreezes')}</div>
          <div class="stat-value" data-testid="progress-freezes">
            ❄️ {snapshot.progress.streakFreezes ?? 0}
          </div>
        </div>
        <div class="stat-box">
          <div class="muted">{t('statWordsLearned')}</div>
          <div class="stat-value" data-testid="progress-words">
            {wordsLearned}
          </div>
        </div>
        <div class="stat-box">
          <div class="muted">{t('statDueCount')}</div>
          <div class="stat-value">{snapshot.dueCount}</div>
        </div>
        <div class="stat-box">
          <div class="muted">{t('statWeeklyGoal')}</div>
          <div class="stat-value">
            {weekly.done}/{weekly.planned}
          </div>
          <div class="progress-bar" aria-hidden="true">
            <div class="progress-fill" style={{ width: `${weeklyPct}%` }} />
          </div>
        </div>
      </div>

      <section class="card" aria-labelledby="week-heading">
        <h2 id="week-heading">{t('weekChartHeading')}</h2>
        <WeekChart days={weekXp} goal={goal} locale={locale} t={t} />
      </section>

      <section class="card" aria-labelledby="ach-heading">
        <div class="section-head">
          <h2 id="ach-heading">{t('achievementsHeading')}</h2>
          <span class="pill">
            {unlocked}/{achList.length}
          </span>
        </div>
        <ul class="ach-grid">
          {achList.map((a) => {
            const title = achievementTitle(a.id, t);
            return (
              <li
                key={a.id}
                class={`ach-item ${a.unlocked ? 'unlocked' : ''}`}
                data-testid={`ach-${a.id}`}
                aria-label={`${title}: ${a.unlocked ? t('achUnlocked') : t('achLocked')} (${a.progress}/${a.goal})`}
              >
                <span class="ach-icon" aria-hidden="true">
                  {a.unlocked ? ACH_ICON[a.id] : '🔒'}
                </span>
                <div>
                  <div class="ach-title">{title}</div>
                  <div class="progress-bar ach-bar" aria-hidden="true">
                    <div class="progress-fill" style={{ width: `${Math.round((a.progress / a.goal) * 100)}%` }} />
                  </div>
                  <div class="muted">
                    {a.progress} / {a.goal}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
