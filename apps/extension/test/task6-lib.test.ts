import { Coach, MemoryStore, emptyState, newSrs, reviewSrs, type ReviewCard, type State } from '@langcoach/core/browser';
import { describe, expect, it } from 'vitest';
import { createRouter } from '../src/background/router';
import { isAllowed } from '../src/background/policy';
import { achievements } from '../src/lib/achievements';
import { LEVELS, levelFor } from '../src/lib/levels';
import { isWeak, strengthOf } from '../src/lib/strength';
import type { Message } from '../src/shared/messages';
import { createTranslator } from '../src/sidepanel/i18n';
import { fakeArea } from './chrome-fake';

const T0 = new Date('2026-10-01T10:00:00Z');
const card = (srs = newSrs(T0), extra: Partial<ReviewCard> = {}): ReviewCard => ({
  id: 'c',
  lessonId: 'l',
  term: 'hola',
  translation: 'hello',
  example: '',
  srs,
  ...extra,
});

describe('strength meter 0-5 from FSRS (D11)', () => {
  it('new = 0, learning/relearning = 1', () => {
    expect(strengthOf(card())).toBe(0);
    const learning = reviewSrs(newSrs(T0), 1, T0); // Again on a new card → learning
    expect(learning.state).toBe(1);
    expect(strengthOf(card(learning))).toBe(1);
    expect(strengthOf(card({ ...learning, state: 3 }))).toBe(1);
  });

  it('review cards grow with stability (days): <3 → 2, <10 → 3, <30 → 4, else 5', () => {
    const review = (stability: number) => card({ ...newSrs(T0), state: 2, reps: 3, stability });
    expect(strengthOf(review(1))).toBe(2);
    expect(strengthOf(review(5))).toBe(3);
    expect(strengthOf(review(20))).toBe(4);
    expect(strengthOf(review(120))).toBe(5);
  });

  it('is always an integer 0..5, even for odd data', () => {
    for (const s of [NaN, -5, Infinity]) {
      const v = strengthOf(card({ ...newSrs(T0), state: 2, reps: 1, stability: s }));
      expect(Number.isInteger(v) && v >= 0 && v <= 5).toBe(true);
    }
  });

  it('weak = practised but strength ≤ 2', () => {
    expect(isWeak(card())).toBe(false);
    expect(isWeak(card(reviewSrs(newSrs(T0), 1, T0)))).toBe(true);
    expect(isWeak(card({ ...newSrs(T0), state: 2, reps: 4, stability: 40 }))).toBe(false);
  });
});

describe('levels (D13)', () => {
  it('thresholds start at 0 and rise strictly; every level has a name in all 5 locales', () => {
    expect(LEVELS[0]!.minXp).toBe(0);
    for (let i = 1; i < LEVELS.length; i++) expect(LEVELS[i]!.minXp).toBeGreaterThan(LEVELS[i - 1]!.minXp);
    for (const loc of ['en', 'tr', 'es', 'fr', 'pt_BR']) {
      const { t } = createTranslator(loc);
      for (const l of LEVELS) expect(t(l.key)).not.toBe(l.key);
    }
  });

  it('levelFor gives the level, progress to the next and the XP still needed', () => {
    expect(levelFor(0)).toMatchObject({ level: 1, progress: 0, nextMinXp: LEVELS[1]!.minXp });
    const mid = Math.round((LEVELS[1]!.minXp + LEVELS[2]!.minXp) / 2);
    const m = levelFor(mid);
    expect(m.level).toBe(2);
    expect(m.progress).toBeGreaterThan(0.4);
    expect(m.progress).toBeLessThan(0.6);
    expect(m.toNext).toBe(LEVELS[2]!.minXp - mid);
    expect(levelFor(LEVELS[2]!.minXp).level).toBe(3);
    const top = levelFor(1_000_000);
    expect(top).toMatchObject({ level: LEVELS.length, progress: 1, nextMinXp: null, toNext: 0 });
    expect(levelFor(-5).level).toBe(1);
  });
});

