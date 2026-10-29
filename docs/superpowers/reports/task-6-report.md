# Task 6 report: extension v2 finish (sections A–D)

Plan: `docs/superpowers/plans/2026-10-28-extension-v2-finish.md` (Task 6, items 1–16). Task 7 was not started.
Branch `main`. Every commit has the `Co-Authored-By: Claude Opus 5.5` trailer and was pushed right after it was made.

## Commits

| Commit | Section | What |
|---|---|---|
| `e59ad91` | A | core: perfect rule, undo takes back capture XP, `progressOf` |
| `c160580` | B | background: rollover + banners, snapshot via `progressOf`, atomic onboarding plan, InvalidDataError recovery, one-shot reminder, notification click fallback |
| `598febd` | C | content `startScenario` + panel relay `runScenario`; `openExperimentUrl` never rejects; `isUsable` via `getClientRects` |
| `67434ce` | D | `lib/strength.ts`, `lib/levels.ts`, 4 new achievements, `setFavorite`/`markMastered` router messages, session `perfect`/`matchGames` |
| `8fcde56` | D11 | Words hub |
| `37da760` | D12 | Today redesign |
| `963be42` | D13 | Progress (levels, week chart, achievements) |
| `444cbae` | D14 | Daily goal picker (Onboarding + Settings) |
| `497cc21` | D16 | Styles refresh |
| `6f089ac` | e2e | Words / Today goal ring / startScenario e2e + mock react-select page |

(`1f52485` is a HANDOFF.md commit by someone else; I did not touch HANDOFF.md.)

## A. Core

1. **Perfect rule** (`packages/core/src/coach.ts`). `perfect = total ≥ 1 && every card's final (last) outcome === 'correct'`. A `hard` now means no perfect and no +5 bonus. Sessions store `perfect` (new optional field), and a replayed sessionId gives back the stored flag. Older sessions without the flag still use the XP shape (`xp === correct + 10`). The Practice end screen now takes confetti, "Perfect session!" and the new "+5 XP perfect bonus" line only from the `recordPractice` result (`saved.perfect`). The bonus constants are exported (`PERFECT_BONUS_XP`, `PRACTICE_BONUS_XP`, `MASTERED_XP`).
2. **Undo takes back XP.** `autoComplete` tags its log entry with `lessonId` (new optional `LogEntry.lessonId`, added to the schema). `undoLesson` removes those entries, sets the task it completed back to `todo` (clearing `completedAt` and `lessonId`) and returns `{ removedCards, xpRemoved }`. Reviewed cards and practice XP stay.
3. **`progressOf(state, now)`** (`packages/core/src/summary.ts`, exported from both entries). `Coach.progress()` is now `{ profile, ...progressOf(s, now) }`.

Tests: `packages/core/test/v2-task6.test.ts` (perfect rule incl. replay and wrong→correct on the same card; unplanned/planned undo; capture → undo → capture awards once; reviewed cards stay; other lessons untouched; `progressOf` equals `Coach.progress()`; atomic setProfile+theme; session `perfect`/`matchGames`). Updated test: `v2-coach.test.ts` (the stored session now has `perfect: true`). Practice view: the end screen trusts the core (`practice-view.test.tsx`).

RED: `Cannot find module '../src/summary.js'`, then with a stub: 9 failed / 1 passed (all perfect, undo and progressOf cases). GREEN: 207/207 in packages, full suite 594, then 596 with the Practice tests.

## B. Background

