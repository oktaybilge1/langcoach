See [AGENTS.md](AGENTS.md) for all instructions.

If a user asks you to install LangCoach (no API key needed, never ask for one): check `node -v` is 20+ and `claude --version`, then run `claude mcp add --scope user langcoach "--" npx -y langcoach` (Windows native: `claude mcp add --scope user langcoach "--" cmd /c npx -y langcoach`), confirm with `claude mcp list`, and tell the user to start a new session and run `/mcp__langcoach__tutor`. Do not silently install system software.
