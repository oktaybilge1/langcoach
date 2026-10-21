# LangCoach Browser Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Manifest V3 browser extension that captures every Little Language Lessons lesson into a personal spaced-repetition deck and adds a side panel with today's tasks, weekly plan, review, streak/XP and achievements.

**Architecture:** `apps/extension` in the existing npm-workspaces monorepo. Pure logic lives in `@langcoach/core` (browser-safe entry) and in pure modules inside the extension (parsers, achievements, themes) with unit tests. The background service worker is the single writer to `chrome.storage.local` through `Coach`. A main-world content script wraps `fetch` on `labs.google/lll/*` and relays captures. Panel UI is Preact. End-to-end tests load the built extension in Chromium against a local mock of LLL.

**Tech Stack:** TypeScript (strict, ESM), Vite 6+ (multi-entry build, no CRX plugin), Preact, vitest + jsdom, Playwright (chromium, persistent context with extension), existing `@langcoach/core` (zod, ts-fsrs).

**Spec:** `docs/superpowers/specs/2026-10-21-langcoach-extension-design.md` · Recon (API shapes, routes, languages): `docs/research/2026-10-21-lll-site-recon.md`

## Global Constraints
- Manifest V3; permissions exactly `storage`, `sidePanel`, `contextMenus`, `alarms`, `notifications`; host permissions exactly `https://labs.google/lll/*`. Minimum Chrome 116 (`minimum_chrome_version`).
- No network requests from extension code; never call Google's API; only read responses of requests the page itself made. No analytics/telemetry.
- Product name "LangCoach". "Google"/"Little Language Lessons" never in the extension `name`; description may say "for Little Language Lessons (Google Labs) — not affiliated with Google".
- The fetch wrapper must return the original `Response` untouched, never throw into the page, and ignore unknown shapes silently.
- Single writer: only the background worker mutates storage (via `Coach` + `ChromeStorageStore`).
- Data format = core `State` (version 1) so export/import is interoperable with the MCP version.
- UI locales: `en` (default), `tr`, `es`, `fr`, `pt_BR` via `_locales/*/messages.json`; every user-visible string goes through i18n.
- Card text rendered with `dir="auto"` and `lang` set to the target BCP-47 code.
- Node ≥20 for tooling; tests pristine (no warnings).

## Review Focus
1. LLL changes its API shape or adds fields → capture is a no-op with no page errors; manual save still works → tests in Tasks 3 and 5.
2. Same lesson captured twice (regenerate, double fetch, two tabs) → no duplicate cards; regenerate with new content adds only new terms → Tasks 2, 3.
3. Service worker restarts between capture and undo (MV3 kills idle workers) → undo still works (undo info persisted, not in memory) → Task 5.
4. RTL/CJK/gendered newline terms (`"el camarero (m)\nla camarera (f)"`) display and dedupe correctly → Tasks 3, 6.
5. First run with no profile but a capture arrives → cards saved, target language auto-filled, onboarding prompts once → Tasks 2, 5, 6.

---

### Task 1: Browser-safe core entry and extension task types

**Files:**
- Create: `packages/core/src/browser.ts`
- Modify: `packages/core/src/types.ts`, `packages/core/src/schema.ts`, `packages/core/src/progress.ts`, `packages/core/package.json` (exports map)
- Test: `packages/core/test/browser-entry.test.ts`, existing tests stay green

**Interfaces:**
- Produces: package export `@langcoach/core/browser` → re-exports everything in `index.ts` except `JsonFileStore`, `defaultDataPath` and anything importing `node:*`.
- `TaskType` adds `'word_cam'`; `Lesson.kind` adds `'word_cam'`; `xpFor('word_cam') === 20`.
- `LessonItem` and `ReviewCard` gain optional `pronunciation?: string`; Lesson gains optional `grammar?: { topic: string; description: string; examples: { sentence: string; translation: string; transliteration?: string; explanation?: string }[] }[]`, `source?: { app: 'lll'; targetLanguage: string; sourceLanguage: string; purpose?: string }`.

