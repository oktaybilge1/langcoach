# Privacy Policy: LangCoach

**Effective date:** October 29, 2026 (version 0.2.0)

This policy covers the LangCoach browser extension and the `langcoach` MCP server for Claude Code.

## Summary

LangCoach **does not collect, transmit or share any personal data or browsing history**, and it has no servers. Everything it stores stays on your own device.

## What LangCoach does and does not do

- **No network requests:** LangCoach itself makes no network requests. It never calls an API, never contacts a LangCoach server (there is none), and never calls Google's APIs itself.
- **No analytics:** no analytics, tracking, advertising, crash reporting or telemetry of any kind.
- **No account:** no sign-up, email address or API key.
- **Local storage only:**
  - Extension: your profile, weekly plan, captured cards, review and practice history, progress and settings are kept in your browser's extension storage (`chrome.storage.local`) on this device. They are not synced to other devices.
  - MCP server: everything is in one file on your computer, `~/.langcoach/data.json` (or the folder you set with `LANGCOACH_HOME`).
- **Export files are created locally:** the Anki, Quizlet and CSV exports and the JSON backup are generated on your device and saved where you choose (the extension uses your browser's normal download). Nothing is uploaded.
- **You stay in control:** you can export, import or delete all data at any time (extension: Settings; MCP: the `export_data` / `import_data` tools or deleting `~/.langcoach`). Uninstalling the extension removes its storage.

## What the extension reads on Little Language Lessons

The extension runs only on `https://labs.google/lll/*`. There it reads the lesson results that the page loads in response to your own actions (Tiny Lesson, Slang Hang, Word Cam) and turns them into cards on your device. It does not read other sites, other tabs or your browsing history. When you use "Start" on a scenario card, it fills the Tiny Lesson purpose field with that scenario text, selects your target language and presses Generate on the page for you, exactly as you would by hand.

## Browser features LangCoach uses (processed by your browser, not by LangCoach)

- **Pronunciation (🔊):** uses your browser's built-in speech voices (`speechSynthesis`). For some voices (for example Chrome's online "Google" voices) the browser vendor may process the spoken text on its servers. LangCoach does not send this itself; you can avoid it by not using the button or by choosing a local voice in your operating system.
- **On-device translation:** where available (desktop Chrome 138+), LangCoach uses Chrome's built-in Translator API to translate captured words into your native language. The translation runs on your device. The first time a language pair is used, Chrome may download the translation model; that download is done by Chrome, not by LangCoach.

## Permissions explained

- `storage`: saves your profile, plan, cards, progress and settings locally on your device.
- `unlimitedStorage`: lifts the default 10 MB limit of extension storage, so a large deck plus its few rolling local safety backups is never cut off or refused as your vocabulary grows.
- `sidePanel`: shows the LangCoach side panel (Today, Practice, Words, Plan, Progress, Settings) next to the lesson page.
- `contextMenus`: adds the "Save to LangCoach" right-click item for selected text on `https://labs.google/lll/*` pages.
- `alarms`: runs the daily rollover (streak and freezes at midnight) and your optional daily reminder at the time you choose.
- `notifications`: shows the optional daily reminder as a local notification.
- Host permission `https://labs.google/lll/*`: lets the extension run only on Little Language Lessons pages, to capture the lessons you generate, show the save toast and translation lines, and start a scenario when you ask.

## Children

LangCoach is a general-audience learning tool and does not knowingly collect any data from anyone, including children.

## Changes

If this policy changes, the new version will be published in this file with a new effective date.

## Contact

Questions: open an issue at https://github.com/oktaybilge1/langcoach/issues.

## Disclaimer

LangCoach is an independent open-source project and is not affiliated with, endorsed by, or sponsored by Google.