4. The snapshot's progress comes from `progressOf`, so it is freeze-aware and adds `streakFreezes` and `weekXp` to `Snapshot.progress`. The legacy `streak()` is no longer used by the router or by achievements.
5. **Rollover.** `router.rollover()` never throws. It runs at every service-worker start (top-level `void router.rollover()`), from `getSnapshot` at most once per local day (marker `langcoach:rolloverDate`), and from a daily one-shot alarm `langcoach-rollover` at 00:01 local that schedules itself again (`scheduleRollover` / `createRolloverAlarmHandler`). Consumed or earned freezes queue one-time banners in `langcoach:banners` (`freezeUsed:<date>` / `freezeEarned:<today>`, deduplicated, at most 10). The snapshot carries `banners`, and the new page-only `dismissBanner {id}` message removes one. Today shows them (see D12).
6. **Atomic onboarding.** `Coach.setProfile(input, { theme })` creates the week plan in the same transaction. The `setProfile` message accepts an optional, validated `theme`. Onboarding sends a single `setProfile` (settings are saved first) and no longer sends `createPlan`.
7. `toLoadError` treats `InvalidDataError` like `CorruptDataError`, so the same recovery screen (Import / Reset) appears.
8. **Reminder.** The alarm is one-shot (`{ when }`, no `periodInMinutes`) and is scheduled again after each firing with `nextReminderAt` through the `reschedule` dep, so it does not drift across DST. **Notification click:** it first tries `sidePanel.open({windowId})`. Chrome may refuse this because a notification click is not always a user gesture. In that case it focuses an open `https://labs.google/lll/*` tab (`tabs.update` + `windows.update`) so the learner can open the panel from the toolbar there. Otherwise it opens `https://labs.google/lll/en`. This behavior is documented in a code comment.

Tests: `apps/extension/test/task6-background.test.ts` (13), plus the InvalidDataError recovery case in `panel-fixes.test.tsx`. The old `reminder.test.ts` expectation (`periodInMinutes: 1440`) was updated.
RED: 13 failed (`router.rollover is not a function`, `scheduleRollover is not a function`, streak 1 vs 3, recovery screen null, …). GREEN: 613 total.

## C. Content script

9. `apps/extension/src/content/scenario.ts`: `startScenario(win, {theme, targetLabel?}, timing)` returns `{ok:true}` or `{ok:false, reason}` and never throws (`not_tiny_lesson | splash | field | language | generate | invalid | error`).
   - It waits up to the timeout for the form or the splash (a freshly opened tab).
   - Splash: no combobox, plus a usable link to `/lll/<lang>` or a usable checkbox ("Before you begin").
   - It checks for exactly one purpose field before touching anything.
   - React-select: if the label differs, it fires a mousedown on the control, waits for `[role=listbox] [role=option]`, then fires mousedown + mouseup + `click()` on the matching option and waits for `single-value` to show the label. If the option is missing it closes the menu and returns `language`.
   - Fill uses the prototype setter plus a bubbling `input` event, capped at 50 characters.
   - Generate is the first usable button after the input, outside the picker, whose text is Generate in the site languages (generate, generar, générer, gerar). If no text matches, it accepts only a single button in the purpose field's container. It waits up to 3 s for the button to be enabled, then clicks.
   - `isUsable` = not disabled/hidden/aria-hidden/inert and `getClientRects().length > 0`.
   - `isolated.ts` answers `ping` → `{ready:true}` and `startScenario` asynchronously (returns `true`), and validates the payload (`invalid`). `fillPurposeField`/`PURPOSE_MAX` are re-exported for compatibility.
   - Panel relay `runScenario` (`sidepanel/tabs.ts`) focuses or opens the Tiny Lesson tab, pings until the content script answers (≤15 s), sends `startScenario` via `chrome.tabs.sendMessage` and sanitises the answer (`unreachable` / `error`). The relay lives in the panel (an extension page can message tabs itself), not in the background router, so the router has no new tab code and permissions are unchanged. `requestFill` was removed because it was replaced.
   - Profile target → dropdown label comes from `resolveLanguage(...).label` when it is one of the `LLL_LANGUAGES` labels; otherwise the language is left as the page shows it.
10. `openExperimentUrl` resolves `true` or `false` and never rejects (it catches errors from `tabs.create` and `windows.update`).

