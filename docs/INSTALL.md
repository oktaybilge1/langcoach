# Install LangCoach

**English** | [Türkçe](https://github.com/oktaybilge1/langcoach/blob/main/docs/INSTALL.tr.md)

LangCoach is a language-learning coach that runs inside [Claude Code](https://docs.anthropic.com/en/docs/claude-code). This guide is explicit on purpose: every step, every command, per operating system.

## Do I need an API key?

**No.** In Claude Code mode you need no API key, no extra account and no server. Your own Claude subscription (the one Claude Code already uses) writes the lessons. LangCoach only stores your plan, reviews and progress on your computer.

A planned web app (coming soon, not built yet) will need a free Gemini API key. Claude Code mode never needs it. See [Web app (coming soon)](#web-app-coming-soon).

## Easiest way: let Claude install it

1. Open Claude Code in any folder (`claude`).
2. Paste the repo link and say: *Install LangCoach for me*

   `https://github.com/oktaybilge1/langcoach`

Claude reads [AGENTS.md](https://github.com/oktaybilge1/langcoach/blob/main/AGENTS.md), checks your system and runs the right commands. It will not install system software silently; if Node.js is missing it will tell you how to get it.

## What you need

| Requirement | Where to get it | Check |
| --- | --- | --- |
| Node.js 20 or newer | https://nodejs.org (download the **LTS** installer) | `node -v` prints `v20.x.x` or higher |
| Claude Code, installed and signed in | https://docs.anthropic.com/en/docs/claude-code | `claude --version` prints a version |

Nothing else.

## Install by hand

Open a terminal (macOS: Terminal; Linux: your terminal; Windows: PowerShell or Command Prompt) and run **one** of the commands below.

### macOS, Linux and WSL

```bash
claude mcp add --scope user langcoach -- npx -y langcoach
```

### Windows (native PowerShell or CMD, not WSL)

```powershell
claude mcp add --scope user langcoach -- cmd /c npx -y langcoach
```

On native Windows Claude Code cannot start `npx` directly, so it is wrapped in `cmd /c`. If you use WSL, follow the macOS/Linux command inside WSL.

### Which scope?

- `--scope user` (recommended): LangCoach works in every folder.
- Without `--scope`, `claude mcp add` registers it only for the current project directory, so it will be missing when you start Claude Code elsewhere.

## Verify

```bash
claude mcp list
```

`langcoach` should be listed as connected. Inside Claude Code, type `/mcp` to see its status and tools.

## Your first lesson

1. Start `claude` (if it was already running, start a new session so it picks up the new server).
2. Run the prompt `/mcp__langcoach__tutor`, or just say: *Let's start my language lesson with langcoach*
3. Claude interviews you: native language, target language, level (A1 to C2), goal, minutes per day and days per week. Then it builds your first weekly plan.

## Where is my data?

In one file: `~/.langcoach/data.json`. On Windows that is `C:\Users\<you>\.langcoach\data.json`.

To use another folder, set `LANGCOACH_HOME` when adding the server:

```bash
claude mcp add --scope user langcoach -e LANGCOACH_HOME=/path/to/folder -- npx -y langcoach
```

To back up or move your data, ask Claude to run the `export_data` tool, and `import_data` to restore it.

## Update

`npx` fetches the latest published version when its cache refreshes. `npx clear-npx-cache` is not a reliable way to force this. Instead, either:

- remove and add again:

  ```bash
  claude mcp remove langcoach
  claude mcp add --scope user langcoach -- npx -y langcoach
  ```

  (Windows native: use the `cmd /c` form.)
- or pin a version: `npx -y langcoach@<version>` in the command after `--`.

Use `claude mcp remove langcoach --scope user` if you added it with `--scope user`.

## Uninstall

```bash
claude mcp remove langcoach
```

Add `--scope user` if you added it with that flag. Optionally delete the data folder `~/.langcoach` (this deletes your progress; export first if you want a backup).

## Troubleshooting

| Problem | Fix |
| --- | --- |
| `node` not found, or version is below 20 | Install the LTS version from https://nodejs.org, then close and reopen the terminal and run `node -v` again. |
| Windows: `spawn npx ENOENT`, or the server fails to start | Use the `cmd /c` form: `claude mcp add --scope user langcoach -- cmd /c npx -y langcoach` |
| `claude mcp list` shows `langcoach` as failed | Run `npx -y langcoach` in a terminal. It should wait silently (it speaks MCP over stdin); press Ctrl+C to stop. If it prints an error instead, that is the cause. |
| npm registry blocked or corporate proxy | Configure npm to use your proxy (see https://docs.npmjs.com/cli/configuring-npm/npmrc), then retry. |
| "data folder is not writable" | Fix permissions on `~/.langcoach`, or set `LANGCOACH_HOME` to a folder you can write to. |
| "data file is busy" | Another session is writing right now. Wait a moment and retry. |
| Corrupt data file | LangCoach keeps the bad file as `data.corrupt-<timestamp>.json`. Restore with `import_data` from a `data.backup-<timestamp>.json`, or move `data.json` aside to start fresh. |

## Run from source

Until the `langcoach` package is published to npm, install from source:

```bash
git clone https://github.com/oktaybilge1/langcoach.git
cd langcoach
npm install
npm run build
claude mcp add --scope user langcoach -- node /absolute/path/to/langcoach/packages/mcp/dist/index.js
```

On Windows use forward slashes, for example `C:/Users/you/langcoach/packages/mcp/dist/index.js`.

## Web app (coming soon)

A browser version is planned but **not built yet**. It will need a free Gemini API key from Google AI Studio: open https://aistudio.google.com/apikey, sign in with a Google account and click "Create API key". The key stays in your browser. Claude Code mode never needs it.
