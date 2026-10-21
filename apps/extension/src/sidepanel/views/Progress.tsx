import { emptyState } from '@langcoach/core/browser';
import { achievements, type AchievementId } from '../../lib/achievements';
import type { Snapshot } from '../../shared/messages';
import type { TranslateFn } from '../i18n';

export interface ProgressProps {
  snapshot: Snapshot;
  t: TranslateFn;
}

function achievementTitle(id: AchievementId, t: TranslateFn): string {
  switch (id) {
    case 'first_lesson':
      return t('ach_first_lesson');
    case 'streak_3':
      return t('ach_streak_3');
    case 'streak_7':
      return t('ach_streak_7');
    case 'streak_30':
      return t('ach_streak_30');
    case 'cards_50':
      return t('ach_cards_50');
    case 'cards_100':
      return t('ach_cards_100');
    case 'cards_500':
      return t('ach_cards_500');
    case 'reviews_100':
      return t('ach_reviews_100');
  }
}

export function Progress({ snapshot, t }: ProgressProps) {
  const st = snapshot.state ?? emptyState();
  const todayDate = snapshot.today?.date ?? new Date().toISOString().slice(0, 10);
  const wordsLearned = st.cards.filter((c) => c.srs.reps >= 1).length;
  const level = Math.floor(snapshot.progress.totalXp / 100) + 1;
  const weekly = snapshot.progress.weekly;
  const weeklyPct = weekly.planned > 0 ? Math.min(100, Math.round((weekly.done / weekly.planned) * 100)) : 0;
  const achList = achievements(st, todayDate);

  return (
    <div class="form-grid" data-testid="progress-view">
      <h1>{t('progressHeading')}</h1>

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
          <div class="muted">{t('statLevel')}</div>
          <div class="stat-value">{level}</div>
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
          <div class="progress-bar">
            <div class="progress-fill" style={{ width: `${weeklyPct}%` }} />
          </div>
        </div>
      </div>

      <section class="card">
        <h2>{t('achievementsHeading')}</h2>
        <div class="ach-grid">
          {achList.map((a) => (
            <div key={a.id} class={`ach-item ${a.unlocked ? 'unlocked' : ''}`} data-testid={`ach-${a.id}`}>
              <div style={{ fontWeight: 600 }}>{achievementTitle(a.id, t)}</div>
              <div class="muted">
                {a.progress} / {a.goal}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
