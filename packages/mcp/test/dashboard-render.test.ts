import { describe, expect, it } from 'vitest';
import { emptyState, isoWeek, levelFor, toLocalDate, addDays, type Lesson, type ReviewCard, type State } from '@langcoach/core';
import { renderDashboard } from '../src/dashboard/render.js';
import { escapeHtml } from '../src/dashboard/escape.js';
import { strings } from '../src/dashboard/i18n.js';

const NOW = new Date(2026, 10, 10, 9, 30); // Tue 10 Nov 2026, local
const TODAY = toLocalDate(NOW);
const BAD = /NaN|undefined|Invalid Date/;

const profile = (nativeLanguage = 'English'): NonNullable<State['profile']> => ({
  nativeLanguage, targetLanguage: 'Spanish', level: 'A2', goal: 'travel', minutesPerDay: 15, daysPerWeek: 5, createdAt: '2026-10-01T00:00:00.000Z',
});

function card(i: number, term: string, opts: { state?: number; stability?: number; reps?: number; due?: string } = {}): ReviewCard {
  return {
    id: `c${i}`, lessonId: 'l1', term, translation: `t${i}`, example: '',
    srs: {
      due: opts.due ?? new Date(NOW.getTime() + 86400000 * 3).toISOString(), stability: opts.stability ?? 0, difficulty: 5,
      elapsed_days: 0, scheduled_days: 0, learning_steps: 0, reps: opts.reps ?? 0, lapses: 0, state: opts.state ?? 0,
    },
  };
}

function lesson(i: number, situation: string, lll = true): Lesson {
  return {
    id: `l${i}`, kind: 'tiny_lesson', situation, items: [], createdAt: new Date(NOW.getTime() - i * 3600000).toISOString(),
    ...(lll ? { source: { app: 'lll' as const, targetLanguage: 'es', sourceLanguage: 'en' } } : {}),
  };
}

function typical(native = 'English'): State {
  const s = emptyState();
  s.profile = profile(native);
  // 5-day streak ending today, 300+ XP total -> level 4
  s.log = Array.from({ length: 5 }, (_, i) => ({ at: '', date: addDays(TODAY, -i), taskId: `x${i}`, type: 'tiny_lesson' as const, xp: 70 }));
  s.log.push({ at: '', date: TODAY, taskId: 't1', type: 'review', xp: 12 });
  s.streakFreezes = 1;
  const week = isoWeek(NOW);
  s.plans[week] = {
    week, theme: 'Café',
    tasks: [
      { id: 't1', date: TODAY, type: 'review', minutes: 5, status: 'done', completedAt: NOW.toISOString() },
      { id: 't2', date: TODAY, type: 'tiny_lesson', minutes: 10, status: 'todo' },
      { id: 't3', date: addDays(TODAY, 1), type: 'quiz', minutes: 10, status: 'todo' },
    ],
  };
  s.cards = [
    card(1, 'la cuenta', { state: 2, stability: 40, reps: 4 }),
    card(2, 'un café', { state: 2, stability: 12, reps: 3 }),
    card(3, 'el azúcar'),
    card(4, 'propina', { state: 1, reps: 1, due: new Date(NOW.getTime() - 1000).toISOString() }),
  ];
  s.lessons = [lesson(1, 'Ordering at a café'), lesson(2, 'Not from LLL', false)];
  return s;
}

describe('escapeHtml', () => {
  it('escapes the five characters', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
  });
});

