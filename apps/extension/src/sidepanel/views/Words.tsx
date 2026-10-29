import { isDue, type ReviewCard } from '@langcoach/core/browser';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { deeplink, toSiteLang } from '../../lib/deeplink';
import { resolveLanguage } from '../../lib/languages';
import { browserSpeech, type Speech } from '../../lib/speech';
import { isWeak, strengthOf } from '../../lib/strength';
import type { UiLocale } from '../../lib/themes';
import type { Snapshot } from '../../shared/messages';
import type { PanelSend } from '../App';
import { StrengthMeter } from '../components/StrengthMeter';
import type { TranslateFn } from '../i18n';
import { openExperimentUrl } from '../tabs';
import type { NativeTranslations } from '../useNativeTranslations';
import { Review } from './Review';

export type WordsMode = 'list' | 'cards';
export type WordsFilter = 'all' | 'due' | 'new' | 'weak' | 'favorites' | 'mastered';
const FILTERS: readonly WordsFilter[] = ['all', 'due', 'new', 'weak', 'favorites', 'mastered'];
const PAGE = 50;
const MODE_KEY = 'langcoach:wordsMode';
const OTHER_GROUP = '\u0000other';

export interface WordsDeps {
  now?: () => Date;
  speech?: Speech;
}

export interface WordsProps {
  snapshot: Snapshot;
  uiLocale: UiLocale;
  t: TranslateFn;
  send: PanelSend;
  onRefresh: () => Promise<void>;
  native?: NativeTranslations;
  initialMode?: WordsMode;
  deps?: WordsDeps;
}

/** Local edits shown before the next snapshot arrives (and rolled back if saving fails). */
interface Override {
  favorite?: boolean;
  mastered?: boolean;
  native?: string;
  translation?: string;
  xp?: number;
}

const defaultSpeech: Speech = {
  // Voices load asynchronously in Chrome: offer 🔊 whenever speech synthesis exists.
  canSpeak: () => typeof window !== 'undefined' && typeof window.speechSynthesis?.speak === 'function',
  speak: (text, lang) => browserSpeech.speak(text, lang),
};

function readMode(): WordsMode {
  try {
    const v = localStorage.getItem(MODE_KEY);
    if (v === 'list' || v === 'cards') return v;
  } catch {
    /* storage unavailable */
  }
  return 'list';
}

export function filterLabel(f: WordsFilter, t: TranslateFn): string {
  switch (f) {
    case 'all':
      return t('wordsFilterAll');
    case 'due':
      return t('wordsFilterDue');
    case 'new':
      return t('wordsFilterNew');
    case 'weak':
      return t('wordsFilterWeak');
    case 'favorites':
      return t('wordsFilterFavorites');
    case 'mastered':
      return t('wordsFilterMastered');
  }
}

