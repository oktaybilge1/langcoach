# AGENTS.md

Instructions for AI coding agents (Claude Code, Codex, Gemini/Antigravity and others) working with the LangCoach repo: https://github.com/oktaybilge1/langcoach

## If a user asks you to install LangCoach

LangCoach is an MCP server for Claude Code (npm package `langcoach`). **No API key, account or server is needed.** Never ask for, request or store API keys.

Checklist, in order:

1. **Node.js 20+**: run `node -v`. If it is missing or below v20, do not install system software silently. Tell the user to install the LTS version from https://nodejs.org, reopen the terminal, and then continue.
2. **Claude Code**: run `claude --version`. If missing, point the user to https://docs.anthropic.com/en/docs/claude-code.
3. **Detect OS and shell**: native Windows (PowerShell/CMD), or macOS / Linux / WSL.
4. **Register the server** (user scope, so it works in any folder):
   - macOS, Linux, WSL: `claude mcp add --scope user langcoach "--" npx -y langcoach`
   - Windows native (not WSL): `claude mcp add --scope user langcoach "--" cmd /c npx -y langcoach`
   - If the package is not on npm yet (the command cannot fetch it), use the from-source path: `git clone https://github.com/oktaybilge1/langcoach.git`, `npm install`, `npm run build`, then `claude mcp add --scope user langcoach "--" node /absolute/path/to/langcoach/packages/mcp/dist/index.js` (Windows: forward slashes, e.g. `C:/Users/you/langcoach/packages/mcp/dist/index.js`).
5. **Verify**: run `claude mcp list` and confirm `langcoach` is shown as connected. If it failed, run `npx -y langcoach` (it should wait silently; stop with Ctrl+C) and read any error. See the troubleshooting table in https://github.com/oktaybilge1/langcoach/blob/main/docs/INSTALL.md
6. **Tell the user** to restart Claude Code or start a new session, then run `/mcp__langcoach__tutor` (or say "Let's start my language lesson with langcoach").
7. **Never** ask for or store API keys. None are needed in Claude Code mode.

Data lives in `~/.langcoach/data.json` (override with `LANGCOACH_HOME`). Uninstall: `claude mcp remove langcoach` (add `--scope user` if added that way).

Full human guide: [docs/INSTALL.md](docs/INSTALL.md).

## If you are developing LangCoach

Commands (run from the repo root):

```bash
npm install
npm run typecheck
npm test                                    # vitest (core + mcp + extension unit/integration)
npm run build                               # builds core, mcp, and MV3 browser extension
npm run test:e2e -w @langcoach/extension    # Playwright E2E against local LLL mock
npm run zip -w @langcoach/extension         # packages apps/extension/dist into langcoach-extension-<ver>.zip
```

Layout:

- `packages/core`: all logic (plans, FSRS reviews, streak, XP, storage). Node (`@langcoach/core`) and browser (`@langcoach/core/browser`) entry points. No MCP code.
- `packages/mcp`: the MCP server published to npm as `langcoach`.
- `apps/extension`: Manifest V3 browser extension (Chrome/Edge/Brave) for `https://labs.google/lll/*` (Side Panel UI, automatic lesson capture by wrapping `fetch` (XHR is not intercepted), FSRS review deck, daily reminder).
- `docs/`: install guides (`docs/INSTALL.md`, `docs/extension/INSTALL.md`), store listing, privacy policy, and design specs.

Rules:

- No network calls and no telemetry in the core or MCP packages.
- Never lose learner data: keep writes atomic and report errors clearly.
- Product name rules: the product is "LangCoach". It is an independent project and must not imply affiliation with Google; keep the existing disclaimer in the READMEs.
- TDD: write the failing test first; new behavior and bug fixes come with a vitest test.
- Push, publish (npm) and open PRs only with the owner's approval.
- READMEs ship to npm, so use absolute `https://github.com/oktaybilge1/langcoach/blob/main/...` URLs for links in them.

See also [CONTRIBUTING.md](CONTRIBUTING.md).
