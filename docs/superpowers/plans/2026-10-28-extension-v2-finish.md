# LangCoach Extension v2 — Finishing Plan (Task 6 + Task 7)

Context: plan `2026-10-22-langcoach-extension-v2.md` Tasks 1–5 are done and on `main` (584 tests, typecheck clean). Task 6 and 7 were interrupted; the local working copy was lost, so some of Task 6 must be rebuilt. This document is the durable replacement for the lost SDD ledger. Spec: `docs/superpowers/specs/2026-10-22-langcoach-extension-v2-design.md`.

## Live-site facts (verified on labs.google/lll, 2026-10-22/23)
- Tiny Lesson purpose input: NOT in a `<form>`, no `maxLength`, no `type` attribute (`el.type==='text'`), rotating placeholder. The only text inputs on the page: the language combobox (`role="combobox"`, aria-label "Select Language") and the purpose input. Writing via the element's own prototype `value` setter + bubbling `input` event updates React (verified). 50-char limit is enforced by the app UI (51 chars crashed the page).
- Language picker = react-select (`lll-select__*` classes). Options are `[role=option]` DIVs inside `[role=listbox]`, 23 options (dropdown labels e.g. "Spanish (Spain)"). Opening: click the control; selecting: dispatch `mousedown`+`mouseup` then `click()` on the option → `.lll-select__single-value` shows the label and the Generate button becomes enabled.
- First visit to an experiment shows an intro splash ("Start" link → `/lll/<lang>`) and then a "Before you begin" notice (checkbox "I understand" + Continue). Direct navigation to `/experiments/tiny-lesson` showed the splash.

## Task 6 — scope (rebuild what was lost, then finish)
### A. Core (previously committed locally, lost — redo with tests)
1. `recordPractice` perfect rule: perfect = total ≥ 1 and every card's final outcome is `correct` (no `hard`, no `wrong`). Single source of truth; the Practice end screen (confetti, "Perfect session!", +5 bonus) must use the core result.
2. Undo takes back XP: `Coach.undoLesson` (or a new method) also removes the log entries (and un-completes the task) that `autoComplete` created for that lesson's capture; reviewed cards stay. Tests incl. capture → undo → capture does not double-award.
3. `progressOf(state, today)` shared helper so background snapshot and `Coach.progress()` use identical numbers (todayXp, dailyGoalXp, streak via `computeStreak` with `freezeUsedDates`, streakFreezes, weekXp).
### B. Background
4. Snapshot streak/XP use `progressOf` (not the legacy `streak()`).
5. `coach.rollover()` on service-worker startup, on panel open (once per day), and via a daily alarm; emit a one-time banner event "Streak freeze used for <date>" / "You earned a streak freeze" (persist last-shown marker).
6. Onboarding creates the weekly plan atomically with its chosen theme (no race with `ensurePlan`).
7. `InvalidDataError` (schema-invalid data) from `getSnapshot` → same recovery screen as corrupt data (Import / Reset).
8. Reminder: schedule next occurrence with `nextReminderAt` each time (no `periodInMinutes: 1440` drift across DST); notification click: focus/open an LLL tab when `sidePanel.open` cannot be called without a gesture (document behavior).
### C. Content script
9. `fillTheme` → `startScenario({theme, targetLabel})` on the Tiny Lesson page only: (a) splash detected → `{ok:false, reason:'splash'}` with a panel hint; (b) select target language in the react-select if the current value differs (map profile target → dropdown label via `lib/languages.ts` LLL_LANGUAGES); (c) fill purpose (exact-one-text-input rule, prototype setter, ≤50 chars); (d) wait ≤3 s for Generate enabled, click it; any failure → `{ok:false, reason}` and the panel offers copy fallback + "Open Tiny Lesson". `isUsable` via `getClientRects().length > 0`. jsdom tests modelling react-select markup.
10. Panel: `openExperimentUrl` promise rejections caught.
### D. Panel UI (main scope of Task 6)
11. **Words hub** (`views/Words.tsx`, tab label "Words", flip-card mode kept inside): groups by lesson situation; search (term/meaning/native); filters All/Due/New/Weak/Favorites/Mastered; strength meter 0–5 from FSRS stability/state (`lib/strength.ts`); ⭐ favorite (`Coach.setFavorite`); 🔊; inline native-translation edit; "I know this" → `Coach.markMastered` (disabled after, +2 XP once); paging 50 at a time with "Show more" (2,000 cards smooth).
12. **Today**: goal ring (todayXp/dailyGoalXp), animated streak flame (reduced-motion aware) + freezes count, 3 scenario cards (`suggestThemes`) with "Start" (`startScenario`) and copy fallback, "Practice now" CTA (keep), last-capture "Practice these words" CTA.
13. **Progress**: level name + progress bar (`lib/levels.ts`, XP thresholds + localized names), week XP bar chart (7 days), achievements incl. `perfect_session`, `xp_100_day`, `sessions_10`, `first_match`.
14. **Onboarding + Settings**: daily goal picker Casual 10 / Regular 20 / Serious 30 / Intense 50 → `setProfile dailyGoalXp`.
15. New router messages (extension-page-only, validated): `setFavorite`, `markMastered`, `updateNative` (or reuse `setNativeTranslations`), startScenario relay via `chrome.tabs.sendMessage`.
16. Styles refresh: cohesive tokens, rounded cards, bold primary, playful accents, dark mode, focus rings, ≥44px targets. All strings in en, tr, es, fr, pt_BR.
Constraints: TDD; background single writer; no network; permissions unchanged; never break LLL; commit in small coherent chunks.

## Task 7 — finish
- Practice a11y polish: persistent live region (or `aria-describedby`) for feedback; focus management after Continue and on the end screen; Choice as `radiogroup`/`radio`; drop combo `aria-live`; close `AudioContext` on unmount; warn/auto-retry on failed save; remove unused `Match` `active` prop.
- E2E additions (local LLL mock extended with a react-select-like control + purpose input + Generate): Words filters/favorite/I know this once; Today goal ring + streak; startScenario end-to-end.
- README(s), STORE_LISTING, PRIVACY, INSTALL updated for v2; version `0.2.0` (extension package + manifest); `npm run zip` → `langcoach-extension-0.2.0.zip`; prod manifest has no localhost.
- Demo-ready: a short `docs/media/` placeholder for the GIF (recorded by the owner).