Tests: `start-scenario.test.ts` (18; jsdom model of the live react-select page in `test/lll-dom.ts`, layout stub `test/layout-stub.ts`). `tabs.test.ts` gained 7 tests (relay and never-reject). `fill-theme.test.ts` now uses the layout stub.
RED: module not found; then 7 failures from a jsdom `MouseEvent` `view` issue, fixed by dropping `view`; then 8 failures for `runScenario` and the readiness wait. GREEN: 638 total.

## D. Panel UI

- **Libs** (`67434ce`):
  - `lib/strength.ts` gives strength 0–5 (new 0; learning/relearning 1; review by stability in days: <3 → 2, <10 → 3, <30 → 4, else 5) and `isWeak` (practised and strength ≤ 2).
  - `lib/levels.ts` has 10 levels at 0/50/150/300/500/800/1200/1700/2400/3300 XP with names localized in 5 languages.
  - New achievements: `perfect_session`, `xp_100_day` (best day), `sessions_10` (sessions or `practice:` log entries), `first_match` (session `matchGames`). Achievement streaks are now freeze-aware.
  - Practice sends `matchGames`.
  - Router `setFavorite` / `markMastered` are validated and page-only. `updateNative` reuses `setNativeTranslations`. `recordPractice.matchGames` is validated.

  Tests: `task6-lib.test.ts` (19); `achievements.test.ts` updated to 12 ids; 2 Practice tests.
- **11 Words hub** (`views/Words.tsx`, the tab label is now "Words", the testid stays `tab-review`):
  - Opens as a list (choice persisted) grouped by lesson situation, newest first.
  - Search over term, English meaning and native meaning.
  - Filter chips with counts and `aria-pressed`: All, Due (`isDue`), New (`reps 0` and not mastered), Weak, Favorites, Mastered (mastered or strength 5).
  - `StrengthMeter` (ARIA `meter`), 🔊, and a ⭐ favorite that updates at once and rolls back with an error if saving fails.
  - Inline edit of the native meaning (`setNativeTranslations`) and the lesson meaning (`updateCard`). Enter saves; Escape cancels and returns focus to the edit button.
  - "I know this" calls `markMastered` once (guarded against double clicks), then shows "Known · +2 XP" and is disabled.
  - 50 cards per page with "Show more (N left)". A polite live region announces results.
  - Flip cards stay available inside the hub (`Review embedded`).

  Tests: `words.test.tsx` (18, including 2,000 cards: 50 rendered, mount <1.5 s, search <0.5 s). RED: `Failed to resolve import "../src/sidepanel/views/Words"`. Three older tests now click `mode-cards` first, because the list is the default.
- **12 Today:**
  - `GoalRing` (HTML `role=progressbar` wrapper, celebrates a met goal) and `StreakFlame` (flicker animation, off with reduced motion; unlit at 0; ❄️ freezes with an aria-label).
  - Rollover banners with a dismiss button.
  - "Practice now" is kept, and "Practice these N new words" appears after today's capture.
  - 3 scenario cards (`suggestThemes`, "More ideas") with Start (`runScenario`), Copy and, on failure, a reason-specific hint plus "Open Tiny Lesson". Each card has a persistent `role=status` region.
  - The old Fill button is gone.

  Tests: `today.test.tsx` (14). RED: 13 failed / 1 passed.
- **13 Progress:** level card (badge, localized name, progressbar, "N XP to <next>" / top level), streak freezes stat, `WeekChart` (7 bars, today highlighted, days that met the goal in green, dashed goal line, `role=img` summary plus a screen-reader table), 12 achievements with icons, progress bars and unlocked/locked aria-labels. Tests: `progress-view.test.tsx` (5). RED: 5 failed.
- **14 Goal picker:** `components/GoalPicker.tsx` is a native radio group: Casual 10 / Regular 20 / Serious 30 / Intense 50. Onboarding sends `dailyGoalXp` with `setProfile` (default 20). Settings saves immediately via `setProfile` (rolled back on error) in its own `settings-goal` card at the top; this edit is self-contained, so the Anki `ExportCards` line can merge cleanly. Tests: `goal-picker.test.tsx` (2). RED: 2 failed. The onboarding expectation in `panel.test.tsx` now includes `dailyGoalXp: 20`.
- **15 Router messages:** see Libs above.
- **16 Styles:**
  - New tokens (accents, radius, brand gradient) with dark-mode values.
  - 44px minimum targets for buttons, tabs, chips and icon buttons; 3px focus rings, including on links and the goal options; disabled state.
  - Styles for every new view.
  - Reduced motion turns off the flame flicker and the banner entrance (confetti was already handled).
  - The goal-ring CSS was adapted to the component's computed stroke width.
