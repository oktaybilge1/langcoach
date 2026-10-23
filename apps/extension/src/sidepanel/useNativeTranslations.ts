import type { ReviewCard } from '@langcoach/core/browser';
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { createTranslatorCache, nativeLanguageCode, translationPair, type TranslatorCache } from '../lib/translate';
import type { Snapshot } from '../shared/messages';
import type { PanelSend } from './App';

/** Cards translated per stored batch. */
export const NATIVE_BATCH = 50;
/** While a model downloads elsewhere (another tab, an earlier click), check again this often. */
const RECHECK_MS = 5_000;

export type NativeStatus = 'off' | 'checking' | 'available' | 'downloadable' | 'downloading' | 'unavailable';

export interface NativeTranslations {
  status: NativeStatus;
  /** Translator codes of the main pair (most missing cards), null when off. */
  source: string | null;
  target: string | null;
  /** Cards that still show only the English meaning. */
  missing: number;
  /** True while missing cards are being translated and stored. */
  translating: boolean;
  /** Download progress 0..1 while downloading after a click, else null. */
  progress: number | null;
  /** Call straight from a click handler: the model download needs the user gesture. */
  download: () => void;
  /** The last download attempt failed while the model is still downloadable (show "try again"). */
  downloadFailed: boolean;
  /** The learner hid the "can't translate on-device" note for this pair. */
  dismissed: boolean;
  /** Hides the 'unavailable' note for the current pair (persisted in settings.dismissedNativePairs). */
  dismiss: () => void;
  nativeOf: (cardId: string) => string | undefined;
}

/** Shared by every panel view in this page; translators and results are cached for the session. */
export const panelTranslator: TranslatorCache = createTranslatorCache();

interface Group {
  source: string;
  target: string;
  cards: ReviewCard[];
}

/**
 * Native-language meanings for the side panel: finds cards without one, translates them on-device in
 * batches of 50 when the model is available (stored through the background), offers the one-time model
 * download when it is not, and otherwise stays quiet so the English meaning is shown. Never throws.
 */