- [ ] **Step 1: Failing tests:** `xpFor('word_cam')` is 20; parseState accepts a lesson with kind `word_cam`, `grammar`, `source` and cards with `pronunciation`; a static check test reads `browser.ts`'s transitive imports (walk `import` statements from `packages/core/src/browser.ts`) and asserts no specifier starts with `node:` and none is `./store.js` unless the store module is split (see Step 3).
- [ ] **Step 2: Run** `npx vitest run packages/core` → FAIL
- [ ] **Step 3: Implement.** Split `store.ts`: move `Store` interface, `TransactionFn`, `MemoryStore` to `packages/core/src/store-memory.ts` (no node imports); `store.ts` keeps `JsonFileStore`/`defaultDataPath` and re-exports from `store-memory.ts`. `browser.ts` exports types, dates, errors, schema, store-memory, srs, planner, progress, coach. `package.json` exports: `{ ".": "./src/index.ts", "./browser": "./src/browser.ts" }`.
- [ ] **Step 4: Run** `npx vitest run` and `npm run typecheck` → PASS
- [ ] **Step 5: Commit** `feat(core): browser-safe entry, word_cam type, pronunciation and grammar fields`

### Task 2: Coach operations for the extension

**Files:** Modify `packages/core/src/coach.ts`; Test `packages/core/test/coach-extension.test.ts`

**Interfaces (all on `Coach`, all mutating ones via `store.transaction`):**
- `saveLesson(input)` accepts kind `word_cam`, optional `grammar`, `source`, items with `pronunciation`; **works without a profile** (capture before onboarding); returns `{ lesson, newCards, duplicates, newCardIds: string[] }`.
- `undoLesson(lessonId: string): Promise<{ removedCards: number }>` — removes the lesson and its cards that have `srs.reps === 0`; cards already reviewed are kept; unknown id → NotFoundError.
- `saveManualCard(input: { term: string; translation?: string; example?: string; pronunciation?: string }): Promise<{ card: ReviewCard | null; duplicate: boolean }>` — creates (or reuses) a lesson `kind: 'tiny_lesson'`, `situation: 'Saved manually'` per local day; dedupe as saveLesson; works without profile; `translation` defaults to `''`.
- `updateCard(cardId: string, patch: { translation?: string; example?: string }): Promise<ReviewCard>`
- `autoComplete(type: TaskType, opts?: { lessonId?: string; cardsReviewed?: number }): Promise<{ task: PlanTask | null; xpAwarded: number }>` — completes the first `todo` task of that type dated today in the current week's plan; none → `{task:null, xpAwarded:0}` but still logs an activity entry with xp `xpFor(type)` so streak/XP count unplanned practice (taskId `'unplanned'`). Requires profile? No — works without; without profile only logs.
- `deleteAll(): Promise<void>` (reset; backup first).
- Schema/validation: `ReviewCard.translation` may be `''` (manual cards) — relax Coach validation only for manual cards; schema already allows string.

- [ ] **Step 1: Failing tests:** saveLesson without profile succeeds; second save of same terms → all duplicates; `newCardIds` lists only created ids; undoLesson removes unreviewed cards and keeps a reviewed one; undo unknown → NotFoundError; saveManualCard twice same term (case/space-insensitive) → duplicate true; two manual saves same day share one lesson; updateCard edits translation; autoComplete with a matching todo today marks it done and awards xp; second autoComplete same type → next todo or unplanned log; autoComplete without profile logs unplanned activity (streak 1); deleteAll empties state and leaves a backup (MemoryStore: backup returns null — assert state empty).
- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run** `npx vitest run` + typecheck → PASS
- [ ] **Step 5: Commit** `feat(core): coach operations for extension capture, undo, manual cards`

### Task 3: Capture parsers and language table (pure)

**Files:**
- Create: `apps/extension/package.json` (name `@langcoach/extension`, private, type module; deps preact, `@langcoach/core` `*`; devDeps vite, vitest, jsdom, @types/chrome, @playwright/test), `apps/extension/tsconfig.json`, `apps/extension/src/lib/parse.ts`, `apps/extension/src/lib/languages.ts`
- Create fixtures: `apps/extension/test/fixtures/{terms-es.json,grammar-es.json,conversation-zh.json,terms-ar.json,object-descriptors-ja.json}` — `terms-es`, `grammar-es`, `conversation-zh` copied from the recon doc's observed responses (full JSON as observed, trimmed only if needed); `terms-ar` and `object-descriptors-ja` hand-written in the recon shapes with real Arabic/Japanese text and transliterations.
- Test: `apps/extension/test/parse.test.ts`, `apps/extension/test/languages.test.ts`
- Modify root `package.json` workspaces → `["packages/*", "apps/*"]`; root `typecheck` includes `tsc -p apps/extension`.

