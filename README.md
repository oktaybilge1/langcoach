# LangCoach

**English** | [Türkçe](https://github.com/oktaybilge1/langcoach/blob/main/README.tr.md)

[![CI](https://github.com/oktaybilge1/langcoach/actions/workflows/ci.yml/badge.svg)](https://github.com/oktaybilge1/langcoach/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/langcoach)](https://www.npmjs.com/package/langcoach)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/oktaybilge1/langcoach/blob/main/LICENSE)

**Your personal language coach for [Little Language Lessons](https://labs.google/lll/en) and Claude Code: weekly plan, daily tasks, spaced-repetition reviews (FSRS), streak and XP.**

<!-- TODO: hero GIF of the Chrome extension side panel + Tiny Lesson capture goes here: docs/media/extension-demo.gif -->

One-off AI language exercises are great, but they forget you the moment you close the tab. **LangCoach** adds the missing structure—a personalized weekly plan, automatic vocabulary capture, FSRS flashcards, streaks, and XP—available in two ways:

1. **Browser Extension (Chrome / Edge / Brave):** Opens a Side Panel right next to [Google Labs' Little Language Lessons](https://labs.google/lll/en), automatically captures every Tiny Lesson, Slang Hang, and Word Cam exercise you run, and schedules your reviews.
2. **Claude Code MCP Server:** Gives Claude Code a persistent memory for your lessons, reviews, and weekly study plan in the terminal.

- **No API key, no account, no server.**
- **100% local:** Your data never leaves your machine ([Privacy Policy](https://github.com/oktaybilge1/langcoach/blob/main/docs/PRIVACY.md)).

## 1. Browser Extension (Little Language Lessons Companion)

<!-- TODO: Replace with Chrome Web Store & Edge Add-ons badges once approved -->
**[Add to Chrome (Coming Soon)](https://github.com/oktaybilge1/langcoach/blob/main/docs/extension/INSTALL.md)** · **[Install Unpacked / ZIP Guide](https://github.com/oktaybilge1/langcoach/blob/main/docs/extension/INSTALL.md)**

- **Automatic capture:** Generates flashcards automatically when you use Tiny Lesson, Slang Hang, or Word Cam on `https://labs.google/lll/*` (with one-click Undo and right-click "Save to LangCoach").
- **Side panel coach:** Today's tasks, FSRS flashcard review (`Space` to flip, `1–4` to rate, `speechSynthesis` audio), weekly plan, streak, XP, and achievements.
- **23 LLL target languages & 5 UI languages:** English, Türkçe, Español, Français, Português (Brasil), plus full RTL card support.
- **No network requests:** the extension itself makes no network requests; your deck stays in `chrome.storage.local`. The 🔊 button uses your browser's speech voices; for some voices the browser vendor may process the spoken text on its servers.

## 2. Claude Code MCP Server

Requires [Node.js](https://nodejs.org) 20+ and [Claude Code](https://docs.anthropic.com/en/docs/claude-code) (signed in).

macOS / Linux / WSL:

```bash
claude mcp add --scope user langcoach "--" npx -y langcoach
```

Windows (native PowerShell/CMD, not WSL):

```bash
claude mcp add --scope user langcoach "--" cmd /c npx -y langcoach
```

**No API key needed.** Your own Claude subscription writes the lessons.

Or paste this repo link into Claude Code and say: *Install LangCoach for me*

Details, verification, update, uninstall and troubleshooting: [docs/INSTALL.md](https://github.com/oktaybilge1/langcoach/blob/main/docs/INSTALL.md). The `langcoach` package is not on npm yet; until it is published, see "Run from source" in that guide.

## Use it

In Claude Code, run the `tutor` prompt. MCP prompts show up as a slash command, like `/mcp__langcoach__tutor`. Or just ask Claude:

> Let's start my language lesson with langcoach

The first time, Claude interviews you (native language, target language, CEFR level, goal, minutes per day, days per week) and saves your profile. After that it builds this week's plan, tells you what is on for today, teaches the lesson, quizzes you on due cards and records everything.

## Features

- **Personal profile:** native language, target language, level (A1-C2), goal, daily minutes and study days per week.
- **Weekly plan:** study days spread across the ISO week, sized to your daily minutes, with a theme picked from your goal.
- **Daily tasks:** Tiny Lesson-style situational lessons, Slang Hang-style informal lessons, reviews, and a quiz on the last study day.
- **Spaced repetition:** every lesson item becomes a review card scheduled with [FSRS](https://github.com/open-spaced-repetition/ts-fsrs); duplicates are skipped.
- **Progress:** streak, total XP and weekly goal, always read from stored data, never invented.
- **Safe data:** atomic writes, a backup before every import, and corrupt files are preserved instead of overwritten.
- **No network calls:** LangCoach makes no network calls; your data stays on your machine.

### Tools

Claude uses these tools for you: `set_profile`, `get_weekly_plan`, `get_today`, `save_lesson`, `complete_task`, `get_due_reviews`, `submit_review`, `get_progress`, `export_data`, `import_data`.

## Your data

Everything lives in one JSON file: `~/.langcoach/data.json`. Set the `LANGCOACH_HOME` environment variable to use a different folder.

- **Export / import:** ask Claude to run `export_data` for a backup or to move to another machine, and `import_data` to restore it.
- Writes are atomic, so a crash cannot leave a half-written file.
- Parallel tool calls and several Claude Code sessions take turns through a short-lived `data.json.lock` file, so no update is lost.
- If the data file is corrupt, it is preserved as `data.corrupt-<timestamp>.json` and you get a clear error.
- Before an import replaces your data, the current file is saved as `data.backup-<timestamp>.json`.

## Roadmap

Planned, not built yet:

- [ ] Web app (PWA) that runs in the browser with your own Gemini API key, plus a live demo on GitHub Pages
- [ ] Word Cam-style camera vocabulary (web app)
- [ ] More UI languages via community PRs

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](https://github.com/oktaybilge1/langcoach/blob/main/CONTRIBUTING.md).

## Credits and disclaimer

LangCoach is inspired by Google Labs' [Little Language Lessons](https://labs.google/lll/en) (Tiny Lesson, Slang Hang, Word Cam) and adds what one-off exercises lack: a weekly plan and progress tracking.

LangCoach is an independent project and is not affiliated with, endorsed by, or sponsored by Google.

## License

[MIT](https://github.com/oktaybilge1/langcoach/blob/main/LICENSE) (c) 2026 Oktay Bilge
