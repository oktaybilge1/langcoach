import type { PlanTask, TaskType } from '@langcoach/core/browser';
import { useEffect, useState } from 'preact/hooks';
import { deeplink, toSiteLang } from '../../lib/deeplink';
import { LLL_LANGUAGES, resolveLanguage } from '../../lib/languages';
import { suggestThemes, type Goal, type UiLocale } from '../../lib/themes';
import type { Banner, Snapshot } from '../../shared/messages';
import type { PanelSend } from '../App';
import { prefersReducedMotion } from '../components/Confetti';
import { GoalRing } from '../components/GoalRing';
import { StreakFlame } from '../components/StreakFlame';
import type { TranslateFn } from '../i18n';
import { NativeBanner } from '../NativeBanner';
import { openExperimentUrl, runScenario, type ScenarioOutcome } from '../tabs';
import type { NativeTranslations } from '../useNativeTranslations';

/** Same window as the background's undo check (capture.ts UNDO_WINDOW_MS). */
const UNDO_WINDOW_MS = 10 * 60_000;
const SCENARIOS = 3;

export interface TodayProps {
  snapshot: Snapshot;
  uiLocale: UiLocale;
  t: TranslateFn;
  send: PanelSend;
  onRefresh: () => Promise<void>;
  onOpenReview: () => void;
  onOpenPractice?: () => void;
  native?: NativeTranslations;
  /** Tests pass it; defaults to the prefers-reduced-motion media query. */
  reducedMotion?: boolean;
}

export function taskTypeLabel(type: TaskType, t: TranslateFn): string {
  switch (type) {
    case 'tiny_lesson':
      return t('taskTinyLesson');
    case 'slang_hang':
      return t('taskSlangHang');
    case 'word_cam':
      return t('taskWordCam');
    case 'review':
      return t('taskReview');
    case 'quiz':
      return t('taskQuiz');
  }
}

export function taskIcon(type: TaskType): string {
  switch (type) {
    case 'tiny_lesson':
      return '📘';
    case 'slang_hang':
      return '💬';
    case 'word_cam':
      return '📷';
    case 'review':
      return '🗂️';
    case 'quiz':
      return '🏆';
  }
}

interface ScenarioState {
  running?: boolean;
  outcome?: ScenarioOutcome;
  copied?: boolean;
}

function hintKey(outcome: ScenarioOutcome): string {
  if (outcome.ok) return 'scenarioStarted';
  switch (outcome.reason) {
    case 'splash':
      return 'scenarioHintSplash';
    case 'language':
      return 'scenarioHintLanguage';
    case 'generate':
      return 'scenarioHintGenerate';
    default:
      return 'scenarioHintGeneric';
  }
}

function bannerText(b: Banner, t: TranslateFn): string {
  return b.kind === 'freezeUsed' ? t('bannerFreezeUsed', b.date) : t('bannerFreezeEarned');
}