**Interfaces:**
- `type CaptureKind = 'terms' | 'grammar' | 'conversation' | 'object-descriptors'`
- `kindFromUrl(url: string): CaptureKind | null` — matches `/lll/api/insights/<kind>` on `labs.google` only.
- `parseCapture(kind: CaptureKind, requestBody: unknown, responseBody: unknown): ParsedCapture | null` where `ParsedCapture = { lessonKind: 'tiny_lesson'|'slang_hang'|'word_cam'|'grammar'; sourceLanguage: string; targetLanguage: string; purpose?: string; situation: string; items: { term: string; translation: string; example: string; pronunciation?: string; note?: string }[]; grammar?: Lesson['grammar'] }`. Returns `null` (never throws) on any unexpected shape.
  - terms: vocabulary (term/translation/transliteration→pronunciation) + phrases (phrase→term); newline gendered terms kept as one term with `\n` replaced by ` / ` (and pronunciation likewise); situation = purpose.
  - grammar: `lessonKind 'grammar'`, items `[]`, `grammar` filled.
  - conversation: one item per `notes` key: term = key, translation = explanation, example = the message containing it, pronunciation = that line's transliteration; situation = `context` (truncated to 200 chars).
  - object-descriptors: items from `descriptors` (descriptor→term, translation, exampleSentence→example, pronunciation); situation = `request.object` or `'Word Cam'`.
- `languages.ts`: `LLL_LANGUAGES: { label: string; apiNames: string[]; bcp47: string; rtl: boolean }[]` for the 23 dropdown languages (recon list). Known API names: "European Spanish" (Spanish (Spain)), "Mandarin Chinese" (Chinese (China)); for others include the dropdown label and plausible API names (e.g. "Latin American Spanish", "Cantonese", "Taiwanese Mandarin", "Brazilian Portuguese", "European Portuguese", "Canadian French", "British English", "American English", "Australian English"). `resolveLanguage(apiName: string): { label; bcp47; rtl } ` — exact match on apiNames/label, else keyword match (first word e.g. "Arabic"), else `{ label: apiName, bcp47: 'und', rtl: false }`.

- [ ] **Step 1: Failing tests:** each fixture parses to expected counts and first item fields (es terms: 12 vocab + 8 phrases = 20 items; gendered term becomes `"el camarero (m) / la camarera (f)"`); grammar fixture → 3 topics; zh conversation → one item per notes key with pinyin pronunciation; ar items keep Arabic text byte-identical; `parseCapture` returns null for `{}`, `null`, `{vocabulary: 'x'}`, arrays of wrong objects, and never throws on random JSON (property test over 200 random values with a tiny generator); `kindFromUrl` true for `https://labs.google/lll/api/insights/terms`, null for other hosts/paths; `resolveLanguage('European Spanish').bcp47 === 'es-ES'`, `'Mandarin Chinese' → 'zh-CN'`, `'Arabic'.rtl === true`, `'Hebrew' → he, rtl`, `'Urdu' → ur, rtl`, unknown → `und`.
- [ ] **Step 2: Run** `npx vitest run apps/extension` → FAIL
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run** → PASS; typecheck
- [ ] **Step 5: Commit** `feat(extension): LLL capture parsers and language table`

### Task 4: Extension scaffold, storage and messaging

**Files:**
- Create: `apps/extension/vite.config.ts` (multi-entry: `background`, `content-main`, `content-isolated`, `sidepanel` HTML; output `dist/` with stable file names, ES modules for background (`"type": "module"` service worker), IIFE for content scripts), `apps/extension/public/manifest.json` (or generated), `apps/extension/public/icons/{16,32,48,128}.png` (simple generated placeholder icons — a speech bubble with a check; generate with a small Node script using raw PNG encoding, no new deps), `apps/extension/public/_locales/{en,tr,es,fr,pt_BR}/messages.json` (extension name/description at least), `apps/extension/src/background/store.ts` (`ChromeStorageStore`), `apps/extension/src/shared/messages.ts`, `apps/extension/src/background/index.ts` (message router skeleton)
- Test: `apps/extension/test/chrome-store.test.ts` (with an in-memory `chrome.storage.local` fake), `apps/extension/test/manifest.test.ts`

