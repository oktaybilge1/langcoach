# Changelog

All notable changes to LangCoach are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

LangCoach ships two things from this repo: the `langcoach` MCP server on npm (`packages/mcp`) and the browser extension (`apps/extension`). Both use the same version number from 0.2.0 on.

## 0.4.1 - 2026-11-11

### Security
- Updated the transitive dependency `body-parser` (via the MCP SDK's `express`) to 2.4.0, which fixes a denial-of-service issue with trailing bytes after a compressed request body (GHSA-27r3-jxmh-p828). LangCoach's bridge only listens on `127.0.0.1`, so the practical risk was low.

## 0.4.0 - 2026-11-11

### Added
- **Progress dashboard.** Say *show my dashboard* and your agent opens a local "sticker notebook" page (new `open_dashboard` tool, 15 tools in total): streak, today's tasks with a daily XP bar, your words (learned / needs review), weekly plan, reviews due, recent Little Language Lessons lessons, badges and a 7-day XP chart. It is written in your native language (English, Türkçe, Español, Français, Português; other languages get English text with local dates), makes no network requests and stays in your data folder.

### Changed
- **Notebook look for the extension side panel**, in light and warm dark mode, sharing one set of design tokens with the dashboard.
- Levels, achievements and word strength now live in the shared core, so the dashboard and the extension always agree.
- README redesigned with screenshots made from demo data.
- Development and CI now use Node 22 and 24; the published package still runs on Node 20+.

## 0.3.0 - 2026-11-10

### Added
- **Agent bridge for Little Language Lessons.** The browser extension forwards each lesson you make on LLL to the `langcoach` MCP server on your own computer (`http://127.0.0.1:47821`), so your agent knows what you studied. It keeps saving locally as before; unsent lessons are retried. Settings has a "Your AI agent" card (Connected / Waiting for your agent / Not paired / Server not verified / Off) with an on/off switch, and the capture toast says "sent to your agent".
- MCP tools (11 → 14): `bridge_status`, `get_recent_lessons` (newest first, `source: "lll"` filter) and `bridge_prepare_extension` (copies the bundled extension to `~/.langcoach/extension` and pairs it).
- The npm package now ships the production extension (`extension/`), built by `prepack`.
- Agent-assisted install: AGENTS.md, CLAUDE.md, the install guides, the README and the `tutor` prompt describe how an agent offers the bridge, opens the extensions page and copies the folder path with the user's yes (the user still clicks Load unpacked), and verifies one lesson. The `tutor` prompt can send tiny_lesson / slang_hang tasks to LLL and checks them with `get_recent_lessons`.
- Lessons are idempotent per client id (`Lesson.externalId`); bridge lessons are marked `origin: "bridge"`.

### Security
- The bridge listens on `127.0.0.1` only and opens only after pairing (`~/.langcoach/bridge-token`) or with `LANGCOACH_BRIDGE=on`; `LANGCOACH_BRIDGE=off` always disables it.
- Per-install pairing token: the server proves it with an HMAC over a nonce before the extension sends anything, and lesson uploads need the token. The token is never logged or returned by a tool and is never in the npm package or the extension zip.
- Trust checks on every request (`chrome-extension://` Origin, `Host`, `X-LangCoach` header), CORS only for the validated origin, 1 MiB / 20 lessons per request, per-origin rate limit, connection and header timeouts.
- Lesson text is untrusted: control and bidi characters are stripped, fields over their caps are rejected, and `get_recent_lessons`, `get_due_reviews`, `export_cards` and `export_data` carry a notice (and `untrusted: true` on web-captured items) telling the agent never to follow instructions inside them.
- The packaging guard (no dev/e2e build, no pairing file, no loopback host except the bridge) is shared by the zip script and the npm `prepack`.

### Changed
- **Breaking:** `get_due_reviews` returns `{ notice, cards }` instead of a bare array.
- README / README.tr lead with the Little Language Lessons companion framing, a comparison table and a bridge privacy note.

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