export function Words({ snapshot, uiLocale, t, send, onRefresh, native, initialMode, deps = {} }: WordsProps) {
  const speech = deps.speech ?? defaultSpeech;
  const [mode, setModeState] = useState<WordsMode>(() => initialMode ?? readMode());
  const [filter, setFilter] = useState<WordsFilter>('all');
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const [overrides, setOverrides] = useState<Record<string, Override>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState({ native: '', translation: '' });
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const knowing = useRef(new Set<string>());
  const editButtons = useRef(new Map<string, HTMLButtonElement>());
  const returnFocus = useRef<string | null>(null);

  function setMode(next: WordsMode) {
    setModeState(next);
    try {
      localStorage.setItem(MODE_KEY, next);
    } catch {
      /* ignore */
    }
  }

  const target = resolveLanguage(snapshot.profile?.targetLanguage ?? '');
  const targetLang = target.bcp47 !== 'und' ? target.bcp47 : undefined;
  const nativeLang = native?.target ?? undefined;
  const canSpeak = targetLang !== undefined && speech.canSpeak(target.bcp47);
  const now = (deps.now ?? (() => new Date()))();

  const cards = snapshot.state?.cards ?? [];
  const lessons = snapshot.state?.lessons ?? [];

  const view = (c: ReviewCard) => {
    const o = overrides[c.id];
    return {
      favorite: o?.favorite ?? c.favorite === true,
      mastered: o?.mastered ?? c.mastered === true,
      native: o?.native ?? native?.nativeOf(c.id) ?? c.nativeTranslation ?? '',
      translation: o?.translation ?? c.translation,
    };
  };

  // Groups: lessons newest first, cards in saved order inside a lesson; cards of a removed lesson last.
  const ordered = useMemo(() => {
    const order = new Map<string, number>();
    const situation = new Map<string, string>();
    [...lessons]
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .forEach((l, i) => {
        order.set(l.id, i);
        situation.set(l.id, l.situation);
      });
    const rank = (c: ReviewCard) => order.get(c.lessonId) ?? Number.MAX_SAFE_INTEGER;
    const list = cards.map((c, i) => ({ c, i })).sort((a, b) => rank(a.c) - rank(b.c) || a.i - b.i);
    return { list: list.map((x) => x.c), situation };
  }, [cards, lessons]);

  const matches = (c: ReviewCard, f: WordsFilter): boolean => {
    const v = view(c);
    switch (f) {
      case 'all':
        return true;
      case 'due':
        return isDue(c.srs, now);
      case 'new':
        return c.srs.reps === 0 && !v.mastered;
      case 'weak':
        return isWeak(c);
      case 'favorites':
        return v.favorite;
      case 'mastered':
        return v.mastered || strengthOf(c) === 5;
    }
  };

  const q = query.trim().toLocaleLowerCase();
  const searched = q
    ? ordered.list.filter((c) => {
        const v = view(c);
        return (
          c.term.toLocaleLowerCase().includes(q) ||
          v.translation.toLocaleLowerCase().includes(q) ||
          v.native.toLocaleLowerCase().includes(q)
        );
      })
    : ordered.list;
  const counts = Object.fromEntries(FILTERS.map((f) => [f, searched.filter((c) => matches(c, f)).length])) as Record<
    WordsFilter,
    number
  >;
  const filtered = filter === 'all' ? searched : searched.filter((c) => matches(c, filter));
  const shown = filtered.slice(0, limit);
  const groups: { key: string; title: string; cards: ReviewCard[] }[] = [];
  for (const c of shown) {
    const key = ordered.situation.has(c.lessonId) ? c.lessonId : OTHER_GROUP;
    let g = groups[groups.length - 1];
    if (!g || g.key !== key) {
      g = { key, title: ordered.situation.get(c.lessonId) ?? t('wordsOtherGroup'), cards: [] };
      groups.push(g);
    }
    g.cards.push(c);
  }

  // A new search or filter starts again from the first page.
  useEffect(() => setLimit(PAGE), [q, filter]);

  useEffect(() => {
    if (editing === null && returnFocus.current) {
      editButtons.current.get(returnFocus.current)?.focus();
      returnFocus.current = null;
    }
  }, [editing]);

  const patch = (id: string, o: Override) => setOverrides((prev) => ({ ...prev, [id]: { ...prev[id], ...o } }));

  async function toggleFavorite(c: ReviewCard) {
    const next = !view(c).favorite;
    patch(c.id, { favorite: next });
    try {
      await send({ type: 'setFavorite', cardId: c.id, favorite: next });
      setError(null);
      setStatus(next ? t('wordsFavoriteAdded', c.term) : t('wordsFavoriteRemoved', c.term));
    } catch (e) {
      patch(c.id, { favorite: !next });
      setError(t('actionFailed', (e as Error).message));
    }
  }

  async function knowThis(c: ReviewCard) {
    if (view(c).mastered || knowing.current.has(c.id)) return;
    knowing.current.add(c.id);
    patch(c.id, { mastered: true });
    try {
      const r = await send({ type: 'markMastered', cardId: c.id });
      patch(c.id, { mastered: true, xp: r.xpAwarded });
      setError(null);
      setStatus(t('wordsKnownStatus', [c.term, String(r.xpAwarded)]));
      void onRefresh();
    } catch (e) {
      knowing.current.delete(c.id);
      patch(c.id, { mastered: false });
      setError(t('actionFailed', (e as Error).message));
    }
  }

  function startEdit(c: ReviewCard) {
    const v = view(c);
    setDraft({ native: v.native, translation: v.translation });
    setEditing(c.id);
  }

  function cancelEdit(id: string) {
    returnFocus.current = id;
    setEditing(null);
  }

  async function saveEdit(c: ReviewCard) {
    const v = view(c);
    const nextNative = draft.native.trim();
    const nextTranslation = draft.translation;
    try {
      if (nextNative !== '' && nextNative !== v.native) {
        await send({ type: 'setNativeTranslations', entries: [{ cardId: c.id, text: nextNative }] });
        patch(c.id, { native: nextNative });
      }
      if (nextTranslation !== v.translation) {
        await send({ type: 'updateCard', cardId: c.id, patch: { translation: nextTranslation } });
        patch(c.id, { translation: nextTranslation });
      }
      setError(null);
      returnFocus.current = c.id;
      setEditing(null);
      void onRefresh();
    } catch (e) {
      setError(t('actionFailed', (e as Error).message));
    }
  }

  const tinyLesson = () => void openExperimentUrl(deeplink(toSiteLang(uiLocale), 'tiny_lesson'));

  return (
    <div class="form-grid words" data-testid="words-view">
      <div class="today-summary">
        <h1>{t('wordsHeading')}</h1>
        <span class="pill" data-testid="review-due-count">
          {t('reviewDueBadge', String(snapshot.dueCount))}
        </span>
      </div>

      <div class="segmented-control" role="group" aria-label={t('wordsModeLabel')}>
        <button
          type="button"
          data-testid="mode-list"
          aria-pressed={mode === 'list'}
          class={`segmented-btn ${mode === 'list' ? 'active' : ''}`}
          onClick={() => setMode('list')}
        >
          <span aria-hidden="true">📋 </span>
          {t('tabModeList')} ({cards.length})
        </button>
        <button
          type="button"
          data-testid="mode-cards"
          aria-pressed={mode === 'cards'}
          class={`segmented-btn ${mode === 'cards' ? 'active' : ''}`}
          onClick={() => setMode('cards')}
        >
          <span aria-hidden="true">🎴 </span>
          {t('tabModeCards')}
        </button>
      </div>

      {error && (
        <p class="error-text" role="alert" data-testid="words-error">
          {error}
        </p>
      )}
      <p class="sr-only" role="status" aria-live="polite">
        {status}
      </p>

      {mode === 'cards' ? (
        <Review snapshot={snapshot} uiLocale={uiLocale} t={t} send={send} onRefresh={onRefresh} native={native} embedded />
      ) : cards.length === 0 ? (
        <section class="card empty-state" data-testid="review-empty">
          <div class="empty-icon" aria-hidden="true">
            📚
          </div>
          <h2>{t('wordsEmptyTitle')}</h2>
          <p class="muted">{t('reviewEmptyBody')}</p>
          <button type="button" class="primary" onClick={tinyLesson}>
            {t('btnOpenLll')}
          </button>
        </section>
      ) : (
        <>
          <div class="words-tools">
            <label class="sr-only" for="words-search">
              {t('searchPlaceholder')}
            </label>
            <input
              id="words-search"
              type="search"
              class="words-search"
              data-testid="words-search"
              placeholder={t('searchPlaceholder')}
              value={query}
              onInput={(e) => setQuery((e.currentTarget as HTMLInputElement).value)}
            />
            <div class="chip-row" role="group" aria-label={t('wordsFilterLabel')}>
              {FILTERS.map((f) => (
                <button
                  key={f}
                  type="button"
                  class={`chip ${filter === f ? 'active' : ''}`}
                  data-testid={`words-filter-${f}`}
                  aria-pressed={filter === f}
                  onClick={() => setFilter(f)}
                >
                  {filterLabel(f, t)} <span class="chip-count">{counts[f]}</span>
                </button>
              ))}
            </div>
          </div>

          {filtered.length === 0 ? (
            <p class="muted card" data-testid="words-no-match">
              {t('wordsNoMatch')}
            </p>
          ) : (
            groups.map((g) => (
              <section key={g.key} class="card words-group" data-testid="words-group">
                <h2 dir="auto">
                  {g.title} <span class="muted words-group-count">· {g.cards.length}</span>
                </h2>
                <ul class="vocab-list">
                  {g.cards.map((c) => {
                    const v = view(c);
                    const o = overrides[c.id];
                    const isEditing = editing === c.id;
                    const strength = strengthOf(c);
                    return (
                      <li key={c.id} class="vocab-item" data-testid="word-item" data-card-id={c.id}>
                        <div class="vocab-row">
                          <div class="vocab-term-group">
                            <span class="vocab-term" dir="auto" lang={targetLang}>
                              {c.term}
                            </span>
                            {c.pronunciation && <span class="card-pron">{c.pronunciation}</span>}
                          </div>
                          <div class="word-actions">
                            {canSpeak && (
                              <button
                                type="button"
                                class="icon-btn"
                                data-testid="btn-speak"
                                aria-label={t('wordsListenTo', c.term)}
                                title={t('btnListen')}
                                onClick={() => speech.speak(c.term, target.bcp47)}
                              >
                                🔊
                              </button>
                            )}
                            <button
                              type="button"
                              class={`icon-btn star ${v.favorite ? 'on' : ''}`}
                              data-testid="btn-favorite"
                              aria-pressed={v.favorite}
                              aria-label={t('wordsFavorite', c.term)}
                              title={t('wordsFavorite', c.term)}
                              onClick={() => void toggleFavorite(c)}
                            >
                              {v.favorite ? '★' : '☆'}
                            </button>
                          </div>
                        </div>

                        {isEditing ? (
                          <div
                            class="word-edit form-grid"
                            onKeyDown={(e) => {
                              if (e.key === 'Escape') {
                                e.preventDefault();
                                cancelEdit(c.id);
                              } else if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') {
                                e.preventDefault();
                                void saveEdit(c);
                              }
                            }}
                          >
                            <label class="field">
                              <span>{t('wordsEditNative')}</span>
                              <input
                                type="text"
                                data-testid="edit-native"
                                lang={nativeLang}
                                dir="auto"
                                value={draft.native}
                                placeholder={t('placeholderNative')}
                                maxLength={500}
                                autoFocus
                                onInput={(e) => setDraft((d) => ({ ...d, native: (e.currentTarget as HTMLInputElement).value }))}
                              />
                            </label>
                            <label class="field">
                              <span>{t('wordsEditEnglish')}</span>
                              <input
                                type="text"
                                data-testid="edit-translation"
                                dir="auto"
                                value={draft.translation}
                                placeholder={t('placeholderTranslation')}
                                onInput={(e) =>
                                  setDraft((d) => ({ ...d, translation: (e.currentTarget as HTMLInputElement).value }))
                                }
                              />
                            </label>
                            <div class="theme-actions">
                              <button type="button" class="primary" data-testid="btn-save-edit" onClick={() => void saveEdit(c)}>
                                {t('btnSaveCard')}
                              </button>
                              <button type="button" onClick={() => cancelEdit(c.id)}>
                                {t('btnCancel')}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div class="vocab-trans-row">
                            <div class="vocab-meanings">
                              {v.native && (
                                <span class="vocab-native" data-testid="vocab-native" dir="auto" lang={nativeLang}>
                                  {v.native}
                                </span>
                              )}
                              <span class={`vocab-trans ${v.native ? 'secondary' : ''}`} dir="auto">
                                {v.translation || <em class="muted">{t('noTranslation')}</em>}
                              </span>
                            </div>
                            <button
                              type="button"
                              class="btn-subtle"
                              data-testid="btn-edit"
                              ref={(el) => {
                                if (el) editButtons.current.set(c.id, el);
                                else editButtons.current.delete(c.id);
                              }}
                              aria-label={t('wordsEditLabel', c.term)}
                              onClick={() => startEdit(c)}
                            >
                              <span aria-hidden="true">✏️ </span>
                              {t('btnEditCard')}
                            </button>
                          </div>
                        )}

                        {c.example && (
                          <div class="vocab-example muted" dir="auto" lang={targetLang}>
                            “{c.example}”
                          </div>
                        )}

                        <div class="word-footer">
                          <StrengthMeter value={strength} t={t} />
                          <button
                            type="button"
                            class={`btn-know ${v.mastered ? 'done' : ''}`}
                            data-testid="btn-know"
                            disabled={v.mastered}
                            aria-label={v.mastered ? t('wordsKnown') : t('wordsKnowThisLabel', c.term)}
                            onClick={() => void knowThis(c)}
                          >
                            {v.mastered
                              ? o?.xp
                                ? `✓ ${t('wordsKnownXp', String(o.xp))}`
                                : `✓ ${t('wordsKnown')}`
                              : t('wordsKnowThis')}
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))
          )}

          {filtered.length > shown.length && (
            <button
              type="button"
              class="show-more"
              data-testid="btn-show-more"
              onClick={() => setLimit((n) => n + PAGE)}
            >
              {t('wordsShowMore', String(filtered.length - shown.length))}
            </button>
          )}
        </>
      )}
    </div>
  );
}