- **Strings:** every new key is in en, tr, es, fr and pt_BR (about 100 keys, written natively, with placeholders defined). The existing "every message key used in source exists in all 5 locales" test passes; dynamic keys (`level*`, `ach_*`) are covered by `task6-lib.test.ts`.

## E2E (`apps/extension/e2e`)

The mock LLL serves `?scenario=1` as a Tiny Lesson form like the live page:
- a react-select-like picker with a delayed menu
- a React-style purpose input that re-renders after 30 ms
- Generate, disabled until both are set, which posts a real `terms` request

New tests:
- **16.** Words filters (new/favorites/mastered); favorite persisted; "I know this" gives +2 XP once (a second `markMastered` returns `xpAwarded: 0`); the Today goal ring goes from `aria-valuenow` 0 to 2 for a 10 XP goal; streak 1.
- **17.** `ping` and `startScenario` via `chrome.tabs.sendMessage` select "Spanish (Spain)", fill the purpose and press Generate, which leads to the capture toast. A Slang Hang page answers `{ok:false, reason:'not_tiny_lesson'}`. No page errors.

Updated tests:
- 6–8 and 9–10 now open flip cards explicitly.
- 11–13: the reminder alarm is one-shot at 19:45, and `langcoach-rollover` exists.

## Commands and final output

- `npx vitest run` gives **Test Files 59 passed (59), Tests 695 passed (695)** (it was 584 at the start).
- `npm run typecheck` runs `tsc -p packages/core && tsc -p packages/mcp && tsc -p apps/extension` with no errors.
- `npm run test:e2e -w @langcoach/extension` gives **9 passed (25.3s)**. The first run had 3 failures in old specs, caused by the intended changes (Words list default, one-shot alarm); they are fixed.
- `npm run build -w @langcoach/extension` (production, run last) exits 0. `dist/manifest.json` has no localhost. Permissions are `storage, unlimitedStorage, sidePanel, contextMenus, alarms, notifications`, and the host and content-script matches are only `https://labs.google/lll/*`.

## Concerns / notes

- **Concurrent agent worktree:** another agent's worktree appeared in `.claude/worktrees/…` during the run, and vitest started running its tests as well (109 files, with failures from that branch). I added `.claude/**` to the `vitest.config.ts` exclude. `.claude/` is still untracked and was not committed.
- **Live-site assumptions:** `startScenario` is tested against a jsdom model and a Playwright mock, not the live page. Generate is found by its text in en/es/fr/pt, or as the only button next to the field. If LLL changes its markup, the panel shows the copy fallback rather than guessing. Worth one manual check on labs.google: a first visit (splash), then language + Generate.
- **Splash** is detected and reported, never clicked. The learner has to click Start and accept the notice once.
- **Notification click:** in some Chrome versions `sidePanel.open` throws from a notification click. LangCoach then only focuses or opens an LLL tab; the learner opens the panel from the toolbar there.
- **Perfect rule:** a card answered wrong and later correct ends `correct`. In the UI a re-try is recorded as `hard`, so in practice only all-first-try-correct sessions are perfect.
- **Not done (Task 7):** version 0.2.0, README/STORE_LISTING/PRIVACY/INSTALL, Practice a11y polish, zip. `Settings` still shows "v0.1.0".
- **Line endings:** git warned about LF→CRLF on new files. This is only the working-copy setting; the content is unchanged.
