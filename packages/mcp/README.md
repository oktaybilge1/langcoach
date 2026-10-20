# langcoach

A language-learning coach for Claude Code. Claude writes the lessons; this MCP server stores your profile, weekly plan, streak and spaced-repetition reviews locally.

```
claude mcp add langcoach -- npx -y langcoach
```

Then use the `tutor` prompt to start a session. Data lives in `~/.langcoach/data.json` (override the folder with `LANGCOACH_HOME`). No network calls, no telemetry.
