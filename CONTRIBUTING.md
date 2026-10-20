# Contributing to LangCoach

Thanks for helping! LangCoach is a small TypeScript monorepo, and contributions of all sizes are welcome: bug reports, docs, tests, translations and features.

## Setup

Requires Node 20 or newer (see `.nvmrc`).

```bash
git clone https://github.com/oktaybilge1/langcoach.git
cd langcoach
npm install
```

Layout:

- `packages/core` - all logic (plans, FSRS reviews, streak, XP, storage). No MCP code here.
- `packages/mcp` - the MCP server published to npm as `langcoach`.

## Commands

```bash
npm run typecheck   # TypeScript, strict mode
npm test            # vitest
npm run build       # build all packages
```

All three must pass before you open a PR; CI runs them on Linux, Windows and macOS with Node 20 and 22.

To try your build in Claude Code:

```bash
claude mcp add langcoach -- node /absolute/path/to/langcoach/packages/mcp/dist/index.js
```

Use a throwaway data folder while developing by setting `LANGCOACH_HOME`.

## Branch and PR flow

1. Fork the repo and create a branch from `main` (`fix/short-name` or `feat/short-name`).
2. Make focused commits with clear messages (for example `fix: ...`, `feat: ...`, `docs: ...`).
3. Open a pull request describing what changed and why. Link the issue if there is one.
4. Keep the PR small enough to review. For larger ideas, open an issue first.

## Code style

- TypeScript with `strict` on. No `any` without a good reason.
- Tests are required: new behavior and bug fixes come with a test (vitest).
- Never lose learner data silently: keep writes atomic and report errors clearly.
- Do not add network calls or telemetry to the core or MCP packages.

## Adding a UI translation (later)

The web app is planned and does not exist yet. When it lands, UI strings will live in one file per language (for example `en.ts`, `tr.ts`). To add a language, copy the English file, translate the values (not the keys), register it in the language list and open a PR. Until then, you can help by translating the README: copy `README.md` to `README.<lang>.md` and link it from the top of the other READMEs.

## Be kind

Be respectful and patient. Assume good intent, give constructive feedback and welcome newcomers.
