# LangCoach Browser Extension — Design

## Intent (owner's words, paraphrased)
Google Labs' Little Language Lessons (LLL, https://labs.google/lll) is a great set of AI language experiments with no memory, no plan, no daily tasks, no streaks. The owner wants **ordinary people using LLL** to get Duolingo-style features **on top of LLL**, with a real interface, before Google adds them. The Claude Code/MCP version does not reach these people. Chosen form: a **browser extension** (owner's choice). "Everyone must be able to use it."

## Goals
- Install in one click (store) and work immediately on labs.google/lll — no API key, no account, no server.
- Every lesson the user does on LLL is captured automatically into a personal review deck.
- A side panel shows: today's tasks, the weekly plan, flashcard review (spaced repetition), streak, XP, daily/weekly goal.
- Tasks link straight into the right LLL experiment; doing the experiment completes the task automatically.
- Works for all 23 LLL target languages incl. RTL (Arabic, Hebrew, Urdu) and CJK with transliteration.
- UI in English + Turkish + Spanish + French + Portuguese (LLL's own UI languages plus Turkish).

## Non-goals (v1)
- No content generation of our own; LLL (Google's Gemini) generates everything. We never call Google's API ourselves — only observe responses produced by the user's own actions.
- No accounts, cloud sync, backend, analytics or telemetry. Sync = JSON export/import.
- No mobile (Chrome mobile has no extensions). Firefox later (side panel API differs).

## Anti-goals
- Never use "Google" or "Little Language Lessons" in the product name; store/README say "works with Google Labs' Little Language Lessons — not affiliated with, endorsed by, or sponsored by Google."
- Never break or slow down the LLL page; if Google changes its API, the extension degrades gracefully (manual save still works) and never throws errors into the page.
- Never lose a learner's data.
- Never collect or transmit personal data; host permission limited to `https://labs.google/lll/*`.

## How it works
1. **Capture.** A main-world content script at `document_start` on `https://labs.google/lll/*` wraps `window.fetch`; for responses from `/lll/api/insights/{terms,grammar,conversation,object-descriptors}` it clones the response, parses JSON and posts `{kind, request, response}` to the isolated content script → background service worker. Shapes: `docs/research/2026-10-21-lll-site-recon.md`. Unknown/changed shapes are ignored (logged to the extension's own console only). The original response is returned untouched.
2. **Store.** Background converts captures into a Lesson + cards via `@langcoach/core` (`Coach.saveLesson`, dedupe by term), records the activity, auto-completes a matching task for today. Lesson kinds: `tiny_lesson`, `slang_hang`, `word_cam`. Cards keep `term`, `translation`, `transliteration` (as note/pronunciation), example sentence where available. Slang Hang cards: each `notes` key → card (translation = explanation, example = the line it appeared in). Grammar topics are stored with the lesson (shown in the panel), not as cards.
3. **Toast on page.** After a capture, a small unobtrusive pill (shadow DOM, isolated styles) on the LLL page: "✓ 12 words saved to LangCoach · Undo · Open". Undo removes that lesson's new cards.
4. **Manual save (DOM-independent fallback).** Context menu on selected text within LLL pages: "Save to LangCoach" → card with the selection as term; translation optional (editable in panel).
5. **Side panel** (Chrome Side Panel API; opens from the toolbar icon or the toast): tabs **Today**, **Review**, **Plan**, **Progress**, **Settings**.
   - Onboarding (first open): target language (23 LLL languages; auto-filled from the first capture), native language, level (A1–C2 or "not sure"), goal (travel, work, study, moving abroad, family/friends, fun), minutes/day, days/week.
   - Today: today's tasks with "Open in Little Language Lessons" deep links (`/lll/<siteLang>/experiments/<slug>`), suggested Tiny Lesson theme (curated list by goal × level, localized), daily goal ring, streak.
   - Review: flashcards (front: term + transliteration + 🔊 via `speechSynthesis` with the target BCP-47 code; back: translation + example), ratings Again/Hard/Good/Easy (FSRS via core), keyboard shortcuts 1–4/space.
   - Plan: the week (from core planner, mid-week aware), task status.
   - Progress: streak, total XP, words learned, cards due, weekly goal, simple achievements (first lesson, 3/7/30-day streak, 50/100/500 cards).
   - Settings: profile edit, auto-save on/off, daily reminder (time; `chrome.alarms` + `notifications`), UI language, export/import JSON (same State format as the MCP version → interoperable), reset.
6. **Reminder.** Optional daily notification "Your 5-minute lesson is waiting" if today's tasks aren't done; clicking opens the side panel.

## Builder's calls (not yet approved by owner)
- Manifest V3, Chromium-based browsers (Chrome, Edge, Brave, Opera). Distribution: Chrome Web Store (one-time $5 developer fee — owner's cost), Edge Add-ons (free), plus a zip on GitHub Releases for "Load unpacked".
- `apps/extension` in the monorepo; TypeScript, Vite build, Preact for the panel UI; vitest (+ jsdom) unit tests; Playwright end-to-end with the built extension loaded in Chromium against a **local mock of the LLL pages/API** built from the recon fixtures (CI never hits Google).
- `@langcoach/core` gets a browser-safe entry (no `node:fs`): types, schema, srs, planner, progress, coach, MemoryStore. The extension implements `ChromeStorageStore` (chrome.storage.local; the background worker is the single writer; transactions serialized with a promise mutex).
- Task types extend core: `tiny_lesson`, `slang_hang`, `word_cam`, `review` (+ existing `quiz` = a review session of this week's cards). Word Cam tasks only if the user enables "I have a camera".
- XP: same table as core; word_cam 20.
- Permissions: `storage`, `sidePanel`, `contextMenus`, `alarms`, `notifications`; host `https://labs.google/lll/*` only.
- Design: friendly, clean, playful accents (not a Duolingo clone look); light/dark; accessible (keyboard, ARIA, contrast, `dir="auto"` for card text).

## Launch quality bar
- Works first try on a fresh Chrome profile: install → open LLL → do a Tiny Lesson → toast → panel shows cards → review works.
- E2E tests cover: capture of all three experiments (fixtures incl. Chinese with pinyin, Arabic RTL, gendered newline terms), auto-complete of tasks, undo, manual save, review flow, export/import, onboarding, reminder scheduling, API-shape change (graceful no-op).
- README section + store listing text (EN/TR), screenshots, privacy policy page (required by Chrome Web Store) stating no data collection.

## Left to the builder
Exact component structure, styles, copy wording, theme lists content, achievement icons.