const localDate = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function Today({
  snapshot,
  uiLocale,
  t,
  send,
  onRefresh,
  onOpenReview,
  onOpenPractice,
  native,
  reducedMotion,
}: TodayProps) {
  const reduced = reducedMotion ?? prefersReducedMotion();
  const [seed, setSeed] = useState(0);
  const [scenario, setScenario] = useState<Record<string, ScenarioState>>({});
  const [actionError, setActionError] = useState<string | null>(null);
  const [, setTick] = useState(0);

  const lastCapture = snapshot.lastCapture;
  const undoLeftMs = lastCapture ? Date.parse(lastCapture.at) + UNDO_WINDOW_MS - Date.now() : 0;
  const canUndo = lastCapture !== null && undoLeftMs > 0;
  // Re-render when the undo window closes so the card disappears on time.
  useEffect(() => {
    if (!canUndo) return;
    const id = setTimeout(() => setTick((n) => n + 1), Math.min(undoLeftMs + 50, 2_147_000_000));
    return () => clearTimeout(id);
  }, [lastCapture?.at, canUndo]);

  const profile = snapshot.profile!;
  const tasks = snapshot.today?.tasks ?? [];
  const todayXp = snapshot.progress.todayXp ?? 0;
  const goal = snapshot.progress.dailyGoalXp ?? 20;
  const goalMet = todayXp >= goal;
  const siteLang = toSiteLang(uiLocale);
  const tinyUrl = deeplink(siteLang, 'tiny_lesson');

  const themes = suggestThemes((profile.goal as Goal) || 'travel', profile.level, uiLocale, seed).slice(0, SCENARIOS);
  const resolved = resolveLanguage(profile.targetLanguage);
  const targetLabel = LLL_LANGUAGES.some((l) => l.label === resolved.label) ? resolved.label : undefined;

  const freshCapture =
    lastCapture !== null &&
    lastCapture.newCards > 0 &&
    snapshot.today !== null &&
    localDate(lastCapture.at) === snapshot.today.date;

  function handleTaskAction(task: PlanTask) {
    if (task.type === 'review' && onOpenPractice) {
      onOpenPractice(); // a finished practice session completes today's review task
      return;
    }
    if (task.type === 'review' || task.type === 'quiz') {
      onOpenReview();
      return;
    }
    void openExperimentUrl(deeplink(siteLang, task.type));
  }

  async function startScenario(theme: string) {
    if (scenario[theme]?.running) return;
    setScenario((s) => ({ ...s, [theme]: { running: true } }));
    const outcome = await runScenario({ theme, url: tinyUrl, ...(targetLabel ? { targetLabel } : {}) });
    setScenario((s) => ({ ...s, [theme]: { outcome } }));
  }

  async function copyTheme(theme: string) {
    try {
      await navigator.clipboard?.writeText(theme);
      setScenario((s) => ({ ...s, [theme]: { ...s[theme], copied: true } }));
    } catch {
      /* clipboard unavailable: the theme is shown on the card */
    }
  }

  async function handleUndo() {
    if (!snapshot.lastCapture) return;
    try {
      await send({ type: 'undo', lessonIds: snapshot.lastCapture.lessonIds });
      setActionError(null);
      await onRefresh();
    } catch (e) {
      setActionError(t('actionFailed', (e as Error).message));
    }
  }

  async function dismissBanner(id: string) {
    try {
      await send({ type: 'dismissBanner', id });
      await onRefresh();
    } catch (e) {
      setActionError(t('actionFailed', (e as Error).message));
    }
  }

  const recentGrammar = (snapshot.state?.lessons ?? []).filter((l) => l.grammar && l.grammar.length > 0).slice(-1)[0];

  return (
    <div class="form-grid today">
      {(snapshot.banners ?? []).map((b) => (
        <div key={b.id} class={`rollover-banner ${b.kind}`} role="status" data-testid="rollover-banner">
          <span aria-hidden="true">{b.kind === 'freezeUsed' ? '🧊' : '❄️'}</span>
          <span class="rollover-text">{bannerText(b, t)}</span>
          <button type="button" class="icon-btn" aria-label={t('bannerDismiss')} title={t('bannerDismiss')} onClick={() => void dismissBanner(b.id)}>
            ✕
          </button>
        </div>
      ))}

      <section class="card today-hero" aria-labelledby="today-heading">
        <div class="today-hero-text">
          <h1 id="today-heading">{t('todayHeading')}</h1>
          <p class="muted">{snapshot.today?.date ?? ''}</p>
          <StreakFlame streak={snapshot.progress.streak} freezes={snapshot.progress.streakFreezes ?? 0} reduced={reduced} t={t} />
        </div>
        <div class="today-goal">
          <GoalRing value={todayXp} goal={goal} size={84} label={t('pxGoalLine', [String(todayXp), String(goal)])} testId="goal-ring" />
          <span class="today-goal-text" data-testid="today-goal-text">
            {t('pxGoalLine', [String(todayXp), String(goal)])}
          </span>
          {goalMet && <span class="goal-met-pill">🎉 {t('todayGoalMet')}</span>}
        </div>
      </section>

      {onOpenPractice && (
        <button type="button" class="practice-cta" data-testid="btn-practice-now" onClick={onOpenPractice}>
          <span class="practice-cta-icon" aria-hidden="true">
            🎯
          </span>
          <span class="practice-cta-text">
            <strong>{t('pxCtaTitle')}</strong>
            <span>{snapshot.dueCount > 0 ? t('pxCtaDue', String(snapshot.dueCount)) : t('pxCtaBody')}</span>
          </span>
          <span class="practice-cta-arrow" aria-hidden="true">
            →
          </span>
        </button>
      )}

      {freshCapture && onOpenPractice && (
        <button type="button" class="practice-cta fresh" data-testid="btn-practice-these" onClick={onOpenPractice}>
          <span class="practice-cta-icon" aria-hidden="true">
            ✨
          </span>
          <span class="practice-cta-text">
            <strong>{t('practiceTheseWords', String(lastCapture!.newCards))}</strong>
            <span>{t('practiceTheseBody')}</span>
          </span>
          <span class="practice-cta-arrow" aria-hidden="true">
            →
          </span>
        </button>
      )}

      {native && <NativeBanner native={native} t={t} uiLocale={uiLocale} />}

      <section class="card scenarios" aria-labelledby="scenarios-heading">
        <div class="section-head">
          <h2 id="scenarios-heading">{t('scenariosHeading')}</h2>
          <button type="button" class="btn-subtle" data-testid="btn-more-scenarios" onClick={() => setSeed((s) => s + SCENARIOS)}>
            🔄 {t('scenariosMore')}
          </button>
        </div>
        <p class="muted">{t('scenariosBody')}</p>
        <ul class="scenario-list">
          {themes.map((theme, i) => {
            const st = scenario[theme];
            const outcome = st?.outcome ?? null;
            const failed = outcome !== null && !outcome.ok;
            return (
              <li key={theme} class={`scenario-card tone-${i}`} data-testid="scenario-card">
                <span class="scenario-theme" dir="auto">
                  {theme}
                </span>
                <div class="theme-actions">
                  <button
                    type="button"
                    class="primary"
                    data-testid="btn-scenario-start"
                    disabled={st?.running === true}
                    aria-label={t('scenarioStartLabel', theme)}
                    onClick={() => void startScenario(theme)}
                  >
                    {st?.running ? t('scenarioStarting') : `▶ ${t('scenarioStart')}`}
                  </button>
                  <button type="button" data-testid="btn-scenario-copy" aria-label={t('scenarioCopyLabel', theme)} onClick={() => void copyTheme(theme)}>
                    {st?.copied ? t('btnCopied') : t('btnCopy')}
                  </button>
                  {failed && (
                    <button type="button" data-testid="btn-scenario-open" onClick={() => void openExperimentUrl(tinyUrl)}>
                      {t('scenarioOpenTiny')}
                    </button>
                  )}
                </div>
                <p class={`scenario-status ${failed ? 'warn' : ''}`} role="status">
                  {st?.copied ? t('themeCopiedPaste') : outcome ? t(hintKey(outcome)) : ''}
                </p>
              </li>
            );
          })}
        </ul>
      </section>

      <section class="card">
        <h2>{t('todayTasksHeading')}</h2>
        {tasks.length === 0 ? (
          <p class="muted">{t('todayNoTasks')}</p>
        ) : (
          <ul class="task-list">
            {tasks.map((task) => (
              <li key={task.id} class={`task-item ${task.status === 'done' ? 'done' : ''}`} data-testid="today-task">
                <div>
                  <div style={{ fontWeight: 600 }}>
                    <span aria-hidden="true">{taskIcon(task.type)} </span>
                    {taskTypeLabel(task.type, t)}
                  </div>
                  <div class="muted">
                    {t('minutesShort', String(task.minutes))} ·{' '}
                    {task.status === 'done' ? t('taskStatusDone') : t('taskStatusTodo')}
                  </div>
                </div>
                <button type="button" onClick={() => handleTaskAction(task)}>
                  {t('btnOpenLll')}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {actionError && (
        <p class="error-text" role="alert">
          {actionError}
        </p>
      )}

      {lastCapture && canUndo && (
        <section class="card" data-testid="today-last-capture">
          <h2>{t('lastCaptureHeading')}</h2>
          <div class="today-summary">
            <span>{t('toastSaved', String(lastCapture.newCards))}</span>
            <button type="button" data-testid="today-undo" onClick={handleUndo}>
              {t('toastUndo')}
            </button>
          </div>
        </section>
      )}

      {recentGrammar?.grammar && (
        <section class="card" data-testid="today-grammar">
          <h2>{t('grammarHeading')}</h2>
          {recentGrammar.grammar.map((g, i) => (
            <div key={i} style={{ marginTop: i > 0 ? '8px' : '0' }}>
              <div style={{ fontWeight: 600 }}>{g.topic}</div>
              <p class="muted">{g.description}</p>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
