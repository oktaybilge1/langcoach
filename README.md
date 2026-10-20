# LangCoach

**English** | [Türkçe](README.tr.md)

[![CI](https://github.com/oktaybilge1/langcoach/actions/workflows/ci.yml/badge.svg)](https://github.com/oktaybilge1/langcoach/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/langcoach)](https://www.npmjs.com/package/langcoach)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**Your language coach inside Claude Code: weekly plan, daily tasks, spaced-repetition reviews, streak and XP, for any language pair.**

<!-- TODO: hero GIF of a real session goes here: docs/media/demo.gif (not recorded yet) -->

AI language lessons are great, but most forget you the moment the chat ends. LangCoach is an MCP server that gives Claude a memory for your learning: Claude writes the lessons in your target language, LangCoach stores your plan, reviews and progress on your machine.

- No API key, no account, no server.
- Works with any native + target language.
- Your data stays on your machine.

## Install

```bash
claude mcp add langcoach -- npx -y langcoach
```

Requires Node 20+. (The `langcoach` package is not on npm yet; until it is published, use "Run from source" below.)

### Run from source

```bash
git clone https://github.com/oktaybilge1/langcoach.git
cd langcoach
npm install
npm run build
claude mcp add langcoach -- node <absolute-path>/packages/mcp/dist/index.js
```

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
- If the data file is corrupt, it is preserved as `data.corrupt-<timestamp>.json` and you get a clear error.
- Before an import replaces your data, the current file is saved as `data.backup-<timestamp>.json`.

## Roadmap

Planned, not built yet:

- [ ] Web app (PWA) that runs in the browser with your own Gemini API key, plus a live demo on GitHub Pages
- [ ] Word Cam-style camera vocabulary (web app)
- [ ] More UI languages via community PRs

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Credits and disclaimer

LangCoach is inspired by Google Labs' [Little Language Lessons](https://labs.google/lll/en) (Tiny Lesson, Slang Hang, Word Cam) and adds what one-off exercises lack: a weekly plan and progress tracking.

LangCoach is an independent project and is not affiliated with, endorsed by, or sponsored by Google.

## License

[MIT](LICENSE) (c) 2026 Oktay Bilge
