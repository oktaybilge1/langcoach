import { PERFECT_BONUS_XP, type PracticeSummary, type ReviewCard } from '@langcoach/core/browser';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { deeplink, toSiteLang } from '../../lib/deeplink';
import { resolveLanguage, type ResolvedLanguage } from '../../lib/languages';
import { expectedVariants, type CheckResult } from '../../lib/practice/check';
import { buildSession, type Exercise } from '../../lib/practice/generate';
import { advance, applyAnswer, current, isDone, results, startRun, summary, type Answer, type Run } from '../../lib/practice/run';
import { createSounds, type Sounds } from '../../lib/sound';
import { browserSpeech, warmVoices, type Speech } from '../../lib/speech';
import type { UiLocale } from '../../lib/themes';
import type { Snapshot } from '../../shared/messages';
import type { PanelSend } from '../App';
import { Confetti, prefersReducedMotion } from '../components/Confetti';
import { GoalRing } from '../components/GoalRing';
import { Choice } from '../components/exercises/Choice';
import { isTypingTarget } from '../components/exercises/keys';
import { Match } from '../components/exercises/Match';
import { TypeAnswer } from '../components/exercises/TypeAnswer';
import type { TranslateFn } from '../i18n';
import { openExperimentUrl } from '../tabs';
import type { NativeTranslations } from '../useNativeTranslations';

/** Injectable side effects (tests pass fakes). */
export interface PracticeDeps {
  sounds?: Sounds;
  speech?: Speech;
  seed?: () => number;
  uuid?: () => string;
  now?: () => Date;
  reducedMotion?: () => boolean;
  /** Pause before the one automatic retry of a failed save (default 400 ms). */
  retryDelayMs?: number;
}

export interface PracticeProps {
  snapshot: Snapshot;
  uiLocale: UiLocale;
  t: TranslateFn;
  send: PanelSend;
  onRefresh: () => Promise<void>;
  /** "Done" on the end screen. */
  onDone: () => void;
  soundEffects: boolean;
  /** The Practice tab is visible (keyboard shortcuts only then). */
  active: boolean;
  native?: NativeTranslations;
  deps?: PracticeDeps;
}

const SESSION_SIZE = 10;
const MIN_CARDS = 4;
const E2E = typeof __E2E__ !== 'undefined' && __E2E__;

type Phase = 'start' | 'loading' | 'empty' | 'run' | 'end';
type FeedbackState = 'correct' | 'almost' | 'wrong';
interface Feedback {
  state: FeedbackState;
  given?: string;
}
interface Session {
  id: string;
  cards: Map<string, ReviewCard>;
  lang: ResolvedLanguage;
  canSpeak: boolean;
  nativeFirst: boolean;
}
type Save = { status: 'saving' } | { status: 'saved'; data: PracticeSummary } | { status: 'error'; message: string };

function randomSeed(): number {
  try {
    return crypto.getRandomValues(new Uint32Array(1))[0]!;
  } catch {
    return Math.floor(Math.random() * 2 ** 32);
  }
}
function randomId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `px-${Date.now().toString(36)}-${randomSeed().toString(36)}`;
  }
}

const usable = (c: ReviewCard) => !!c.term?.trim() && !!c.translation?.trim();

/** E2E builds only: the known answer of the exercise on screen, so the browser test can play a session. */
function e2eAnswer(ex: Exercise): string {
  if (ex.kind === 'match') {
    const pairs = ex.answer as [string, string][];
    const terms = ex.prompt.terms ?? [];
    const meanings = ex.prompt.meanings ?? [];
    return JSON.stringify(pairs.map(([a, b]) => [terms.indexOf(a), meanings.indexOf(b)]));
  }
  if (ex.kind === 'type') return expectedVariants(ex.answer as string)[0] ?? '';
  return String((ex.options ?? []).indexOf(ex.answer as string));
}

