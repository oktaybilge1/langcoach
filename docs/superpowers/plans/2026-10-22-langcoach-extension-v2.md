# LangCoach Extension v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the v1 extension into a Duolingo-level learning experience: native-language translations (on-device), game-like practice sessions, daily goal + streak freezes, a vocabulary hub, one-tap scenarios, and visual polish.

**Architecture:** Same monorepo. New core data is optional fields on core State v1 + new Coach methods (single writer stays the background). Practice engine and answer checking are pure, seeded modules in `apps/extension/src/lib/practice/`. Translation uses Chrome's built-in `Translator` API from the content script and side panel (feature-detected). UI stays Preact in the side panel.

**Tech Stack:** TypeScript strict ESM, Preact, Vite build (existing scripts/build.mjs), vitest + jsdom, Playwright e2e with the local LLL mock (existing).

**Spec:** `docs/superpowers/specs/2026-10-22-langcoach-extension-v2-design.md` (v1 spec still applies: `docs/superpowers/specs/2026-10-21-langcoach-extension-design.md`)

## Global Constraints
- No network calls from extension code; translation only via on-device `Translator` (feature-detected; missing API/pair → silent fallback).
- Background is the only storage writer; all new mutations are Coach methods through `store.transaction`; every save validated by `parseState`.
- New data = optional fields only; State `version: 1` unchanged; MCP package keeps working.
- XP is never awarded twice for the same card action ("I know this" once per card; practice XP once per session id).
- Permissions unchanged (storage, unlimitedStorage, sidePanel, contextMenus, alarms, notifications; host https://labs.google/lll/*).
- Writing into LLL's purpose field: ≤50 chars hard cap (themes ≤40), React-safe (native value setter + input event), only on `/experiments/tiny-lesson`; field not found → copy fallback, never guess.
- All UI strings in en, tr, es, fr, pt_BR; `prefers-reduced-motion` respected; keyboard operable; RTL/`lang` on target text.
- Tests pristine; e2e must pass; production manifest has no localhost.

## Review Focus
1. Distractor generation with tiny decks (4–5 cards), duplicate meanings, or identical terms → never shows the answer twice or an empty option.
2. Answer checking for RTL/CJK/accented input (Arabic diacritics, Japanese kana vs kanji, Spanish accents) → tolerant but not wrong-accepting.
3. Streak freeze across timezone/midnight and multiple missed days → consumes at most available freezes, never negative, idempotent per day.
4. Translator API absent / language pair unsupported / model downloading → UI shows English meaning, no errors, retries later.
5. Practice session interrupted (panel closed mid-session) → no partial XP double counting; FSRS updates only for answered items.

---

### Task 1: Fix findings from the Antigravity work review
**Source:** `.superpowers/sdd/2026-10-21-langcoach-extension/antigravity-review.md` (Critical + Important items; Minor ones the controller lists in the dispatch).
- [ ] Failing tests per finding → fix → `npx vitest run`, typecheck, build, `npm run test:e2e -w @langcoach/extension` green → rebuild production dist → commit `fix(extension): address review of tasks 5-9 and UX changes`

### Task 2: Core data + Coach operations for v2
**Files:** `packages/core/src/{types,schema,coach,progress}.ts`, new `packages/core/src/streak.ts`; tests `packages/core/test/v2-*.test.ts`
**Interfaces:**
- Types (all optional): `ReviewCard.nativeTranslation?: string; favorite?: boolean; mastered?: boolean`; `Profile.dailyGoalXp?: 10|20|30|50`; `State.streakFreezes?: number; freezeUsedDates?: string[]; sessions?: PracticeSession[]` where `PracticeSession = { id: string; at: string; date: string; exercises: number; correct: number; xp: number }`.
- `Coach.setFavorite(cardId, favorite: boolean)`, `Coach.setNativeTranslations(entries: {cardId: string; text: string}[])` (≤500 per call, text ≤500 chars, skips unknown ids), `Coach.markMastered(cardId): {xpAwarded}` (FSRS Easy review once; 2 XP only the first time; idempotent), `Coach.recordPractice(input: { sessionId: string; results: { cardId: string; outcome: 'correct'|'hard'|'wrong' }[] }): { xp; correct; total; perfect }` — maps outcomes to FSRS Good/Hard/Again per card (each card once per session: last outcome wins), XP = correct count + 5 completion + 5 if perfect (no wrong), logs one LogEntry `{type:'review', taskId:'practice:'+sessionId}`, appends session (cap 500), idempotent by sessionId (second call returns same numbers, no changes), also autoCompletes a `review` task for today.
- `streak.ts` (pure): `dailyXp(log, date)`, `goalMet(log, date, goal)`, `computeStreak({ log, today, goal, freezeUsedDates }): number` (a day counts if goalMet or a practice session that day, or the date is in freezeUsedDates; today not yet met doesn't break), `applyFreezes(state, today, goal): { state, consumed: string[], earned: number }` — for each missed day between last active day and yesterday consume a freeze if available (oldest first), earn 1 freeze each time the streak reaches a multiple of 7 (max 2 held); idempotent for the same `today`.
- `Coach.rollover(): Promise<{ consumed: string[]; earned: number }>` applies freezes for today (transaction); `progress()` returns additionally `{ todayXp, dailyGoalXp, streak (via computeStreak), streakFreezes, weekXp: {date, xp}[7] }`.
- [ ] TDD each method incl. Review Focus 3 & 5 → implement → all core/mcp tests + typecheck green → commit `feat(core): v2 data, practice recording, daily goal and streak freezes`

### Task 3: Practice engine and answer checking (pure)
**Files:** `apps/extension/src/lib/practice/{generate,check,rng}.ts`; tests `apps/extension/test/practice-*.test.ts`
**Interfaces:**
- `type Exercise = { id; kind: 'meaning'|'reverse'|'listen'|'match'|'type'|'blank'; cardIds: string[]; prompt: {...}; options?: string[]; answer: string | [string,string][] }`
- `buildSession(cards: ReviewCard[], opts: { now: Date; seed: number; size?: number /*10*/; canSpeak: boolean; nativeFirst: boolean }): Exercise[] | { error: 'not_enough_cards'; needed: 4 }` — picks due → new → weak (low stability) → random; ≥1 match exercise when ≥5 cards; `listen` only if canSpeak; `blank` only for cards whose example contains the term (case-insensitive, word-boundary aware for Latin; substring for CJK); meanings use `nativeTranslation` when `nativeFirst` and present, else `translation`; distractors from other cards with different normalized meanings/terms; never duplicates; deterministic for a seed.
- `normalizeAnswer(s, lang)`, `checkTyped(input, expected, lang): 'correct'|'almost'|'wrong'` (NFKD, strip combining marks/punctuation/extra spaces, case-fold; Arabic: strip harakat/tatweel; Japanese: compare also katakana→hiragana; 'almost' = Damerau-Levenshtein 1 for length ≥6; empty → wrong).
- [ ] TDD (Review Focus 1 & 2, determinism, property test over random decks) → implement → green → commit `feat(extension): practice session generator and tolerant answer checking`

### Task 4: On-device translation layer
**Files:** `apps/extension/src/lib/translate.ts`, `apps/extension/src/content/native-overlay.ts`, changes in `content/isolated.ts`, `background/capture.ts`/router (new message `setNativeTranslations`, allowed from content scripts and extension pages, validated), sidepanel hook `useNativeTranslations`; tests.
**Interfaces:** `createTranslatorCache(api = (globalThis as any).Translator)`: `{ available(src, dst): Promise<'available'|'downloadable'|'downloading'|'unavailable'>; translateMany(texts: string[], src, dst): Promise<(string|null)[]> }` (dedupes, caches per session, catches all errors → nulls). Language codes from `resolveLanguage(...).bcp47` base subtag; native language code from profile (`tr`, `en`, `es`, `fr`, `pt`, …).
- After a capture response in the content script: translate item meanings (source = LLL sourceLanguage, usually English) to the learner's native language when different; send `setNativeTranslations` after the capture saved (match by term → cardId from the capture result's `newCardIds` order).
- Overlay: best-effort small native line under LLL vocabulary/phrase cards and grammar examples (find elements whose text equals the term; shadow-DOM-free tiny spans with an attribute marker; MutationObserver debounced; removed if structure not found). Toggle in Settings ("Show my language on the page", default on).
- Panel: Words/Practice lazily translate cards missing `nativeTranslation` (batch 50, stores via message).
- [ ] TDD with a fake Translator (available/unavailable/downloading/throws) + jsdom overlay test with recon-like markup → implement → green → commit `feat(extension): on-device native-language translations and page overlay`

### Task 5: Practice UI (side panel)
**Files:** `apps/extension/src/sidepanel/views/Practice.tsx`, `components/exercises/*.tsx`, `lib/sound.ts` (WebAudio tones: correct, wrong, complete; mute setting), `components/Confetti.tsx` (CSS/canvas, reduced-motion → none), App tab wiring (Practice tab; default tab when due>0), new messages `getPracticeCards` / `recordPractice`.
- Flow: start screen (due count, "Start practice") → 10 exercises with progress bar, combo, immediate feedback (correct answer + 🔊), "Continue" button/Enter → end screen (XP, accuracy, words strengthened, perfect confetti, "Practice again", goal ring progress) → `recordPractice` once (sessionId uuid) even if the panel re-renders; closing mid-session records nothing (Review Focus 5).
- Keyboard: 1–4 for options, Enter to check/continue, typing field autofocus; `lang`/`dir` on target text.
- [ ] Component tests per exercise kind (jsdom) + session flow test → implement → green → commit `feat(extension): practice sessions with six exercise types`

### Task 6: Words hub, goal/streak UI, Today redesign, polish
**Files:** `views/Words.tsx` (replaces Review label; keeps flip mode), `views/Today.tsx`, `views/Progress.tsx`, `views/Onboarding.tsx` + `views/Settings.tsx` (daily goal picker, sounds toggle, overlay toggle), `components/{StreakFlame,GoalRing,WeekChart,StrengthMeter}.tsx`, `lib/levels.ts`, achievements additions, `content/isolated.ts` `fillTheme` → `startScenario` (fill + click Generate, Tiny Lesson page only), styles refresh.
- Words: groups by lesson (situation), search, filters All/Due/New/Weak/Favorites/Mastered, strength meter (FSRS stability → 0–5 bars), ⭐, 🔊, inline native translation edit, "I know this" → `markMastered` (button disabled after), virtualized or paginated list (renders 2,000 cards smoothly: render 50 at a time with "Show more").
- Today: goal ring (todayXp/dailyGoalXp), streak flame + freezes count, 3 scenario cards with "Start" (startScenario) and copy fallback, "Practice now" CTA, last capture "Practice these words" CTA.
- Progress: level name + progress (`levels.ts`: XP thresholds, localized names), week XP chart, achievements incl. `perfect_session`, `xp_100_day`, `sessions_10`, `first_match`.
- `rollover` called when the panel opens (once per day) → toast-like banner "Streak freeze used" / "Freeze earned".
- [ ] Tests (levels, achievements, startScenario with React-controlled input in jsdom, Words filters, 2,000-card render budget) → implement → green → commit `feat(extension): words hub, daily goal and streak UI, one-tap scenarios`

### Task 7: E2E, docs, version 0.2.0
- E2E (mock LLL + stubbed `Translator` via init script): capture → native translations stored and overlay visible → practice session of 10 mixed exercises answered (correct + one wrong) → end screen XP → progress shows todayXp and streak 1 → Words filters/favorite/I know this once → startScenario fills mock input and triggers mock generate.
- README/README.tr, STORE_LISTING, PRIVACY (on-device translation note), HANDOFF; version 0.2.0 in extension package + manifest; zip.
- [ ] All tests + e2e + production build + zip green → commit `feat(extension): v2 e2e, docs and 0.2.0`
