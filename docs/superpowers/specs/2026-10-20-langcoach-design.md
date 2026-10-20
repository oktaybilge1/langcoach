# LangCoach — Design

## Intent
Google Labs' *Little Language Lessons* (Tiny Lesson, Slang Hang, Word Cam; built on Gemini) gives one-off AI language exercises with no memory, weekly plan, daily tasks or progress tracking. LangCoach is an open-source companion that adds that missing layer: a personal profile, an adaptive weekly plan, daily tasks, spaced-repetition review, streak/XP and a weekly goal. It is language-independent (any native + target language) and zero-cost to run.

Positioning: "Inspired by Google Labs' Little Language Lessons, adds weekly plans and progress tracking." It is not affiliated with Google, never uses Google's name or logo in its own name, and says so in the README.

## Goals
- A learner gets a plan, a "today" list and a review queue that persist between sessions.
- Install in one command inside Claude Code; no API key, no server, no account.
- Same core logic later powers a web PWA (separate plan).
- Open source (MIT), public GitHub repo, installable via `npx`.

## Non-goals (v1)
- No hosted backend, accounts, payments or cloud sync (sync = JSON export/import).
- No Word Cam (needs a camera; web PWA later). No audio/pronunciation scoring.
- No built-in lesson content generation: in MCP mode Claude writes lessons and the server stores them.

## Anti-goals
- Never a Duolingo clone with a fixed curriculum; value is personal, situation-based content with tracking.
- Never imply Google endorsement.
- Never lose a learner's data silently (corrupt file, bad import).

## Decisions (user-approved)
- Language independent, global. Folder: `Desktop\Projeler\langcoach`. Name: LangCoach.
- Cost model: no backend. MCP mode costs the project nothing (the learner's own Claude does generation). Web mode (later) uses the learner's own Gemini API key.
- Publish to GitHub (public) and npm (`langcoach`); publishing and pushing happen only after explicit user go-ahead.
- Claude Code is the first distribution channel (MCP server), plus a "tutor" prompt so Claude can also coach in normal conversations.

## Builder's calls (not yet approved by the user)
- TypeScript monorepo (npm workspaces): `packages/core`, `packages/mcp`, later `apps/web`.
- Spaced repetition via `ts-fsrs`; tests via `vitest`; MCP via `@modelcontextprotocol/sdk` + `zod`.
- Storage: one JSON file at `$LANGCOACH_HOME/data.json` (default `~/.langcoach/data.json`), atomic writes.
- Single learner profile per data file.
- Task types in v1: `tiny_lesson`, `slang_hang`, `review`, `quiz`.
- XP: tiny_lesson 20, slang_hang 20, quiz 30, review 10 + 1 per card reviewed. Streak = consecutive local days with at least one completed task.
- Weeks are ISO weeks (Monday start), dates are local `YYYY-MM-DD`.

## Behavior summary
- `set_profile` stores: nativeLanguage, targetLanguage, level (CEFR A1–C2), goal (free text), minutesPerDay (5–180), daysPerWeek (1–7).
- `get_weekly_plan(theme)` returns the current ISO week's plan, creating it from the profile if absent: `daysPerWeek` study days spread across the week, each with 1–2 tasks sized to `minutesPerDay`, last study day includes a quiz, other days alternate tiny_lesson / slang_hang, every study day after the first includes a review task.
- `save_lesson` stores a Claude-written lesson (situation + items) and turns each item into a review card.
- `complete_task` marks a task done once (no double XP) and logs XP.
- `get_due_reviews` / `submit_review` run FSRS ratings 1–4.
- `get_progress` returns streak, total XP, weekly goal (done/planned study days), due-card count.
- `export_data` / `import_data` round-trip the whole state; import validates version and shape before replacing anything.
- MCP prompt `tutor` tells Claude how to coach: check today's tasks, write lessons in the target language, record results, never invent progress.

## Launch quality bar (user: "should be a project that earns hundreds of thousands of stars")
Stars are not guaranteed; these are the known drivers, and the public launch waits until all are met:
- **Two front doors at launch:** Claude Code MCP (devs, one command) and a live web demo on GitHub Pages (everyone else, no install). The web PWA is a separate plan but is part of v1 launch, not "later".
- **README sells in 10 seconds:** hero GIF of a real session, one-line pitch, one-command install, EN + TR, clear "inspired by Little Language Lessons, not affiliated with Google".
- **Works first try:** `npx -y langcoach` on Windows/macOS/Linux, Node 20+; CI runs tests on all three.
- **Quality signals:** tests + CI badge, typed code, CONTRIBUTING, issue templates, good-first-issues, translatable UI (community adds languages via PR).
- **Data never lost:** atomic writes, backup before import, corrupt file is preserved and reported.

## Left to the builder
Exact JSON field names beyond those in the plan, error message wording, tool descriptions, README copy (EN + TR).