**Interfaces:**
- `class ChromeStorageStore implements Store` (from `@langcoach/core/browser`): key `langcoach:state` holds the State JSON; `load` validates via `parseState` (corrupt → keep raw under `langcoach:corrupt:<ts>` and throw CorruptDataError); `transaction` serialized by a promise mutex; `backup()` copies to `langcoach:backup:<ts>` keeping the newest 5; `replace` per core contract.
- Messages (`shared/messages.ts`, discriminated union, all request/response typed): `capture` {kind, request, response, pageUrl}, `undo` {lessonId}, `getSnapshot` → {profile, today, plan, progress, dueCount, lastCapture}, `setProfile`, `getDue` {limit}, `review` {cardId, rating}, `updateCard`, `saveManual` {term}, `exportData`, `importData` {json}, `reset`, `setSettings`/`getSettings` (`{ autoSave: boolean; reminderTime: string|null; uiLanguage: string|'auto'; hasCamera: boolean }` stored under `langcoach:settings`).
- Manifest: name `__MSG_extName__` = "LangCoach", description from messages, `side_panel.default_path: sidepanel.html`, `action` with icons, background service worker module, content scripts: `content-main.js` (`world: "MAIN"`, `run_at: "document_start"`, matches `https://labs.google/lll/*`) and `content-isolated.js` (default world, `document_start`).

- [ ] **Step 1: Failing tests:** ChromeStorageStore load on empty → emptyState; save/load round-trip; 20 concurrent transactions all applied; corrupt JSON preserved and CorruptDataError; backup keeps only 5 newest; manifest test reads built-or-source manifest and asserts the exact permissions/host list, MAIN-world script at document_start, no `"<all_urls>"`, name has no "Google".
- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: Implement** (+ `npm run build -w @langcoach/extension` produces `apps/extension/dist` with manifest, icons, locales, js, html)
- [ ] **Step 4: Run** tests + typecheck + build → PASS; `dist/manifest.json` exists
- [ ] **Step 5: Commit** `feat(extension): MV3 scaffold, chrome storage store, typed messaging`

### Task 5: Capture pipeline, toast, undo, manual save

**Files:**
- Create: `apps/extension/src/content/fetch-wrap.ts` (pure `wrapFetch(original, onCapture)`), `apps/extension/src/content/main.ts` (installs wrapper, posts `window.postMessage({source:'langcoach', ...})`), `apps/extension/src/content/isolated.ts` (validates origin/source, forwards to background via `chrome.runtime.sendMessage`, renders toast), `apps/extension/src/content/toast.ts` (shadow-DOM toast), `apps/extension/src/background/capture.ts` (handler), context menu registration in background.
- Test: `apps/extension/test/fetch-wrap.test.ts`, `apps/extension/test/capture-handler.test.ts`, `apps/extension/test/toast.test.ts` (jsdom)

**Interfaces / behavior:**
- `wrapFetch(original: typeof fetch, onCapture: (c: {kind, request, response, url}) => void): typeof fetch` — calls original with identical args, returns the identical Response object; for insights URLs, clones the response and parses JSON asynchronously; request body read only if it is a string; any error inside capture is swallowed; non-insights requests untouched (not cloned).
- Background `handleCapture(msg)`: `parseCapture` → if null ignore; `grammar` captures attach to the most recent `tiny_lesson` with same `source.purpose` + target within 5 minutes (else stored as a lesson with zero items); otherwise if `settings.autoSave` → `coach.saveLesson` + `coach.autoComplete(lessonKind)`; if no profile and none saved yet → set `pendingTargetLanguage` in settings for onboarding prefill. Persist `lastCapture = { lessonId, newCards, at }` in storage (survives worker restart). Respond `{ saved: number, duplicates: number, lessonId, xp }`.
- Toast: shows "✓ {n} words saved to LangCoach" (i18n) with "Undo" and "Open" buttons; n=0 and duplicates>0 → "Already in your deck"; auto-hides after 6 s; Undo → `undo` message → toast "Removed"; Open → asks background to `chrome.sidePanel.open({ tabId })`. Rendered in a closed shadow root attached to a host element appended to `document.documentElement`; respects `prefers-color-scheme`; never covers LLL's main buttons (bottom-left, max-width 360px).
- autoSave off → toast offers "Save {n} words" button instead.
- Context menu "Save to LangCoach" (`contexts: ['selection']`, `documentUrlPatterns: ['https://labs.google/lll/*']`) → `coach.saveManualCard({ term: selection.trim().slice(0, 200) })` → toast via tab message.

