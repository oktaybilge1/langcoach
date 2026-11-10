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

Claude reads [AGENTS.md](https://github.com/oktaybilge1/langcoach/blob/main/AGENTS.md), checks your system and runs the right commands. It will not install system software silently; if Node.js is missing it will tell you how to get it. Afterwards it offers to connect [Little Language Lessons](#connect-little-language-lessons-browser-bridge) through the browser extension (optional).

Only Claude Code is tested. Other MCP-capable agents should work with the same `npx -y langcoach` command, but this is untested.

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
claude mcp add --scope user langcoach "--" npx -y langcoach
```

### Windows (native PowerShell or CMD, not WSL)

```powershell
claude mcp add --scope user langcoach "--" cmd /c npx -y langcoach
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

## Connect Little Language Lessons (browser bridge)

Optional. Keep using [Little Language Lessons](https://labs.google/lll/en) (LLL, by Google Labs) as usual, with its audio, camera and design; the LangCoach browser extension forwards each lesson you make there to the `langcoach` server on your computer, so Claude knows what you studied and can plan, review and export it. Works in Chrome, Edge and Brave (desktop).

### Let Claude set it up

In a new Claude Code session, say: *Connect LangCoach to Little Language Lessons*. Claude will:

1. ask which browser you use;
2. call `bridge_prepare_extension`, which copies the extension into `~/.langcoach/extension` and pairs it with this computer;
3. with your yes, open the extensions page and copy the folder path to your clipboard;
4. tell you the three clicks below;
5. ask you to make one Tiny Lesson on https://labs.google/lll/en and check `bridge_status` and `get_recent_lessons` to confirm it arrived.

The browser cannot install an extension silently: you have to click.

### By hand

1. In Claude Code, ask Claude to run `bridge_prepare_extension` and tell you the `path` it returns.
2. Open the extensions page: `chrome://extensions` (Chrome), `edge://extensions` (Edge) or `brave://extensions` (Brave). From a terminal:
   - Windows: `start chrome "chrome://extensions"`
   - macOS: `open -a "Google Chrome" "chrome://extensions"`
   - Linux: `google-chrome chrome://extensions`
3. Turn on **Developer mode**, click **Load unpacked**, and choose the folder from step 1.
4. Make one Tiny Lesson on https://labs.google/lll/en. The toast says *Saved · sent to your agent*. Ask Claude: *Did my LLL lesson arrive?*

Keep the folder: the browser loads the extension from it. Running `bridge_prepare_extension` again replaces it; click the reload icon on the extension card afterwards.

### How the bridge works and what it shares

- The extension sends lessons only to `http://127.0.0.1:47821`, a listener inside the `langcoach` process on your own computer. Nothing goes to the internet, and there is no account or cloud.
- It is opt-in: the listener opens only after `bridge_prepare_extension` created `~/.langcoach/bridge-token`. Set `LANGCOACH_BRIDGE=off` to keep it closed, or turn off "Your AI agent" in the extension Settings.
- Pairing: each install gets a random token. The server must prove it knows the token before the extension sends anything, and the server accepts lessons only with it. To unpair, delete `~/.langcoach/bridge-token` and remove the extension.
- The server only listens while a Claude Code session is open. Lessons made meanwhile stay in the extension and are sent later.
- Lesson text comes from a web page. Claude treats it as study data and never follows instructions inside it.
- Residual risk: another extension or program on your computer can reach the listener, but without the token it cannot store anything. A program that can read your files can read the token too, as with any local data.

### Bridge troubleshooting

| Problem | Fix |
| --- | --- |
| Extension Settings says "Waiting for your agent" | Start Claude Code (the server runs only during a session) and ask Claude to run `bridge_status`. |
| `bridge_status` reports a port error | Another program uses port 47821. Close it; a second LangCoach session simply waits and retries every 30 s. The extension only talks to 47821, so moving the server with `LANGCOACH_BRIDGE_PORT` would disconnect it. |
| "Not paired" | The folder has no valid pairing file, or the token changed. Run `bridge_prepare_extension` again and reload the extension on the extensions page. |
| "Server not verified" | Something on port 47821 cannot prove the token (an old or foreign server). Close other LangCoach versions, run `bridge_prepare_extension` again and reload the extension. |
| The browser asks to allow access to the local network | Allow it for LangCoach; it needs to reach `127.0.0.1`. Newer Chrome versions may ask this (not verified on every version). |
| Nothing arrives | Check the "Your AI agent" switch in Settings and that `LANGCOACH_BRIDGE` is not `off`. Only lessons on `https://labs.google/lll/*` are captured. |

## Where is my data?

In one file: `~/.langcoach/data.json`. On Windows that is `C:\Users\<you>\.langcoach\data.json`.

To use another folder, set `LANGCOACH_HOME` when adding the server:

```bash
claude mcp add --scope user langcoach -e LANGCOACH_HOME=/path/to/folder "--" npx -y langcoach
```

To back up or move your data, ask Claude to run the `export_data` tool, and `import_data` to restore it.

## Update

`npx` fetches the latest published version when its cache refreshes. `npx clear-npx-cache` is not a reliable way to force this. Instead, either:

- remove and add again:

  ```bash
  claude mcp remove langcoach
  claude mcp add --scope user langcoach "--" npx -y langcoach
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
| Windows: `spawn npx ENOENT`, or the server fails to start | Use the `cmd /c` form: `claude mcp add --scope user langcoach "--" cmd /c npx -y langcoach` |
| Windows PowerShell: `error: unknown option` when adding | PowerShell drops a bare `--`. Keep the quotes: `"--"` (works in PowerShell and CMD). |
| `claude mcp list` shows `langcoach` as failed | Run `npx -y langcoach` in a terminal. It should wait silently (it speaks MCP over stdin); press Ctrl+C to stop. If it prints an error instead, that is the cause. |
| `claude mcp list` shows `langcoach` as failed, or `npx -y langcoach` fails, only inside a clone of this repo | Inside the LangCoach repository, npm resolves `langcoach` to the local workspace package (`packages/mcp`), not the published one, and its `dist/` may not exist yet, so the server cannot start. Run `claude mcp list` / `npx -y langcoach` from any other folder, or run `npm install` and `npm run build` in the clone first. |
| npm registry blocked or corporate proxy | Configure npm to use your proxy (see https://docs.npmjs.com/cli/configuring-npm/npmrc), then retry. |
| "data folder is not writable" | Fix permissions on `~/.langcoach`, or set `LANGCOACH_HOME` to a folder you can write to. |
| "data file is busy" | Another session is writing right now. Wait a moment and retry. |
| Corrupt data file | LangCoach keeps the bad file as `data.corrupt-<timestamp>.json`. Restore with `import_data` from a `data.backup-<timestamp>.json`, or move `data.json` aside to start fresh. |

## Run from source

To run the latest code from this repository instead of the npm package:

```bash
git clone https://github.com/oktaybilge1/langcoach.git
cd langcoach
npm install
npm run build
claude mcp add --scope user langcoach "--" node /absolute/path/to/langcoach/packages/mcp/dist/index.js
```

On Windows use forward slashes, for example `C:/Users/you/langcoach/packages/mcp/dist/index.js`.

## Web app (coming soon)

A browser version is planned but **not built yet**. It will need a free Gemini API key from Google AI Studio: open https://aistudio.google.com/apikey, sign in with a Google account and click "Create API key". The key stays in your browser. Claude Code mode never needs it.