describe('renderDashboard', () => {
  it('renders empty state', () => {
    for (const st of [emptyState(), { ...emptyState(), profile: profile() }]) {
      const html = renderDashboard(st, NOW);
      expect(html.startsWith('<!doctype html>')).toBe(true);
      expect(html).toContain(strings('en').emptyTitle);
      expect(html).not.toMatch(BAD);
    }
  });

  it('typical learner', () => {
    const st = typical();
    const html = renderDashboard(st, NOW);
    const s = strings('en');
    expect(html).not.toMatch(BAD);
    expect(html).toMatch(/class="big">(?:<span[^>]*>[^<]*<\/span>)? 5</);
    expect(html).toContain(s.task_review);
    expect(html).toContain(s.task_tiny_lesson);
    expect(html).toContain('la cuenta');
    expect(html).toContain(s[levelFor(362).key as keyof typeof s]);
    expect(html).toContain(s.streakFreezes.replace('{n}', '1'));
    expect(html).toContain('Ordering at a café');
    expect(html).not.toContain('Not from LLL');
    expect(html).not.toContain(strings('en').emptyTitle);
  });

  it('exposes state to screen readers and hides decorative glyphs', () => {
    const html = renderDashboard(typical(), NOW);
    const s = strings('en');
    expect(html).toContain(`<span class="st" aria-hidden="true">`);
    expect(html).toContain(`<span class="sr">${s.taskNotDone}: </span>`);
    expect(html).toMatch(/<b aria-hidden="true">[●○·]+<\/b><span class="sr">\d+\/\d+<\/span>/);
    expect(html).toMatch(/<span aria-hidden="true">🔥<\/span>/);
    expect(html).not.toMatch(/<(span|b)[^>]*class="st"[^>]*aria-label/);
    expect(html).toMatch(/class="spark" role="img" aria-label="[^"]+"/);
    expect(html).toContain(s.daysDone.replace('{done}', '0').replace('{total}', '2'));
  });

  it('hides streak freezes when the field is absent', () => {
    const st = typical();
    delete st.streakFreezes;
    expect(renderDashboard(st, NOW)).not.toContain(strings('en').streakFreezes.split('{n}')[0]!);
  });

  it('escapes untrusted text', () => {
    const st = typical();
    const evil = '<img src=x onerror=alert(1)>';
    st.lessons.push(lesson(9, evil));
    st.cards.push(card(9, `"><script>alert(1)</script>${evil}`));
    st.profile!.nativeLanguage = `"><script>x</script>`;
    const html = renderDashboard(st, NOW);
    expect(html).toContain('&lt;img');
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('<script>alert');
    expect(html).not.toContain('"><script>');
  });

  it('no external URLs', () => {
    const html = renderDashboard(typical(), NOW);
    expect(html).not.toMatch(/(src|href)=["']?https?:|url\(\s*["']?https?:|@import/i);
  });

  it('caps long lists', () => {
    const st = typical();
    st.cards = Array.from({ length: 600 }, (_, i) => card(i, `word${i}`, { state: 2, stability: i % 50, reps: 2 }));
    st.lessons = Array.from({ length: 80 }, (_, i) => lesson(i, `situation ${i}`));
    const html = renderDashboard(st, NOW);
    expect(html.length).toBeLessThan(300_000);
    expect(html).toMatch(/\+\d+ more/);
    expect(html).not.toContain('situation 79');
  });

  it('locale', () => {
    const tr = renderDashboard(typical('Turkish'), NOW);
    expect(tr).toContain('lang="tr"');
    expect(tr).toContain(strings('tr').today);
    expect(tr).toContain('Kasım');
    const ja = renderDashboard(typical('Japanese'), NOW);
    expect(ja).toContain('lang="en"');
    expect(ja).toContain(strings('en').recentWords);
    expect(ja).toContain('11月10日');
  });

  it('practice badges locked without sessions', () => {
    const html = renderDashboard(typical(), NOW);
    expect(html).toContain(strings('en').earnInExtension);
    const st = typical();
    st.sessions = [{ id: 's', at: '', date: TODAY, exercises: 5, correct: 5, xp: 15, perfect: true, matchGames: 1 }];
    expect(renderDashboard(st, NOW)).not.toContain(strings('en').earnInExtension);
  });

  it('has reduced-motion and focus styles', () => {
    const html = renderDashboard(typical(), NOW);
    expect(html).toContain('prefers-reduced-motion: reduce');
    expect(html).toContain(':focus-visible');
  });
});