export function useNativeTranslations(
  snapshot: Snapshot | null,
  send: PanelSend,
  translator: TranslatorCache = panelTranslator,
): NativeTranslations {
  const [status, setStatus] = useState<NativeStatus>('off');
  const [translating, setTranslating] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [fresh, setFresh] = useState<Record<string, string>>({});
  const [recheck, setRecheck] = useState(0);
  const [downloadFailed, setDownloadFailed] = useState(false);
  /** settings.dismissedNativePairs, read once (null until known). */
  const [dismissedPairs, setDismissedPairs] = useState<string[] | null>(null);
  /** Card ids already tried this session (a failed text is retried on the next panel open). */
  const attempted = useRef(new Set<string>());
  const running = useRef(false);
  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );

  const cards = snapshot?.state?.cards ?? [];
  const nativeLanguage = snapshot?.profile?.nativeLanguage;

  const groups = useMemo<Group[]>(() => {
    if (!nativeLanguage) return [];
    const sourceOf = new Map((snapshot?.state?.lessons ?? []).map((l) => [l.id, l.source?.sourceLanguage]));
    const byPair = new Map<string, Group>();
    for (const c of cards) {
      if (c.nativeTranslation || fresh[c.id] || !c.translation.trim()) continue;
      const pair = translationPair(sourceOf.get(c.lessonId), nativeLanguage);
      if (!pair) continue;
      const k = `${pair.source}|${pair.target}`;
      const g = byPair.get(k) ?? { ...pair, cards: [] };
      g.cards.push(c);
      byPair.set(k, g);
    }
    return [...byPair.values()].sort((a, b) => b.cards.length - a.cards.length);
  }, [cards, nativeLanguage, fresh, snapshot?.state?.lessons]);

  const missing = groups.reduce((n, g) => n + g.cards.length, 0);
  const main = groups[0] ?? null;
  const pendingCount = groups.reduce((n, g) => n + g.cards.filter((c) => !attempted.current.has(c.id)).length, 0);

  const translateAll = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    setTranslating(true);
    try {
      for (const g of groups) {
        const todo = g.cards.filter((c) => !attempted.current.has(c.id));
        for (let i = 0; i < todo.length; i += NATIVE_BATCH) {
          const batch = todo.slice(i, i + NATIVE_BATCH);
          for (const c of batch) attempted.current.add(c.id);
          const out = await translator.translateMany(
            batch.map((c) => c.translation),
            g.source,
            g.target,
          );
          const entries: { cardId: string; text: string }[] = [];
          batch.forEach((c, k) => {
            const text = out[k];
            if (text) entries.push({ cardId: c.id, text });
          });
          if (entries.length === 0) continue;
          try {
            await send({ type: 'setNativeTranslations', entries });
            if (mounted.current) {
              setFresh((prev) => {
                const next = { ...prev };
                for (const e of entries) next[e.cardId] = e.text;
                return next;
              });
            }
          } catch {
            /* stored next time the panel opens */
          }
        }
      }
    } catch {
      /* English stays */
    } finally {
      running.current = false;
      if (mounted.current) setTranslating(false);
    }
  }, [groups, translator, send]);

  const mainKey = main ? `${main.source}|${main.target}` : '';

  useEffect(() => {
    if (!main) {
      setStatus('off');
      return;
    }
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setStatus((s) => (s === 'off' ? 'checking' : s));
    void translator.ensureReady(main.source, main.target, { userGesture: false }).then((st) => {
      if (!active) return;
      if (st === 'available') {
        setStatus('available');
        if (pendingCount > 0) void translateAll();
        return;
      }
      if (st === 'needs_download') {
        setStatus((s) => (s === 'downloading' && progress !== null ? s : 'downloadable'));
        return;
      }
      setStatus(st);
      if (st === 'downloading') timer = setTimeout(() => setRecheck((n) => n + 1), RECHECK_MS);
    });
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
    // pendingCount: new captures arrive through snapshot refreshes
  }, [mainKey, pendingCount, recheck, translator]);

  const pairKey = main ? `${main.source}:${main.target}` : '';

  useEffect(() => {
    if (!pairKey || dismissedPairs !== null) return;
    let active = true;
    send({ type: 'getSettings' })
      .then((st) => {
        if (active) setDismissedPairs(Array.isArray(st?.dismissedNativePairs) ? st.dismissedNativePairs : []);
      })
      .catch(() => {
        if (active) setDismissedPairs([]);
      });
    return () => {
      active = false;
    };
  }, [pairKey, dismissedPairs, send]);

  const dismiss = useCallback(() => {
    if (!pairKey) return;
    const next = [...(dismissedPairs ?? []).filter((k) => k !== pairKey), pairKey].slice(-20);
    setDismissedPairs(next);
    void send({ type: 'setSettings', settings: { dismissedNativePairs: next } }).catch(() => {
      /* hidden for this session anyway */
    });
  }, [pairKey, dismissedPairs, send]);

  const download = useCallback(() => {
    if (!main) return;
    setStatus('downloading');
    setDownloadFailed(false);
    setProgress(0);
    // Called synchronously from the click: ensureReady starts create() before any await.
    void translator
      .ensureReady(main.source, main.target, { userGesture: true, onProgress: (p) => mounted.current && setProgress(p) })
      .then((st) => {
        if (!mounted.current) return;
        setProgress(null);
        if (st === 'available') {
          setStatus('available');
          void translateAll();
          return;
        }
        // The download failed (network, disk, cancelled): ask again; a still-downloadable model gets the
        // button back with a "try again" line instead of the misleading "can't translate" note.
        void translator.available(main.source, main.target).then((a) => {
          if (!mounted.current) return;
          if (a === 'downloadable') {
            setDownloadFailed(true);
            setStatus('downloadable');
          } else if (a === 'available') {
            setStatus('available');
            void translateAll();
          } else {
            setStatus(a);
          }
        });
      });
  }, [main, translator, translateAll]);

  const nativeById = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of cards) if (c.nativeTranslation) m.set(c.id, c.nativeTranslation);
    return m;
  }, [cards]);
  const nativeOf = useCallback((id: string) => nativeById.get(id) ?? fresh[id], [nativeById, fresh]);

  if (!nativeLanguage) {
    return {
      status: 'off',
      source: null,
      target: null,
      missing: 0,
      translating: false,
      progress: null,
      download,
      downloadFailed: false,
      dismissed: false,
      dismiss,
      nativeOf,
    };
  }
  return {
    status: main ? status : 'off',
    source: main?.source ?? null,
    target: main?.target ?? nativeLanguageCode(nativeLanguage),
    missing,
    translating,
    progress,
    download,
    downloadFailed,
    // Unknown until settings are read: stay hidden rather than flash the note.
    dismissed: dismissedPairs === null || dismissedPairs.includes(pairKey),
    dismiss,
    nativeOf,
  };
}
