# Changelog

All notable changes to LangCoach are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

LangCoach ships two things from this repo: the `langcoach` MCP server on npm (`packages/mcp`) and the browser extension (`apps/extension`). Both use the same version number from 0.2.0 on.

## 0.2.0 - 2026-10-29

### Added

**Browser extension (first public release)**
- Manifest V3 extension for Chrome, Edge and Brave that opens a side panel next to [Little Language Lessons](https://labs.google/lll/en) (`https://labs.google/lll/*` only).
- Automatic capture of Tiny Lesson, Slang Hang and Word Cam results into a spaced-repetition deck, with a toast, one-click Undo (which also takes back the XP) and a right-click "Save to LangCoach".
- Side panel tabs: Today, Practice, Words, Plan, Progress, Settings, in 5 UI languages (English, Türkçe, Español, Français, Português (Brasil)), with RTL card support.
- **Practice sessions** with six exercise types (meaning, reverse, listen, match, type the word, fill the blank), tolerant answer checking (case, accents, one-letter slips, romanization), retries of missed words, combo counter, optional sound effects and a perfect-session bonus.
- **Words hub**: words grouped by lesson situation, search, filters (All / Due / New / Weak / Favorites / Mastered), a strength meter from the FSRS state, favorites, inline edit of the native translation and "I know this".
- **Daily XP goal** (Casual 10 / Regular 20 / Serious 30 / Intense 50) with a goal ring, a streak flame and **streak freezes** (one earned for every 7 days of streak, used automatically for a missed day, with a one-time banner).
- **Levels and achievements** on the Progress tab, plus a 7-day XP chart.
- **On-device native-language translation** of captured words with Chrome's built-in Translator API (when available), shown in the panel and under the words on the LLL page.
- **One-tap scenario start**: a suggested scenario card on Today picks the language, fills the Tiny Lesson purpose field and presses Generate; if the page is not ready it falls back to copying the text.
- **Export cards** to Anki (text import with stable GUIDs), Quizlet and CSV from Settings; JSON backup export / import and a guarded reset.
- Optional daily reminder notification.

**MCP server (`langcoach` on npm)**
- `export_cards` tool: export your deck for Anki, Quizlet or CSV.

### Security
- Background service worker is the single writer; messages are validated with schemas and accepted only from the extension's own pages or from the LLL content scripts, depending on the message type.
- Captured payloads are size-capped and parsed defensively; unknown API shapes are ignored without errors.
- CSV / Anki exports guard against spreadsheet formula injection (including leading line feeds), sanitize Anki GUIDs, and cap the size of JSON replies.
- The zip script refuses to package a development / e2e build (one whose manifest matches localhost).
- CI workflow runs with read-only repository permissions.

### Fixed
- Streak counts any day with XP; freezes cover only a whole missed gap and are never trimmed inside the current streak.
- A week created mid-week is planned from today onward; each week's plan is created in the background without a race against onboarding.
- Practice: "perfect" now means every card ended correct (single source of truth in the core); blanks every occurrence of the word; space-aware typo check.
- Undo of a capture also removes the XP it awarded, so capture, undo, capture does not double-award.
- Data recovery: schema-invalid data shows the same Import / Reset recovery screen as corrupt data; restoring over a broken data file works.
- Reminder schedules each next occurrence explicitly (no drift across daylight-saving changes).
- Locale-safe native-language codes, translation model download retry, and many smaller panel fixes.

### Changed
- Accessibility: practice feedback is announced through a persistent live region, focus moves to each new exercise and to the end-screen heading, answer options are a radio group, and an unsaved session warns before you leave.
- Docs: README feature list, store listing, privacy policy and install guides updated for v2; `claude mcp add` examples quote `"--"` so they work in Windows PowerShell.

## 0.1.0 - 2026-10-21

### Added
- First release of the `langcoach` MCP server for Claude Code: profile, weekly plan, daily tasks, lessons, FSRS reviews, streak, XP, export / import, and the `tutor` prompt.
- Local JSON data file (`~/.langcoach/data.json`) with atomic writes, a file lock, backups before import and preservation of corrupt files.