describe('achievements v2 (D13)', () => {
  const TODAY = '2026-10-22';
  const base = (): State => emptyState();
  const byId = (s: State) => Object.fromEntries(achievements(s, TODAY).map((a) => [a.id, a]));

  it('adds perfect_session, xp_100_day, sessions_10, first_match', () => {
    const ids = achievements(base(), TODAY).map((a) => a.id);
    for (const id of ['perfect_session', 'xp_100_day', 'sessions_10', 'first_match']) expect(ids).toContain(id);
    expect(achievements(base(), TODAY).every((a) => !a.unlocked)).toBe(true);
  });

  it('perfect_session from a stored perfect session (or the legacy XP shape)', () => {
    const s = base();
    s.sessions = [{ id: 'a', at: 'x', date: TODAY, exercises: 4, correct: 4, xp: 9, perfect: false }];
    expect(byId(s).perfect_session!.unlocked).toBe(false);
    s.sessions.push({ id: 'b', at: 'x', date: TODAY, exercises: 2, correct: 2, xp: 12 }); // legacy: 2 + 5 + 5
    expect(byId(s).perfect_session!.unlocked).toBe(true);
  });

  it('xp_100_day uses the best single day', () => {
    const s = base();
    s.log.push({ at: 'x', date: '2026-10-20', taskId: 'a', type: 'quiz', xp: 60 });
    s.log.push({ at: 'x', date: '2026-10-21', taskId: 'b', type: 'quiz', xp: 60 });
    expect(byId(s).xp_100_day).toMatchObject({ unlocked: false, progress: 60, goal: 100 });
    s.log.push({ at: 'x', date: '2026-10-21', taskId: 'c', type: 'quiz', xp: 45 });
    expect(byId(s).xp_100_day).toMatchObject({ unlocked: true, progress: 100 });
  });

  it('sessions_10 counts recorded practice sessions; first_match needs a match game', () => {
    const s = base();
    for (let i = 0; i < 10; i++) s.log.push({ at: 'x', date: TODAY, taskId: `practice:${i}`, type: 'review', xp: 6 });
    expect(byId(s).sessions_10!.unlocked).toBe(true);
    expect(byId(s).first_match!.unlocked).toBe(false);
    s.sessions = [{ id: 'm', at: 'x', date: TODAY, exercises: 5, correct: 5, xp: 15, matchGames: 1 }];
    expect(byId(s).first_match!.unlocked).toBe(true);
  });

  it('streak achievements count freeze-protected days like the panel streak', () => {
    const s = base();
    for (const date of ['2026-10-20', '2026-10-22']) s.log.push({ at: 'x', date, taskId: 't', type: 'quiz', xp: 30 });
    s.freezeUsedDates = ['2026-10-21'];
    expect(byId(s).streak_3!.unlocked).toBe(true);
  });
});

describe('router: setFavorite and markMastered (D15)', () => {
  async function setup() {
    const store = new MemoryStore();
    let n = 0;
    const coach = new Coach(store, () => T0, () => `id${++n}`);
    await coach.saveLesson({ kind: 'tiny_lesson', situation: 'cafe', items: [{ term: 'hola', translation: 'hello', example: '' }] });
    const router = createRouter({ coach, store, area: fakeArea(), clock: () => T0, log: () => {} });
    const id = (await store.load()).cards[0]!.id;
    return { store, router, id };
  }

  it('setFavorite toggles the star', async () => {
    const { store, router, id } = await setup();
    expect(await router.handle({ type: 'setFavorite', cardId: id, favorite: true })).toMatchObject({ ok: true });
    expect((await store.load()).cards[0]!.favorite).toBe(true);
  });

  it('markMastered awards 2 XP once', async () => {
    const { store, router, id } = await setup();
    expect(await router.handle({ type: 'markMastered', cardId: id })).toEqual({ ok: true, data: { xpAwarded: 2 } });
    expect(await router.handle({ type: 'markMastered', cardId: id })).toEqual({ ok: true, data: { xpAwarded: 0 } });
    expect((await store.load()).log).toHaveLength(1);
  });

  it.each([
    [{ type: 'setFavorite', cardId: '', favorite: true }],
    [{ type: 'setFavorite', cardId: 'x', favorite: 'yes' }],
    [{ type: 'markMastered', cardId: 5 }],
    [{ type: 'recordPractice', sessionId: 's', results: [{ cardId: 'a', outcome: 'correct' }], matchGames: 1.5 }],
  ])('validates %o', async (m) => {
    const { router } = await setup();
    expect(await router.handle(m as unknown as Message)).toMatchObject({ ok: false, error: { code: 'invalid' } });
  });

  it('both are extension-page-only', () => {
    const ext = 'chrome-extension://abc/';
    for (const type of ['setFavorite', 'markMastered']) {
      expect(isAllowed(type, { id: 'abc', url: `${ext}sidepanel.html` }, 'abc', ext, false)).toBe(true);
      expect(isAllowed(type, { id: 'abc', url: 'https://labs.google/lll/en', tab: {} }, 'abc', ext, false)).toBe(false);
    }
  });
});