- [ ] **Step 1: Failing tests:** wrapFetch returns the same Response instance; onCapture called with parsed JSON for insights URL; not called for other URLs; original rejection propagates unchanged; JSON parse error → no throw, no capture; handler: es terms fixture → saved 20; same again → saved 0, duplicates 20; grammar after terms within 5 min attaches to lesson; zh conversation saved with pronunciation; unknown shape → ignored; lastCapture persisted in fake storage and undo works with a fresh Coach instance (simulated worker restart); toast renders text, Undo click sends undo message, auto-hide timer.
- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run** → PASS; build
- [ ] **Step 5: Commit** `feat(extension): capture LLL lessons with toast, undo and manual save`

### Task 6: Side panel UI (onboarding, Today, Review, Plan, Progress, Settings)

**Files:**
- Create: `apps/extension/src/sidepanel/index.html`, `main.tsx`, `App.tsx`, `views/{Onboarding,Today,Review,Plan,Progress,Settings}.tsx`, `components/*`, `styles.css`, `i18n.ts`; `apps/extension/src/lib/themes.ts` (suggested Tiny Lesson themes), `apps/extension/src/lib/achievements.ts`, `apps/extension/src/lib/deeplink.ts`; full `_locales/*/messages.json` strings
- Test: `apps/extension/test/achievements.test.ts`, `apps/extension/test/themes.test.ts`, `apps/extension/test/deeplink.test.ts`, `apps/extension/test/panel.test.tsx` (jsdom + @testing-library/preact or plain Preact render)

