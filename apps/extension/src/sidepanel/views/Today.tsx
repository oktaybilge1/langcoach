import type { PlanTask, TaskType } from '@langcoach/core/browser';
import { useState } from 'preact/hooks';
import { deeplink, toSiteLang } from '../../lib/deeplink';
import { suggestThemes, type Goal, type UiLocale } from '../../lib/themes';
import type { Snapshot } from '../../shared/messages';
import type { PanelSend } from '../App';
import type { TranslateFn } from '../i18n';

export interface TodayProps {
  snapshot: Snapshot;
  uiLocale: UiLocale;
  t: TranslateFn;
  send: PanelSend;
  onRefresh: () => Promise<void>;
  onOpenReview: () => void;
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

export function openExperimentUrl(url: string): void {
  if (typeof chrome !== 'undefined' && chrome.tabs?.query && chrome.tabs?.update) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs[0];
      if (activeTab?.id && activeTab.url && activeTab.url.includes('labs.google/lll')) {
        void chrome.tabs.update(activeTab.id, { url });
        return;
      }
      if (typeof chrome.tabs?.create === 'function') {
        void chrome.tabs.create({ url });
      }
    });
  } else if (typeof chrome !== 'undefined' && chrome.tabs?.create) {
    void chrome.tabs.create({ url });
  } else if (typeof window !== 'undefined') {
    window.open(url, '_blank', 'noopener');
  }
}

export function Today({ snapshot, uiLocale, t, send, onRefresh, onOpenReview }: TodayProps) {
  const [seed, setSeed] = useState(0);
  const [copied, setCopied] = useState(false);
  const [filled, setFilled] = useState(false);

  const profile = snapshot.profile!;
  const tasks = snapshot.today?.tasks ?? [];
  const doneCount = tasks.filter((x) => x.status === 'done').length;
  const totalCount = tasks.length;

  const themes = suggestThemes((profile.goal as Goal) || 'travel', profile.level, uiLocale, seed);
  const currentTheme = themes[0] ?? '';

  function handleTaskAction(task: PlanTask) {
    if (task.type === 'review' || task.type === 'quiz') {
      onOpenReview();
      return;
    }
    const url = deeplink(toSiteLang(uiLocale), task.type);
    openExperimentUrl(url);
  }

  async function handleFillTheme() {
    if (typeof chrome !== 'undefined' && chrome.tabs?.query && chrome.tabs?.sendMessage) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const activeTab = tabs[0];
        if (activeTab?.id) {
          chrome.tabs.sendMessage(activeTab.id, { type: 'fillTheme', theme: currentTheme }).catch(() => {});
          setFilled(true);
          setTimeout(() => setFilled(false), 1800);
        }
      });
    }
  }

  async function handleCopyTheme() {
    try {
      await navigator.clipboard?.writeText(currentTheme);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* ignore clipboard error */
    }
  }

  async function handleUndo() {
    if (!snapshot.lastCapture) return;
    await send({ type: 'undo', lessonIds: snapshot.lastCapture.lessonIds });
    await onRefresh();
  }

  const recentGrammar = (snapshot.state?.lessons ?? [])
    .filter((l) => l.grammar && l.grammar.length > 0)
    .slice(-1)[0];

  return (
    <div class="form-grid">
      <section class="card today-summary" aria-label={t('todayHeading')}>
        <div>
          <h1>{t('todayHeading')}</h1>
          <p class="muted">{snapshot.today?.date ?? ''}</p>
          <p style={{ margin: '6px 0 0', fontWeight: 600 }}>
            🔥 <span data-testid="today-streak">{snapshot.progress.streak}</span> {t('todayStreak')}
          </p>
        </div>
        <div class="ring-badge" aria-label={t('todayRingLabel')} data-testid="today-ring">
          {doneCount}/{totalCount}
        </div>
      </section>

      <section class="card">
        {tasks.length === 0 ? (
          <p class="muted">{t('todayNoTasks')}</p>
        ) : (
          <ul class="task-list">
            {tasks.map((task) => (
              <li
                key={task.id}
                class={`task-item ${task.status === 'done' ? 'done' : ''}`}
                data-testid="today-task"
              >
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

      <section class="card theme-chip">
        <h2>{t('todayThemeLabel')}</h2>
        <p style={{ margin: 0, fontWeight: 600 }} data-testid="today-theme">
          “{currentTheme}”
        </p>
        <div class="theme-actions">
          <button type="button" class="primary" onClick={handleFillTheme}>
            {filled ? `✓ ${t('btnFilled')}` : t('btnFillTheme')}
          </button>
          <button type="button" onClick={handleCopyTheme}>
            {copied ? t('btnCopied') : t('btnCopy')}
          </button>
          <button type="button" onClick={() => setSeed((s) => s + 1)}>
            {t('btnNextTheme')}
          </button>
          <button
            type="button"
            onClick={() => openExperimentUrl(deeplink(toSiteLang(uiLocale), 'tiny_lesson'))}
          >
            {t('btnOpenLll')}
          </button>
        </div>
      </section>

      {snapshot.lastCapture && (
        <section class="card" data-testid="today-last-capture">
          <h2>{t('lastCaptureHeading')}</h2>
          <div class="today-summary">
            <span>{t('toastSaved', String(snapshot.lastCapture.newCards))}</span>
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
