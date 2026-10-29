# Installing the LangCoach Browser Extension

**English** | [Türkçe](https://github.com/oktaybilge1/langcoach/blob/main/docs/extension/INSTALL.tr.md)

LangCoach works in **Google Chrome**, **Microsoft Edge**, **Brave** and other Chromium-based browsers (version 116 or newer). No account or API key is required.

---

## Option 1: Browser store (coming soon)

- **Chrome Web Store:** _link will be added after review_
- **Microsoft Edge Add-ons:** _link will be added after review_

---

## Option 2: Install from the ZIP (Load unpacked)

1. Download `langcoach-extension-0.2.0.zip` from [GitHub Releases](https://github.com/oktaybilge1/langcoach/releases) and **extract it** to a folder you will keep (for example `Documents/langcoach-extension`). Do not delete that folder later: the browser loads the extension from it.
2. Open your browser's extensions page:
   - **Chrome:** `chrome://extensions`
   - **Edge:** `edge://extensions`
   - **Brave:** `brave://extensions`
3. Turn on **Developer mode** (top-right toggle; in Edge it is in the left sidebar).
4. Click **Load unpacked** and select the extracted folder, the one that directly contains `manifest.json`.
5. Pin **LangCoach** in the toolbar, click its icon to open the side panel, then go to [Little Language Lessons](https://labs.google/lll/en). If a Little Language Lessons tab was already open, reload it once.

Your browser may show a "Developer mode extensions" notice at startup; that is normal for extensions loaded this way.

### Update to a newer ZIP

Extract the new ZIP over the same folder (or into a new folder), then click the **reload** icon on the LangCoach card in the extensions page (or remove it and Load unpacked again). Your data is kept as long as you do not remove the extension. To be safe, export a JSON backup first in **Settings**.

### Build it yourself (from source)

```bash
git clone https://github.com/oktaybilge1/langcoach.git
cd langcoach
npm install
npm run build
npm run zip -w @langcoach/extension   # optional: writes apps/extension/langcoach-extension-<version>.zip
```

Then Load unpacked the `apps/extension/dist` folder (it directly contains `manifest.json`).

---

## Optional: native-language translations

On desktop Chrome 138 or newer, LangCoach can translate captured words into your native language on your device with Chrome's built-in Translator API. The first time, Chrome may need to download the language model; the panel shows a button for that. In browsers without this API, cards simply keep the meanings the lesson gave.

---

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| "Manifest file is missing or unreadable" | Select the folder that directly contains `manifest.json` (the extracted ZIP folder or `apps/extension/dist`), not the ZIP file itself and not the repository root. |
| No toast appears when generating a lesson on `labs.google/lll/*` | Reload the `labs.google/lll/*` tab once after installing or reloading the extension so the content scripts attach. |
| The side panel does not open on click | Make sure your browser is version 116 or newer, or right-click the LangCoach toolbar icon and choose **Open side panel**. |
| "Start" on a scenario card copies the text instead of starting | The Tiny Lesson page was not ready (for example the first-visit intro was showing). Open Tiny Lesson, finish the intro once, then press Start again, or paste the copied text yourself. |
| Moving to a new computer | In the side panel open **Settings**, export a JSON backup, then import it on the new computer. |

LangCoach is an independent project and is not affiliated with, endorsed by, or sponsored by Google.
