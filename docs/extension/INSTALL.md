# Installing the LangCoach Browser Extension

**English** | [Türkçe](https://github.com/oktaybilge1/langcoach/blob/main/docs/extension/INSTALL.tr.md)

LangCoach works in **Google Chrome**, **Microsoft Edge**, **Brave**, and other Chromium-based browsers (version 116+). No account or API key is required.

---

## Option 1: Browser Store (Coming Soon)

- **Chrome Web Store:** _Link placeholder (pending review)_
- **Microsoft Edge Add-ons:** _Link placeholder (pending review)_

---

## Option 2: Install from GitHub Releases (Unpacked / ZIP)

1. Download the latest `langcoach-extension-0.1.0.zip` from [GitHub Releases](https://github.com/oktaybilge1/langcoach/releases) and extract it to a folder on your computer.
   - Or build from source:
     ```bash
     git clone https://github.com/oktaybilge1/langcoach.git
     cd langcoach
     npm install
     npm run build
     ```
     The built extension will be in `apps/extension/dist`.
2. Open your browser's extensions page:
   - **Chrome:** `chrome://extensions`
   - **Edge:** `edge://extensions`
   - **Brave:** `brave://extensions`
3. Turn on **Developer mode** (toggle in the top-right corner, or left sidebar in Edge).
4. Click **Load unpacked** and select the extracted folder (or `apps/extension/dist` if you built from source — the folder that directly contains `manifest.json`).
5. Pin **LangCoach** in your browser toolbar and click its icon to open the Side Panel, then visit [Little Language Lessons](https://labs.google/lll/en).

<!-- Screenshot placeholder: docs/media/install-unpacked.png -->

---

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| "Manifest file is missing or unreadable" | Select the folder that directly contains `manifest.json` (`apps/extension/dist` or the unzipped release folder), not the repository root. |
| No toast appears when generating a lesson on `labs.google/lll/*` | Refresh the `labs.google/lll/*` tab once after installing or reloading the extension so the content scripts attach. |
| Side panel does not open on click | Ensure your Chromium browser is version 116 or newer, or right-click the LangCoach toolbar icon and choose **Open side panel**. |
| Moving to a new computer | Open **Settings → Export JSON** in the LangCoach side panel, then use **Import JSON** on the new computer. |
