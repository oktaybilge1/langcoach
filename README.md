# LangCoach

**English** | [Türkçe](https://github.com/oktaybilge1/langcoach/blob/main/README.tr.md)

[![CI](https://github.com/oktaybilge1/langcoach/actions/workflows/ci.yml/badge.svg)](https://github.com/oktaybilge1/langcoach/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/langcoach)](https://www.npmjs.com/package/langcoach)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/oktaybilge1/langcoach/blob/main/LICENSE)

**Your personal language coach for [Little Language Lessons](https://labs.google/lll/en) and Claude Code: weekly plan, daily tasks, practice sessions, spaced-repetition reviews (FSRS), streak and XP.**

<!-- Demo GIF and screenshots are recorded by the owner; see docs/media/README.md for the shot list. Add the image here once docs/media/extension-demo.gif exists. -->

One-off AI language exercises are great, but they forget you the moment you close the tab. **LangCoach** adds the missing structure (a personalized weekly plan, automatic vocabulary capture, practice sessions, FSRS reviews, a daily goal, streaks and XP) in two ways:

1. **Browser extension (Chrome / Edge / Brave):** opens a side panel right next to [Google Labs' Little Language Lessons](https://labs.google/lll/en), captures every Tiny Lesson, Slang Hang and Word Cam result you generate, and turns it into practice and reviews.
2. **Claude Code MCP server:** gives Claude Code a persistent memory for your lessons, reviews and weekly study plan in the terminal.

- **No API key, no account, no server.**
- **Local data:** LangCoach makes no network requests; your data stays on your machine ([Privacy Policy](https://github.com/oktaybilge1/langcoach/blob/main/docs/PRIVACY.md)).

## 1. Browser extension (Little Language Lessons companion)

<!-- TODO: Replace with Chrome Web Store & Edge Add-ons badges once approved -->
**Add to Chrome (coming soon)** · **[Install from the ZIP (Load unpacked)](https://github.com/oktaybilge1/langcoach/blob/main/docs/extension/INSTALL.md)**

- **Automatic capture:** when you use Tiny Lesson, Slang Hang or Word Cam on `https://labs.google/lll/*`, the words, phrases, pronunciation and grammar notes become cards in your deck, with one-click Undo and a right-click "Save to LangCoach" for any selected text.
- **Today:** a daily XP goal ring, your streak flame with streak freezes, today's tasks from your weekly plan, and three scenario suggestions with **one-tap start** (LangCoach picks your language in Tiny Lesson, fills in the situation and presses Generate; if the page is not ready it copies the text for you instead).
- **Practice sessions:** about ten quick exercises of six kinds (pick the meaning, pick the word, listen and pick, match pairs, type the word, fill the blank), forgiving answer checks (case, accents, one-letter slips, romanization), missed words come back at the end, plus a combo counter, optional sounds and a perfect-session bonus.
- **Words hub:** all your words grouped by lesson situation, with search, filters (All / Due / New / Weak / Favorites / Mastered), a strength meter from the FSRS schedule, favorites, 🔊, inline edit of your own translation, "I know this", and a flip-card review mode (`Space` to flip, `1–4` to rate).
- **Daily goal and streak freezes:** choose Casual 10 / Regular 20 / Serious 30 / Intense 50 XP a day. You earn a streak freeze for every 7 days of streak; a held freeze covers a missed day automatically.
- **Levels and achievements:** named levels by total XP, a 7-day XP chart and badges (first lesson, streaks, deck size, perfect session, 100 XP in a day, and more).
- **On-device translation into your native language:** on desktop Chrome with the built-in Translator API (Chrome 138+), captured words also get a meaning in your own language, shown in the panel and under the words on the lesson page. The translation runs in the browser; LangCoach sends nothing anywhere. Without the API, cards keep the meaning the lesson gave.
- **Export:** Anki (text import), Quizlet and CSV files from Settings, plus a JSON backup you can import again. Files are created locally.
- **23 LLL target languages and 5 UI languages:** English, Türkçe, Español, Français, Português (Brasil), with RTL card support.
- **No network requests:** the extension itself makes no network requests and has no analytics; your deck stays in `chrome.storage.local`. The 🔊 button uses your browser's speech voices; for some voices the browser vendor may process the spoken text on its servers.

## 2. Claude Code MCP server

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

Details, verification, update, uninstall and troubleshooting: [docs/INSTALL.md](https://github.com/oktaybilge1/langcoach/blob/main/docs/INSTALL.md).

## Use it

In Claude Code, run the `tutor` prompt. MCP prompts show up as a slash command, like `/mcp__langcoach__tutor`. Or just ask Claude:

> Let's start my language lesson with langcoach

The first time, Claude interviews you (native language, target language, CEFR level, goal, minutes per day, days per week) and saves your profile. After that it builds this week's plan, tells you what is on for today, teaches the lesson, quizzes you on due cards and records everything.

## Why not just ask a chatbot?

You can, and a chatbot is a fine teacher for one conversation. What it does not do on its own is keep track of you over weeks. LangCoach is the part that remembers:

- **A plan that persists.** Your profile and this week's plan are saved, so tomorrow starts where today stopped instead of from a blank chat.
- **Reviews on a schedule.** Every word gets a review date from [FSRS](https://github.com/open-spaced-repetition/ts-fsrs), a spaced-repetition algorithm, so you see a word again shortly before you would likely forget it, not at random.
- **Honest numbers.** Streak, XP, due cards and progress are computed from what you actually did and stored, never estimated or invented by a model.
- **Your data stays local.** Everything is in a file on your computer (MCP) or in your browser's storage (extension), and you can export it any time.
- **Lessons from your own life.** Lessons start from your real situations (a trip next month, tomorrow's meeting), through Tiny Lesson in the browser or Claude in the terminal.

LangCoach does not replace a teacher or a course, and it does not grade your speaking.

## Features (MCP server)

- **Personal profile:** native language, target language, level (A1-C2), goal, daily minutes and study days per week.
- **Weekly plan:** study days spread across the ISO week, sized to your daily minutes, with a theme picked from your goal.
- **Daily tasks:** Tiny Lesson-style situational lessons, Slang Hang-style informal lessons, reviews, and a quiz on the last study day.
- **Spaced repetition:** every lesson item becomes a review card scheduled with [FSRS](https://github.com/open-spaced-repetition/ts-fsrs); duplicates are skipped.
- **Progress:** streak, total XP and weekly goal, always read from stored data, never invented.
- **Safe data:** atomic writes, a backup before every import, and corrupt files are preserved instead of overwritten.
- **No network calls:** LangCoach makes no network calls; your data stays on your machine.

### Tools

Claude uses these tools for you: `set_profile`, `get_weekly_plan`, `get_today`, `save_lesson`, `complete_task`, `get_due_reviews`, `submit_review`, `get_progress`, `export_cards`, `export_data`, `import_data`.

## Your data

Everything lives in one JSON file: `~/.langcoach/data.json`. Set the `LANGCOACH_HOME` environment variable to use a different folder.

- **Export to Anki / Quizlet / CSV:** ask Claude to run `export_cards`, or use Settings > Export cards in the extension. See the [Anki, Quizlet and CSV guide](https://github.com/oktaybilge1/langcoach/blob/main/docs/ANKI.md).
- **Export / import:** ask Claude to run `export_data` for a backup or to move to another machine, and `import_data` to restore it.
- Writes are atomic, so a crash cannot leave a half-written file.
- Parallel tool calls and several Claude Code sessions take turns through a short-lived `data.json.lock` file, so no update is lost.
- If the data file is corrupt, it is preserved as `data.corrupt-<timestamp>.json` and you get a clear error.
- Before an import replaces your data, the current file is saved as `data.backup-<timestamp>.json`.

The extension keeps its own deck in the browser; the two do not sync. Use the exports to move words between them and other apps.

## Roadmap

Planned, not built yet:

- [ ] Web app (PWA) that runs in the browser with your own Gemini API key, plus a live demo on GitHub Pages
- [ ] Word Cam-style camera vocabulary (web app)
- [ ] More UI languages via community PRs

See the [CHANGELOG](https://github.com/oktaybilge1/langcoach/blob/main/CHANGELOG.md) for what changed in each version.

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](https://github.com/oktaybilge1/langcoach/blob/main/CONTRIBUTING.md).

## Credits and disclaimer

LangCoach is inspired by Google Labs' [Little Language Lessons](https://labs.google/lll/en) (Tiny Lesson, Slang Hang, Word Cam) and adds what one-off exercises lack: a weekly plan and progress tracking.

LangCoach is an independent project and is not affiliated with, endorsed by, or sponsored by Google.

## License

[MIT](https://github.com/oktaybilge1/langcoach/blob/main/LICENSE) (c) 2026 Oktay Bilge