export function Practice({ snapshot, uiLocale, t, send, onRefresh, onDone, soundEffects, active, native, deps = {} }: PracticeProps) {
  const speech = deps.speech ?? browserSpeech;
  const reduced = (deps.reducedMotion ?? prefersReducedMotion)();
  const soundOn = useRef(soundEffects);
  soundOn.current = soundEffects;
  const sounds = useMemo<Sounds>(() => deps.sounds ?? createSounds({ enabled: () => soundOn.current }), [deps.sounds]);

  const [phase, setPhaseState] = useState<Phase>('start');
  const phaseRef = useRef<Phase>('start');
  const setPhase = (p: Phase) => {
    phaseRef.current = p;
    setPhaseState(p);
  };
  const [session, setSessionState] = useState<Session | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const setSession = (v: Session | null) => {
    sessionRef.current = v;
    setSessionState(v);
  };
  const [run, setRunState] = useState<Run | null>(null);
  const [feedback, setFeedbackState] = useState<Feedback | null>(null);
  const [save, setSave] = useState<Save | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  /** The end-screen action the learner pressed once while the session was unsaved (pressing it again leaves). */
  const [leaveWarn, setLeaveWarn] = useState<'done' | 'again' | null>(null);

  const runRef = useRef<Run | null>(null);
  const feedbackRef = useRef<Feedback | null>(null);
  /** Session id already sent to recordPractice (never sent twice automatically). */
  const recordedRef = useRef<string | null>(null);
  const startingRef = useRef(false);
  const mounted = useRef(true);
  const continueBtn = useRef<HTMLButtonElement>(null);
  const endHeading = useRef<HTMLHeadingElement>(null);
  const exerciseCard = useRef<HTMLElement>(null);
  useEffect(() => {
    mounted.current = true;
    warmVoices();
    return () => {
      mounted.current = false;
    };
  }, []);
  // Release the Web Audio context when the panel view goes away.
  useEffect(() => () => sounds.close(), [sounds]);

  const setRun = (r: Run | null) => {
    runRef.current = r;
    setRunState(r);
  };
  const setFeedback = (f: Feedback | null) => {
    feedbackRef.current = f;
    setFeedbackState(f);
  };

  const deckCards = (snapshot.state?.cards ?? []).filter(usable);
  const enoughWords = deckCards.length >= MIN_CARDS;

  const startRef = useRef(async () => {});
  startRef.current = () => start();

  async function start() {
    if (startingRef.current) return;
    startingRef.current = true;
    setStartError(null);
    setLeaveWarn(null);
    setPhase('loading');
    try {
      const fetched = await send({ type: 'getPracticeCards' });
      if (!mounted.current) return;
      const cards = fetched.map((c) => {
        const n = c.nativeTranslation?.trim() || native?.nativeOf(c.id);
        return n && n !== c.nativeTranslation ? { ...c, nativeTranslation: n } : c;
      });
      const withMeaning = cards.filter(usable);
      // Native meanings only when every card has one: never mix languages among the options.
      const nativeFirst = withMeaning.length > 0 && withMeaning.every((c) => !!c.nativeTranslation?.trim());
      const lang = resolveLanguage(snapshot.profile?.targetLanguage ?? '');
      const canSpeak = speech.canSpeak(lang.bcp47);
      const built = buildSession(cards, {
        now: (deps.now ?? (() => new Date()))(),
        seed: (deps.seed ?? randomSeed)(),
        size: SESSION_SIZE,
        canSpeak,
        nativeFirst,
        lang: lang.bcp47,
      });
      if (!Array.isArray(built)) {
        setPhase('empty');
        return;
      }
      setSession({ id: (deps.uuid ?? randomId)(), cards: new Map(cards.map((c) => [c.id, c])), lang, canSpeak, nativeFirst });
      setFeedback(null);
      setSave(null);
      setRun(startRun(built));
      setPhase('run');
    } catch (e) {
      if (!mounted.current) return;
      setStartError(t('actionFailed', (e as Error).message));
      setPhase('start');
    } finally {
      startingRef.current = false;
    }
  }

  function answered(a: Answer, state: FeedbackState, given?: string) {
    const r = runRef.current;
    if (!r || feedbackRef.current) return;
    const next = applyAnswer(r, a);
    if (next === r) return;
    setRun(next);
    setFeedback({ state, given });
    sounds.play(state === 'wrong' ? 'wrong' : 'correct');
  }

  /**
   * Save the session. recordPractice is idempotent by session id, so the first automatic save
   * retries once on its own (e.g. the service worker was restarting); a manual Retry tries once.
   */
  async function record(r: Run, s: Session, autoRetry = false) {
    setSave({ status: 'saving' });
    // Match games actually answered (re-tries of the same exercise count once).
    const matchGames = new Set(r.queue.filter(({ ex }) => ex.kind === 'match' && r.outcomes[ex.id]).map(({ ex }) => ex.id)).size;
    for (let attempt = 0; ; attempt++) {
      try {
        const data = await send({
          type: 'recordPractice',
          sessionId: s.id,
          results: results(r),
          ...(matchGames > 0 ? { matchGames } : {}),
        });
        if (!mounted.current) return;
        setSave({ status: 'saved', data });
        setLeaveWarn(null);
        void onRefresh();
        return;
      } catch (e) {
        if (!mounted.current) return;
        if (autoRetry && attempt === 0) {
          await new Promise((res) => setTimeout(res, deps.retryDelayMs ?? 400));
          if (!mounted.current) return;
          continue;
        }
        setSave({ status: 'error', message: (e as Error).message });
        return;
      }
    }
  }

  function finish(r: Run) {
    const s = sessionRef.current;
    if (!s || recordedRef.current === s.id) return;
    recordedRef.current = s.id;
    setPhase('end');
    sounds.play('complete');
    void record(r, s, true);
  }

  const nextRef = useRef(() => {});
  nextRef.current = () => next();

  function next() {
    if (!feedbackRef.current || !runRef.current) return;
    setFeedback(null);
    const r = advance(runRef.current);
    setRun(r);
    if (isDone(r)) finish(r);
  }

  function quit() {
    setFeedback(null);
    setRun(null);
    setSession(null);
    setPhase('start');
  }

  // Enter: start on the start screen, continue after feedback.
  useLayoutEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.key !== 'Enter' || e.repeat || e.altKey || e.ctrlKey || e.metaKey) return;
      const ph = phaseRef.current;
      if (ph === 'run' && feedbackRef.current) {
        e.preventDefault();
        nextRef.current();
      } else if (ph === 'start' && enoughWords && !isTypingTarget(e.target) && (e.target as HTMLElement)?.tagName !== 'BUTTON') {
        e.preventDefault();
        void startRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, enoughWords]);

  useEffect(() => {
    if (feedback && active) continueBtn.current?.focus({ preventScroll: true });
  }, [feedback, active]);

  // The end screen takes the focus to its heading, so it is read out and Tab reaches its actions.
  useEffect(() => {
    if (phase === 'end' && active) endHeading.current?.focus({ preventScroll: true });
  }, [phase]);

  // A new match game puts the focus on its first word (Choice and TypeAnswer focus themselves).
  const exKey = phase === 'run' && run && !isDone(run) ? `${run.pos}-${current(run)?.ex.id ?? ''}` : '';
  useEffect(() => {
    const el = exerciseCard.current;
    if (!exKey || !active || feedbackRef.current || !el || el.getAttribute('data-kind') !== 'match') return;
    if (!el.contains(document.activeElement)) el.querySelector<HTMLElement>('[data-testid="match-term-0"]')?.focus({ preventScroll: true });
  }, [exKey]);

  /** Done / Practice again: with an unsaved session, the first press warns and the second leaves. */
  function leave(action: 'done' | 'again') {
    if (save?.status === 'error' && leaveWarn !== action) {
      setLeaveWarn(action);
      return;
    }
    setLeaveWarn(null);
    if (action === 'again') {
      void start();
    } else {
      quit();
      onDone();
    }
  }

  const tinyLesson = () => void openExperimentUrl(deeplink(toSiteLang(uiLocale), 'tiny_lesson')).catch(() => undefined);

  // ---------- empty ----------
  if ((phase === 'start' && !enoughWords) || phase === 'empty') {
    return (
      <section class="card px-empty" data-testid="practice-empty">
        <div class="px-empty-icon" aria-hidden="true">
          🌱
        </div>
        <h1>{t('pxEmptyTitle')}</h1>
        <p class="muted">{t('pxEmptyBody', String(MIN_CARDS))}</p>
        <button type="button" class="primary px-big-btn" data-testid="btn-practice-tiny-lesson" onClick={tinyLesson}>
          {t('pxEmptyCta')}
        </button>
      </section>
    );
  }

  // ---------- start ----------
  if (phase === 'start' || phase === 'loading' || !run || !session) {
    const due = snapshot.dueCount;
    return (
      <section class="card px-start" data-testid="practice-start">
        <div class="px-hero" aria-hidden="true">
          🎯
        </div>
        <h1>{t('pxStartTitle')}</h1>
        <div class="px-stats">
          <div class="px-stat">
            <strong data-testid="practice-due">{due}</strong>
            <span class="muted">{t('pxStatDue')}</span>
          </div>
          <div class="px-stat">
            <strong>{deckCards.length}</strong>
            <span class="muted">{t('pxStatWords')}</span>
          </div>
        </div>
        <p class="muted px-desc">{t('pxStartBody', String(SESSION_SIZE))}</p>
        <ul class="px-kinds" aria-label={t('pxKindsLabel')}>
          <li>💬 {t('pxKindMeaning')}</li>
          <li>🎧 {t('pxKindListen')}</li>
          <li>🧩 {t('pxKindMatch')}</li>
          <li>⌨️ {t('pxKindType')}</li>
          <li>✏️ {t('pxKindBlank')}</li>
        </ul>
        {startError && (
          <p class="error-text" role="alert">
            {startError}
          </p>
        )}
        <button
          type="button"
          class="primary px-big-btn"
          data-testid="btn-start-practice"
          disabled={phase === 'loading'}
          onClick={() => void start()}
        >
          {phase === 'loading' ? t('loading') : t('pxStart')}
        </button>
      </section>
    );
  }

  // ---------- end ----------
  if (phase === 'end') {
    const sum = summary(run);
    const saved = save?.status === 'saved' ? save.data : null;
    // The core's recordPractice result is the single source of truth for "perfect" (and its bonus).
    const perfect = saved?.perfect === true;
    const todayXp = snapshot.progress.todayXp ?? 0;
    const goal = snapshot.progress.dailyGoalXp ?? 20;
    return (
      <section class="card px-end" data-testid="practice-end">
        {perfect && !reduced && <Confetti />}
        <div class="px-hero" aria-hidden="true">
          {perfect ? '🏆' : '🎉'}
        </div>
        <h1 ref={endHeading} tabIndex={-1} class="px-end-title">
          {perfect ? t('pxEndPerfect') : t('pxEndTitle')}
        </h1>
        {perfect && (
          <p class="px-perfect-bonus" data-testid="practice-perfect-bonus">
            {t('pxPerfectBonus', String(PERFECT_BONUS_XP))}
          </p>
        )}
        <div class="px-end-stats">
          <div class="px-end-stat xp" data-testid="practice-xp" data-xp={saved ? String(saved.xp) : ''}>
            <span class="muted">{t('pxEndXp')}</span>
            <strong>{saved ? <CountUp to={saved.xp} instant={reduced} prefix="+" /> : '…'}</strong>
          </div>
          <div class="px-end-stat" data-testid="practice-accuracy">
            <span class="muted">{t('pxEndAccuracy')}</span>
            <strong>{sum.accuracy}%</strong>
          </div>
          <div class="px-end-stat" data-testid="practice-strengthened">
            <span class="muted">{t('pxEndWords')}</span>
            <strong>{sum.strengthened}</strong>
          </div>
        </div>
        <div class="px-goal">
          <GoalRing value={todayXp} goal={goal} label={t('pxGoalLine', [String(todayXp), String(goal)])} />
          <div>
            <div style={{ fontWeight: 700 }}>{t('pxGoalLine', [String(Math.min(todayXp, 9999)), String(goal)])}</div>
            <div class="muted">
              🔥 {snapshot.progress.streak} {t('todayStreak')}
            </div>
          </div>
        </div>
        {save?.status === 'error' && (
          <div class="notice" role="alert" data-testid="practice-save-error">
            <p class="error-text">{t('pxSaveFailed', save.message)}</p>
            <button type="button" data-testid="btn-retry-save" onClick={() => void record(run, session)}>
              {t('btnRetry')}
            </button>
          </div>
        )}
        {leaveWarn && save?.status === 'error' && (
          <p class="error-text" role="alert" data-testid="practice-leave-warning">
            {t('pxLeaveUnsaved')}
          </p>
        )}
        <div class="px-end-actions">
          <button
            type="button"
            class="primary px-big-btn"
            data-testid="btn-practice-again"
            disabled={save?.status === 'saving'}
            onClick={() => leave('again')}
          >
            {t('pxAgain')}
          </button>
          <button type="button" class="px-big-btn" data-testid="btn-practice-done" onClick={() => leave('done')}>
            {t('pxDone')}
          </button>
        </div>
      </section>
    );
  }

  // ---------- exercise ----------
  const item = current(run)!;
  const ex = item.ex;
  const total = run.queue.length;
  const shown = run.pos + (feedback ? 1 : 0);
  const bcp = session.lang.bcp47;
  const langAttr = bcp !== 'und' ? bcp : undefined;
  const speak = (text: string) => speech.speak(text, bcp);
  const firstCard = session.cards.get(ex.cardIds[0] ?? '');
  const key = `${run.pos}-${ex.id}`;

  const onSingle = (result: CheckResult | 'correct' | 'wrong', given: string) =>
    answered({ kind: 'single', result }, result, given);

  const feedbackTitle = !feedback
    ? ''
    : feedback.state === 'correct'
      ? run.pos % 3 === 0
        ? t('pxPraise1')
        : run.pos % 3 === 1
          ? t('pxPraise2')
          : t('pxPraise3')
      : feedback.state === 'almost'
        ? ex.kind === 'match'
          ? t('pxMatchAlmost')
          : t('pxAlmostTitle')
        : t('pxWrongTitle');
  const announcement = !feedback
    ? ''
    : feedback.state === 'almost' && ex.kind === 'type'
      ? `${feedbackTitle} ${t('pxAlmostBody')} ${expectedVariants(ex.answer as string).join(' / ')}`
      : feedback.state === 'wrong' && ex.kind !== 'match'
        ? `${feedbackTitle} ${t('pxCorrectAnswer')} ${ex.answer as string}`
        : feedbackTitle;

  return (
    <div class="px-run" data-testid="practice-run">
      <div class="px-top">
        <button type="button" class="icon-btn px-quit" data-testid="btn-practice-quit" aria-label={t('pxQuit')} title={t('pxQuit')} onClick={quit}>
          ✕
        </button>
        <div
          class="px-progress"
          role="progressbar"
          data-testid="practice-progress"
          aria-label={t('pxProgress')}
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={run.pos}
        >
          <div class="px-progress-fill" style={{ width: `${Math.round((shown / total) * 100)}%` }} />
        </div>
        <span class={`px-combo${run.combo >= 3 ? ' is-on' : ''}`} data-testid={run.combo >= 3 ? 'practice-combo' : undefined}>
          {run.combo >= 3 ? `🔥 ${t('pxCombo', String(run.combo))}` : ''}
        </span>
      </div>

      {item.retry && <p class="px-retry-tag">{t('pxRetry')}</p>}

      <section
        class="card px-card"
        key={key}
        ref={exerciseCard}
        data-testid="practice-exercise"
        data-exercise-id={ex.id}
        data-kind={ex.kind}
        {...(E2E ? { 'data-e2e-answer': e2eAnswer(ex) } : {})}
      >
        {ex.kind === 'match' ? (
          <Match
            exercise={ex}
            lang={bcp}
            t={t}
            onPair={(ok) => sounds.play(ok ? 'correct' : 'wrong')}
            onDone={(perCard) => {
              const clean = Object.values(perCard).every((o) => o === 'correct');
              const r = runRef.current;
              if (!r || feedbackRef.current) return;
              const nextRun = applyAnswer(r, { kind: 'match', perCard });
              if (nextRun === r) return;
              setRun(nextRun);
              setFeedback({ state: clean ? 'correct' : 'almost' });
            }}
          />
        ) : ex.kind === 'type' ? (
          <TypeAnswer
            exercise={ex}
            lang={bcp}
            rtl={session.lang.rtl}
            pronunciation={firstCard?.pronunciation}
            t={t}
            active={active && !feedback}
            onAnswer={onSingle}
          />
        ) : (
          <Choice
            exercise={ex}
            lang={bcp}
            t={t}
            canSpeak={session.canSpeak}
            onSpeak={speak}
            active={active && !feedback}
            onAnswer={onSingle}
          />
        )}
      </section>

      {/* Persistent polite live region: it exists before any answer, so every feedback change is announced. */}
      <p class="sr-only" role="status" aria-live="polite" aria-atomic="true" data-testid="practice-announcer">
        {feedback ? announcement : ''}
      </p>

      <div class={`px-sheet${feedback ? ` is-open is-${feedback.state}` : ''}`} aria-hidden={feedback ? undefined : 'true'}>
        {feedback && (
          <div data-testid="practice-feedback" data-state={feedback.state}>
            <div class="px-sheet-head">
              <span class="px-sheet-icon" aria-hidden="true">
                {feedback.state === 'correct' ? '✓' : feedback.state === 'almost' ? '≈' : '✕'}
              </span>
              <strong>{feedbackTitle}</strong>
            </div>
            {feedback.state === 'almost' && ex.kind === 'type' && (
              <p class="px-sheet-line">
                {t('pxAlmostBody')}{' '}
                <span class="px-answer" lang={langAttr} dir="auto">
                  {expectedVariants(ex.answer as string).join(' / ')}
                </span>
              </p>
            )}
            {feedback.state === 'wrong' && ex.kind !== 'match' && (
              <p class="px-sheet-line">
                {t('pxCorrectAnswer')}{' '}
                <span class="px-answer" lang={ex.kind === 'meaning' ? undefined : langAttr} dir="auto">
                  {ex.answer as string}
                </span>
              </p>
            )}
            {ex.kind !== 'match' && firstCard && (
              <CardLine card={firstCard} lang={langAttr} nativeFirst={session.nativeFirst} canSpeak={session.canSpeak} onSpeak={speak} t={t} />
            )}
            <button
              ref={continueBtn}
              type="button"
              class="px-continue"
              data-testid="btn-continue"
              onClick={next}
            >
              {t('pxContinue')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function CardLine({
  card,
  lang,
  nativeFirst,
  canSpeak,
  onSpeak,
  t,
}: {
  card: ReviewCard;
  lang: string | undefined;
  nativeFirst: boolean;
  canSpeak: boolean;
  onSpeak: (text: string) => void;
  t: TranslateFn;
}) {
  const variants = expectedVariants(card.term);
  const nativeText = card.nativeTranslation?.trim();
  const meaning = nativeText || card.translation;
  return (
    <div class="px-card-line">
      <span class="px-term" lang={lang} dir="auto">
        {variants.join(' / ')}
      </span>
      {canSpeak && (
        <button type="button" class="icon-btn" aria-label={t('btnListen')} title={t('btnListen')} onClick={() => onSpeak(variants[0] ?? card.term)}>
          🔊
        </button>
      )}
      <span class="px-meaning" dir="auto">
        = {meaning}
        {nativeText && !nativeFirst && card.translation && nativeText !== card.translation && (
          <span class="muted"> · {card.translation}</span>
        )}
      </span>
    </div>
  );
}

function CountUp({ to, instant, prefix = '' }: { to: number; instant: boolean; prefix?: string }) {
  const [n, setN] = useState(instant ? to : 0);
  useEffect(() => {
    if (instant || to <= 0) {
      setN(to);
      return;
    }
    const steps = Math.min(24, to);
    let i = 0;
    const id = setInterval(() => {
      i++;
      setN(Math.round((to * i) / steps));
      if (i >= steps) clearInterval(id);
    }, 700 / steps);
    return () => clearInterval(id);
  }, [to, instant]);
  return (
    <span class="count-up">
      {prefix}
      {n}
    </span>
  );
}

