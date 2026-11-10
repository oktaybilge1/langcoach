// @vitest-environment jsdom
import { emptyState } from '@langcoach/core/browser';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { levelFor } from '../src/lib/levels';
import type { Snapshot } from '../src/shared/messages';
import { createTranslator } from '../src/sidepanel/i18n';
import { Progress } from '../src/sidepanel/views/Progress';

const { t } = createTranslator('en');
const profile = {
  nativeLanguage: 'Turkish',
  targetLanguage: 'Spanish (Spain)',
  level: 'A2' as const,
  goal: 'travel',
  minutesPerDay: 15,
  daysPerWeek: 5,
  createdAt: '2026-10-01T10:00:00Z',
  dailyGoalXp: 20 as const,
};
const WEEK = ['2026-10-16', '2026-10-17', '2026-10-18', '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22'];

function snap(totalXp: number): Snapshot {
  const st = emptyState();
  st.profile = profile;
  st.sessions = [{ id: 's', at: 'x', date: '2026-10-22', exercises: 3, correct: 3, xp: 13, perfect: true, matchGames: 1 }];
  return {
    profile,
    today: { date: '2026-10-22', tasks: [], planExists: true },
    plan: null,
    progress: {
      streak: 3,
      totalXp,
      weekly: { done: 1, planned: 5 },
      dueCount: 2,
      todayXp: 13,
      dailyGoalXp: 20,
      streakFreezes: 1,
      weekXp: WEEK.map((date, i) => ({ date, xp: [0, 5, 0, 30, 12, 0, 13][i]! })),
    },
    dueCount: 2,
    lastCapture: null,
    state: st,
  };
}

let host: HTMLDivElement;
beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
});
afterEach(() => {
  render(null, host);
  host.remove();
});
const $ = (sel: string) => host.querySelector<HTMLElement>(sel);
const $$ = (sel: string) => [...host.querySelectorAll<HTMLElement>(sel)];
const mount = async (s: Snapshot) => {
  await act(async () => {
    render(<Progress snapshot={s} t={t} uiLocale="en" />, host);
  });
};

describe('Progress (D13)', () => {
  it('shows the named level with progress to the next one', async () => {
    await mount(snap(200));
    const info = levelFor(200);
    expect($('[data-testid="level-name"]')!.textContent).toBe(t(info.key));
    expect($('[data-testid="level-number"]')!.textContent).toContain(String(info.level));
    const bar = $('[data-testid="level-progress"]')!;
    expect(bar.getAttribute('role')).toBe('progressbar');
    expect(bar.getAttribute('aria-valuenow')).toBe(String(Math.round(info.progress * 100)));
    expect($('[data-testid="level-next"]')!.textContent).toBe(
      t('levelToNext', [String(info.toNext), t(`level${info.level + 1}`)]),
    );
  });

  it('top level says so', async () => {
    await mount(snap(999_999));
    expect($('[data-testid="level-next"]')!.textContent).toBe(t('levelMax'));
  });

  it('week chart: 7 labelled bars, today highlighted, goal line', async () => {
    await mount(snap(50));
    const chart = $('[data-testid="week-chart"]')!;
    expect(chart.getAttribute('role')).toBe('img');
    expect(chart.getAttribute('aria-label')).toBe(t('weekChartLabel', ['60', '20']));
    const bars = $$('[data-testid="week-bar"]');
    expect(bars).toHaveLength(7);
    expect(bars.map((b) => b.getAttribute('data-xp'))).toEqual(['0', '5', '0', '30', '12', '0', '13']);
    expect(bars[6]!.classList.contains('today')).toBe(true);
    expect(bars[3]!.classList.contains('met')).toBe(true);
    expect(bars[4]!.classList.contains('met')).toBe(false);
    expect($('[data-testid="week-goal-line"]')).not.toBeNull();
    // a hidden table repeats the numbers for screen readers
    expect($$('[data-testid="week-table"] td').map((td) => td.textContent)).toContain('30 XP');
  });

  it('achievements include the new ones and mark unlocked ones', async () => {
    await mount(snap(50));
    for (const id of ['perfect_session', 'xp_100_day', 'sessions_10', 'first_match']) {
      expect($(`[data-testid="ach-${id}"]`), id).not.toBeNull();
    }
    expect($('[data-testid="ach-perfect_session"]')!.classList.contains('unlocked')).toBe(true);
    expect($('[data-testid="ach-first_match"]')!.classList.contains('unlocked')).toBe(true);
    expect($('[data-testid="ach-xp_100_day"]')!.classList.contains('unlocked')).toBe(false);
    expect($('[data-testid="ach-perfect_session"]')!.getAttribute('aria-label')).toContain(t('achUnlocked'));
  });

  it('keeps total XP, words and streak freezes stats', async () => {
    await mount(snap(50));
    expect($('[data-testid="progress-xp"]')!.textContent).toContain('50');
    expect($('[data-testid="progress-freezes"]')!.textContent).toContain('1');
  });
});
