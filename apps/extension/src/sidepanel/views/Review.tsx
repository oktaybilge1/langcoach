import type { Rating, ReviewCard } from '@langcoach/core/browser';
import { useEffect, useRef, useState } from 'preact/hooks';
import { deeplink, toSiteLang } from '../../lib/deeplink';
import { resolveLanguage } from '../../lib/languages';
import type { UiLocale } from '../../lib/themes';
import type { Snapshot } from '../../shared/messages';
import type { PanelSend } from '../App';
import type { TranslateFn } from '../i18n';
import { openExperimentUrl } from '../tabs';
import type { NativeTranslations } from '../useNativeTranslations';

export interface ReviewProps {
  snapshot: Snapshot;
  uiLocale: UiLocale;
  t: TranslateFn;
  send: PanelSend;
  onRefresh: () => Promise<void>;
  initialMode?: ReviewMode;
  native?: NativeTranslations;
}

export type ReviewMode = 'list' | 'cards';

export function Review({ snapshot, uiLocale, t, send, onRefresh, initialMode, native }: ReviewProps) {
  const nativeOf = (id: string): string | undefined => native?.nativeOf(id);
  const nativeLang = native?.target ?? undefined;
  const [mode, setModeState] = useState<ReviewMode>(() => {
    if (initialMode) return initialMode;
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem('langcoach:reviewMode');
      if (saved === 'list' || saved === 'cards') return saved;
    }
    return 'cards';
  });

  function setMode(next: ReviewMode) {
    setModeState(next);
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('langcoach:reviewMode', next);
      }
    } catch {
      /* ignore */
    }
  }

  const [cards, setCards] = useState<ReviewCard[]>([]);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [draftTranslation, setDraftTranslation] = useState('');
  const [reviewedCount, setReviewedCount] = useState(0);
  const completedSessionRef = useRef(false);
  /** True while a rating is being saved: rapid 1-4 presses must not rate the same card twice. */
  const ratingRef = useRef(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const targetLang = resolveLanguage(snapshot.profile?.targetLanguage ?? '');
  const card = cards[index];

  // A new card starts with its own translation as the draft (never a leftover from the previous card).
  useEffect(() => {
    setDraftTranslation(card?.translation ?? '');
  }, [card?.id]);

  // All cards from snapshot state, falling back to due cards
  const allCards: ReviewCard[] =
    snapshot.state?.cards && snapshot.state.cards.length > 0
      ? snapshot.state.cards
      : cards;

  useEffect(() => {
    let active = true;
    setLoading(true);
    send({ type: 'getDue', limit: 100 })
      .then((due) => {
        if (!active) return;
        setCards(due);
        setIndex(0);
        setFlipped(false);
        setLoading(false);
      })
      .catch(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function finishSession(count: number) {
    if (count < 1 || completedSessionRef.current) return;
    completedSessionRef.current = true;
    await send({ type: 'completeReview', cardsReviewed: count });
    await onRefresh();
  }

  async function handleRate(rating: Rating) {
    if (!card || ratingRef.current) return;
    ratingRef.current = true;
    try {
      await send({ type: 'review', cardId: card.id, rating });
      const nextCount = reviewedCount + 1;
      setReviewedCount(nextCount);
      setEditingCardId(null);
      setActionError(null);

      if (index + 1 >= cards.length) {
        setCards([]);
        setIndex(0);
        setFlipped(false);
        await finishSession(nextCount);
      } else {
        setIndex(index + 1);
        setFlipped(false);
        await onRefresh();
      }
    } catch (e) {
      setActionError(t('actionFailed', (e as Error).message));
    } finally {
      ratingRef.current = false;
    }
  }

  async function handleSaveTranslation(cardId: string) {
    try {
      const updated = await send({
        type: 'updateCard',
        cardId,
        patch: { translation: draftTranslation },
      });
      setCards((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      setEditingCardId(null);
      setActionError(null);
      await onRefresh();
    } catch (e) {
      setActionError(t('actionFailed', (e as Error).message));
    }
  }

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (mode !== 'cards') return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (!card) return;
      if (!flipped && (e.key === ' ' || e.key === 'Enter')) {
        e.preventDefault();
        setFlipped(true);
        return;
      }
      if (flipped && (e.key === '1' || e.key === '2' || e.key === '3' || e.key === '4')) {
        e.preventDefault();
        void handleRate(Number(e.key) as Rating);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mode, card, flipped, index, cards, reviewedCount]);

  const canSpeak =
    typeof window !== 'undefined' &&
    'speechSynthesis' in window &&
    typeof window.speechSynthesis?.speak === 'function';

  function handleSpeak(term: string) {
    if (!canSpeak || !term) return;
    try {
      const u = new SpeechSynthesisUtterance(term);
      if (targetLang.bcp47 !== 'und') u.lang = targetLang.bcp47;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    } catch {
      /* ignore speech errors */
    }
  }

  if (loading) {
    return (
      <section class="card">
        <p class="muted">{t('loading')}</p>
      </section>
    );
  }

  const filteredList = allCards
    .slice()
    .reverse()
    .filter((c) => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        c.term.toLowerCase().includes(q) ||
        (c.translation && c.translation.toLowerCase().includes(q)) ||
        (nativeOf(c.id) ?? '').toLowerCase().includes(q)
      );
    });

  const remainingDue = Math.max(0, cards.length - index);

  return (
    <div class="form-grid">
      <div class="today-summary">
        <h1>{t('reviewHeading')}</h1>
        <span class="pill" data-testid="review-due-count">
          {t('reviewDueBadge', String(remainingDue))}
        </span>
      </div>

      {actionError && (
        <p class="error-text" role="alert" data-testid="review-error">
          {actionError}
        </p>
      )}

      <div class="segmented-control" role="group">
        <button
          type="button"
          data-testid="mode-list"
          aria-pressed={mode === 'list'}
          class={`segmented-btn ${mode === 'list' ? 'active' : ''}`}
          onClick={() => setMode('list')}
        >
          📋 {t('tabModeList')} ({allCards.length})
        </button>
        <button
          type="button"
          data-testid="mode-cards"
          aria-pressed={mode === 'cards'}
          class={`segmented-btn ${mode === 'cards' ? 'active' : ''}`}
          onClick={() => setMode('cards')}
        >
          🎴 {t('tabModeCards')} ({remainingDue})
        </button>
      </div>

      {mode === 'list' ? (
        <section class="card vocab-section">
          {allCards.length > 5 && (
            <div style={{ marginBottom: '12px' }}>
              <input
                type="text"
                placeholder={t('searchPlaceholder')}
                value={search}
                onInput={(e) => setSearch((e.currentTarget as HTMLInputElement).value)}
                style={{ width: '100%' }}
              />
            </div>
          )}

          {filteredList.length === 0 ? (
            <div data-testid="review-empty">
              <p class="muted">{t('reviewEmptyBody')}</p>
              <button
                type="button"
                class="primary"
                onClick={() => openExperimentUrl(deeplink(toSiteLang(uiLocale), 'tiny_lesson'))}
              >
                {t('btnOpenLll')}
              </button>
            </div>
          ) : (
            <div class="vocab-list">
              {filteredList.map((c) => {
                const isEditing = editingCardId === c.id;
                return (
                  <div key={c.id} class="vocab-item">
                    <div class="vocab-row">
                      <div class="vocab-term-group">
                        <span
                          class="vocab-term"
                          dir="auto"
                          lang={targetLang.bcp47 !== 'und' ? targetLang.bcp47 : undefined}
                        >
                          {c.term}
                        </span>
                        {c.pronunciation && <span class="card-pron">{c.pronunciation}</span>}
                        {canSpeak && (
                          <button
                            type="button"
                            class="icon-btn"
                            title={t('btnListen')}
                            onClick={() => handleSpeak(c.term)}
                          >
                            🔊
                          </button>
                        )}
                      </div>
                      <span class={`status-tag ${c.srs.reps > 0 ? 'learned' : 'new'}`}>
                        {c.srs.reps > 0 ? `✓ ${t('statusLearned')}` : t('statusNew')}
                      </span>
                    </div>

                    {isEditing ? (
                      <div class="field-row" style={{ marginTop: '8px' }}>
                        <input
                          type="text"
                          value={draftTranslation}
                          placeholder={t('placeholderTranslation')}
                          onInput={(e) => setDraftTranslation((e.currentTarget as HTMLInputElement).value)}
                          autoFocus
                        />
                        <button
                          type="button"
                          class="primary"
                          onClick={() => handleSaveTranslation(c.id)}
                        >
                          {t('btnSaveCard')}
                        </button>
                        <button type="button" onClick={() => setEditingCardId(null)}>
                          {t('btnCancel')}
                        </button>
                      </div>
                    ) : (
                      <div class="vocab-trans-row">
                        <div class="vocab-meanings">
                          {nativeOf(c.id) && (
                            <span class="vocab-native" data-testid="vocab-native" dir="auto" lang={nativeLang}>
                              {nativeOf(c.id)}
                            </span>
                          )}
                          <span class={`vocab-trans ${nativeOf(c.id) ? 'secondary' : ''}`} dir="auto">
                            {c.translation || <em class="muted">{t('noTranslation')}</em>}
                          </span>
                        </div>
                        <button
                          type="button"
                          class="btn-subtle"
                          onClick={() => {
                            setEditingCardId(c.id);
                            setDraftTranslation(c.translation);
                          }}
                        >
                          ✏️ {t('btnEditCard')}
                        </button>
                      </div>
                    )}

                    {c.example && (
                      <div
                        class="vocab-example muted"
                        dir="auto"
                        lang={targetLang.bcp47 !== 'und' ? targetLang.bcp47 : undefined}
                      >
                        “{c.example}”
                      </div>
                    )}

                  </div>
                );
              })}
            </div>
          )}
        </section>
      ) : !card ? (
        <section class="card" data-testid="review-empty">
          <h1>{t('reviewEmptyTitle')}</h1>
          <p class="muted" style={{ marginBottom: '12px' }}>
            {t('reviewEmptyBody')}
          </p>
          <button
            type="button"
            class="primary"
            onClick={() => openExperimentUrl(deeplink(toSiteLang(uiLocale), 'tiny_lesson'))}
          >
            {t('btnOpenLll')}
          </button>
        </section>
      ) : (
        <section class="card flashcard">
          <div
            class="card-term"
            data-testid="card-term"
            dir="auto"
            lang={targetLang.bcp47 !== 'und' ? targetLang.bcp47 : undefined}
          >
            {card.term}
          </div>
          {card.pronunciation && <div class="card-pron">{card.pronunciation}</div>}
          {canSpeak && (
            <div>
              <button type="button" onClick={() => handleSpeak(card.term)} aria-label={t('btnListen')}>
                🔊 {t('btnListen')}
              </button>
            </div>
          )}

          {!flipped ? (
            <button
              type="button"
              class="primary"
              data-testid="review-show"
              onClick={() => setFlipped(true)}
            >
              {t('btnShowAnswer')}
            </button>
          ) : (
            <div class="card-back">
              {editingCardId === card.id || card.translation === '' ? (
                <div class="field-row">
                  <input
                    type="text"
                    data-testid="edit-translation-input"
                    placeholder={t('placeholderTranslation')}
                    value={draftTranslation}
                    onInput={(e) => setDraftTranslation((e.currentTarget as HTMLInputElement).value)}
                  />
                  <button
                    type="button"
                    data-testid="save-translation-btn"
                    onClick={() => handleSaveTranslation(card.id)}
                  >
                    {t('btnSaveCard')}
                  </button>
                </div>
              ) : (
                <div class="today-summary">
                  <div class="card-meanings">
                    {nativeOf(card.id) && (
                      <div
                        data-testid="card-native"
                        dir="auto"
                        lang={nativeLang}
                        style={{ fontWeight: 600, fontSize: '16px' }}
                      >
                        {nativeOf(card.id)}
                      </div>
                    )}
                    <div
                      data-testid="card-translation"
                      dir="auto"
                      class={nativeOf(card.id) ? 'muted' : undefined}
                      style={nativeOf(card.id) ? { fontSize: '13px' } : { fontWeight: 600, fontSize: '16px' }}
                    >
                      {card.translation}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setDraftTranslation(card.translation);
                      setEditingCardId(card.id);
                    }}
                  >
                    {t('btnEditCard')}
                  </button>
                </div>
              )}

              {card.example && (
                <div
                  class="muted"
                  dir="auto"
                  lang={targetLang.bcp47 !== 'und' ? targetLang.bcp47 : undefined}
                >
                  {card.example}
                </div>
              )}

              <div class="rating-grid">
                <button type="button" data-testid="rate-1" onClick={() => handleRate(1)}>
                  1 · {t('rateAgain')}
                </button>
                <button type="button" data-testid="rate-2" onClick={() => handleRate(2)}>
                  2 · {t('rateHard')}
                </button>
                <button type="button" class="primary" data-testid="rate-3" onClick={() => handleRate(3)}>
                  3 · {t('rateGood')}
                </button>
                <button type="button" data-testid="rate-4" onClick={() => handleRate(4)}>
                  4 · {t('rateEasy')}
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {reviewedCount > 0 && (
        <button
          type="button"
          data-testid="review-finish"
          onClick={async () => {
            setCards([]);
            await finishSession(reviewedCount);
          }}
        >
          {t('btnFinishReview')}
        </button>
      )}
    </div>
  );
}