**Interfaces / behavior:**
- `achievements(state: State, today: string): { id: string; unlocked: boolean; progress: number; goal: number }[]` — ids: `first_lesson`(1 lesson), `streak_3`, `streak_7`, `streak_30`, `cards_50`, `cards_100`, `cards_500`, `reviews_100`.
- `suggestThemes(goal: Goal, level: Cefr|'unsure', uiLang: string, seed: number): string[]` — 3 themes from a curated list (≥12 per goal across levels) localized to the 5 UI languages (themes are what the user types into Tiny Lesson's "purpose" field — written in the UI language). Goals: `travel`, `work`, `study`, `moving`, `family`, `fun`.
- `deeplink(siteLang: 'en'|'es'|'fr'|'pt', type: 'tiny_lesson'|'slang_hang'|'word_cam'): string` → `https://labs.google/lll/<siteLang>/experiments/<tiny-lesson|slang-hang|word-cam>`; siteLang derived from UI language (tr → en).
- Onboarding: steps target language (23 LLL languages; prefilled from `pendingTargetLanguage`), native language (free select incl. UI languages + Turkish + "other"), level (A1–C2 + "Not sure" → A2), goal, minutes/day (5/10/15/20/30), days/week (1–7), camera yes/no → `setProfile` + settings; then creates week plan with theme = first suggested theme.
- Today: date, ring (done/total today), streak flame, task list (type icon, minutes, status, "Open" deeplink via `chrome.tabs.create` or reuse an LLL tab; review tasks open the Review tab), suggested theme chip (copy to clipboard), last capture summary with Undo.
- Review: due count; card front (term, pronunciation, 🔊 using `speechSynthesis` with `bcp47` voice if available, else hidden), "Show answer", back (translation, example, note), buttons Again/Hard/Good/Easy + keys 1–4, space/enter to flip; empty state with CTA to do a lesson; edit translation inline for cards with empty translation; when a review session of ≥1 card ends → `autoComplete('review', {cardsReviewed})`.
- Plan: week view Mon–Sun, tasks per day with status; "Regenerate next week" not in v1.
- Progress: streak, total XP, level (XP/100), words learned (cards with reps ≥1), due count, weekly goal bar, achievements grid.
- Settings: profile edit, auto-save toggle, reminder time (off / time picker), UI language (auto + 5), camera toggle, export (download JSON file via blob URL), import (file input → importData), reset (confirm twice), About (version, GitHub link, "Not affiliated with Google", support link placeholder, developer line).
- Accessibility: all controls keyboard-reachable, visible focus, aria-labels, contrast AA, `dir="auto"` + `lang` on card text; light/dark via `prefers-color-scheme`.

- [ ] **Step 1: Failing tests:** achievements unlock thresholds; suggestThemes returns 3 distinct non-empty strings for every goal×level×uiLang; deeplink exact URLs; panel: onboarding completes and calls setProfile with chosen values (mock messaging); Review flips card, rating sends review message, key "3" rates Good; Arabic card element has `dir="auto"` and `lang="ar"`; Today renders tasks from a snapshot fixture; every message key used in source exists in all 5 locales (scan `t('…')` / `__MSG_…__` usages).
- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run** → PASS; build; typecheck
- [ ] **Step 5: Commit** `feat(extension): side panel with onboarding, today, review, plan, progress, settings`

### Task 7: Daily reminder

**Files:** Create `apps/extension/src/background/reminder.ts`; Test `apps/extension/test/reminder.test.ts`

**Interfaces:** `nextReminderAt(now: Date, time: 'HH:MM'): number` (epoch ms, today if still ahead else tomorrow, local time); `scheduleReminder(settings)` → `chrome.alarms.create('langcoach-reminder', { when, periodInMinutes: 1440 })` or clear when off; on alarm: if today's tasks not all done → `chrome.notifications.create` (i18n title/body, icon) ; click → open side panel (requires a window id; fall back to opening an LLL tab).

- [ ] Steps: failing tests for nextReminderAt (before/after time, DST-safe using local Date arithmetic), schedule/clear with a chrome fake, notification only when tasks pending → implement → pass → commit `feat(extension): optional daily reminder`

### Task 8: End-to-end tests with a local LLL mock

**Files:**
- Create: `apps/extension/e2e/mock-lll/server.ts` (Node http server on a random port serving `/lll/<lang>/experiments/<slug>` minimal pages whose inline script calls `fetch('/lll/api/insights/terms', {method:'POST', body: JSON.stringify({...})})` etc. and renders results; API routes return the Task 3 fixtures), `apps/extension/e2e/extension.spec.ts`, `apps/extension/playwright.config.ts`
- Because the manifest only matches `https://labs.google/lll/*`, the e2e build uses a test manifest variant (`vite build --mode e2e`) that additionally matches `http://localhost/*` / `http://127.0.0.1/*`; `kindFromUrl` accepts localhost only in that mode (compile-time flag `__E2E__`). The production build must not contain localhost (assert in manifest test).

**Scenarios (each a test):** onboarding from side panel page (`chrome-extension://<id>/sidepanel.html`); Tiny Lesson capture → toast "20 words saved" → side panel shows due 20; regenerate same → "Already in your deck"; Undo removes; grammar attached; Slang Hang zh capture with pinyin; Word Cam capture; Arabic card RTL; manual save via message (context menu can't be clicked in Playwright — call the background handler through `chrome.runtime.sendMessage` from the panel page); review 3 cards → review task auto-completed, XP increases; export → import round-trip; API shape change (mock returns `{unexpected:true}`) → no toast, no page console errors; reminder alarm scheduled when set.
- Run headless Chromium (`chromium` channel with `--headless=new` supports extensions); document `npx playwright install chromium`.

- [ ] Steps: write spec → run (RED where features missing/fix) → all green → commit `test(extension): end-to-end flows against a local LLL mock`

### Task 9: Packaging, docs, store listing, CI

**Files:**
- Create: `apps/extension/scripts/zip.mjs` (zips `dist/` → `langcoach-extension-<version>.zip`, no new deps: use `node:zlib` + minimal zip writer or `tar`-free approach; or add `fflate` devDependency), `docs/extension/STORE_LISTING.md` (EN + TR: name, short + long description, category Education, screenshots list, privacy answers: no data collected), `docs/PRIVACY.md` (no data collected, all local, permissions explained one line each), `.github/FUNDING.yml` (github: oktaybilge1; custom: placeholder), `docs/extension/INSTALL.md` + `.tr.md` (store links placeholder, Load unpacked steps for Chrome/Edge/Brave with screenshots placeholders, troubleshooting)
- Modify: `README.md`, `README.tr.md` (top: "Chrome extension" as the primary door with GIF placeholder + "Add to Chrome" button placeholder; MCP as second door), `.github/workflows/ci.yml` (extension unit tests run in existing job; new `extension-e2e` job ubuntu-latest: install playwright chromium, build e2e mode, run e2e; upload zip artifact from production build), `HANDOFF.md`, `AGENTS.md` (extension dev commands)
- Version: extension `0.1.0` in manifest and package.json.

- [ ] Steps: implement → `npm run build -w @langcoach/extension && node apps/extension/scripts/zip.mjs` produces zip containing manifest.json at root → all tests + e2e green locally → commit `docs(extension): store listing, privacy, install guides; CI e2e and zip`

Not in this plan (owner approval needed): Chrome Web Store / Edge submission, GitHub release creation, npm 0.1.1 publish.
