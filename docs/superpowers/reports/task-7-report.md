# Task 7 report: LangCoach 0.2.0 release preparation

Date: 2026-10-29. Branch: `main` (pushed after each commit). Plan: `docs/superpowers/plans/2026-10-28-extension-v2-finish.md`, section "Task 7 — finish".

## Commits

| Commit | What |
| --- | --- |
| `2366151` | feat(extension): Practice a11y polish (live region, focus, radiogroup, AudioContext close, unsaved-save guard) |
| `31e7972` | chore(release): 0.2.0 for the extension and the `langcoach` MCP package; CHANGELOG |
| `8aefeb0` | ci: read-only workflow permissions; pack smoke expects 11 tools (export_cards) |
| `ea22bd9` | fix(extension): compile dev hosts out of production bundles; zip refuses e2e/dev-only code |
| `44f0171` | docs: in-repo npx gotcha in INSTALL (EN/TR) and AGENTS.md |
| `e603f08` | docs: v2 README (EN/TR), store listing, privacy policy, extension install guides, media shot list |
| (this) | docs: Task 7 report |

## 1. Practice a11y polish (TDD)

RED first: 14 new or changed tests failed before the code change (`practice-view.test.tsx` 8, `practice-exercises.test.tsx` 4, `sound.test.ts` 2). Then GREEN, 53/53 in those files.

- **Persistent live region:** `<p class="sr-only" role="status" aria-live="polite" aria-atomic="true" data-testid="practice-announcer">` lives for the whole run and is filled with the feedback title (plus "Correct answer: …" / the expected spelling). The visual sheet no longer has `role`/`aria-live`, so nothing is announced twice. Test: same DOM node before and after the answer, empty before and after Continue.
- **Focus management:** Choice focuses its first option on mount (only while active), TypeAnswer already focused its input, Practice focuses the first match word for match games, Continue is focused after an answer (existing), and the end-screen `<h1 tabindex="-1">` is focused on finish. Test walks a whole 5-card session (incl. a match game) and asserts focus on each screen.
- **Choice = radiogroup:** `role="radiogroup"` with `role="radio"` + `aria-checked`, roving tabindex, ArrowUp/Down/Left/Right move the selection with wrap-around. Keys 1–4 and Enter unchanged.
- **Combo counter:** `aria-live` removed (test).
- **AudioContext:** `Sounds.close()` added (closes once, swallows errors and rejected promises, the next `play` creates a fresh context); Practice calls it on unmount (test).
- **Failed save:** the automatic save retries once after `retryDelayMs` (default 400 ms; `recordPractice` is idempotent by session id). If it still fails, the error + Retry stay, and Done / Practice again show a `role="alert"` warning (`pxLeaveUnsaved`, all 5 locales) on the first press and leave on the second. A saved session leaves on the first press (test).
- **Match:** unused `active` prop removed; a `@ts-expect-error` test keeps it out.

## 2. Gotcha doc

Added to `docs/INSTALL.md` and `docs/INSTALL.tr.md` troubleshooting tables and to AGENTS.md "If you are developing LangCoach": inside a clone, `npx -y langcoach` / `claude mcp list` resolves to the local workspace package `packages/mcp`; run from another folder or `npm run build` first. Also reworded "Run from source" (the package is on npm since 0.1.0, so "until it is published" was stale).

## 3. Docs for v2

- README.md / README.tr.md: extension first, MCP second; feature list (Words hub, practice sessions, daily goal + streak freezes, levels/achievements, on-device translation, one-tap scenario, Anki/Quizlet/CSV export, 5 UI languages); new "Why not just ask a chatbot?" / "Neden doğrudan bir sohbet botuna sormuyorum?" section (persistent plan, FSRS schedule, honest numbers, local data, lessons from your life, plus an explicit "does not replace a teacher, does not grade speaking"); disclaimer kept; absolute GitHub URLs; removed the stale "not on npm yet" line; CHANGELOG link.
- docs/extension/STORE_LISTING.md: 0.2.0 metadata, EN + TR names, short (125 / 129 chars) and long descriptions, Education, privacy-practices answers incl. data-usage and remote-code, one justification per permission, screenshots list (placeholders), speech-voice and Translator API disclosures, Edge note.
- docs/PRIVACY.md: no network requests, no analytics, no account, local storage only (extension and MCP), export files created locally, what is read on LLL, speech voices and Translator API (model download by Chrome), one line per permission incl. `unlimitedStorage` (10 MB default quota; deck plus up to 3 rolling local backups) and `alarms` (daily rollover + reminder).
- docs/extension/INSTALL.md / .tr.md: Load unpacked from `langcoach-extension-0.2.0.zip`, keep the folder, update flow, build from source, store link placeholders, translation note, new troubleshooting row for scenario Start falling back to copy.

Claims checked against code: permissions (`manifest.json`, `manifest.test.ts`), no `fetch`/XHR/WebSocket/beacon in `apps/extension/src` (grep), sender policy (`background/policy.ts`), freezes every 7 days (`core/streak.ts FREEZE_EVERY_DAYS`), `MAX_BACKUPS = 3` (`background/store.ts`), rollover alarm (`background/index.ts`), Translator API Chrome 138+ (`lib/translate.ts`), model download button (`NativeBanner.tsx`), six exercise kinds and session size 10 (`Practice.tsx`), TR UI labels from `_locales/tr`.

## 4. Versions

- `apps/extension/package.json`, `apps/extension/public/manifest.json`, `packages/mcp/package.json` → `0.2.0`; `package-lock.json` updated with `npm install --package-lock-only` (2 lines).
- Settings > About showed a hard-coded `v0.1.0`; it now imports `version` from the manifest (new `test/version.test.tsx`: manifest = package = 0.2.0, Settings renders `v0.2.0`; RED first).
- The MCP injected-version test (`packages/mcp/test/server.test.ts`) stays green (reads package.json).
- `CHANGELOG.md` (Keep a Changelog) with 0.2.0 (Added / Security / Fixed / Changed) and a short 0.1.0. No compare links, because the repo has no `v0.1.0` tag.

## 5. Release artifacts (found and fixed a real problem)

The first production build still contained dev-only strings: `background.js` had `"http://localhost/*"` (context-menu patterns) and `hostname === "localhost"` (sender policy), `content-main.js` had the `allowLocalhost` option and the localhost URL check. They were dead at runtime (guarded by `e2e=false`), but would fail the "no localhost anywhere" rule and look bad to a store reviewer. Fix: `src/shared/dev-hosts.ts` (`DEV_HOSTNAMES` folds to `[]` when `__E2E__` is false, so the bundler drops the names), used by menu, policy and parse; option renamed `allowDevHosts`. `scripts/zip.mjs` now also refuses any bundle file containing `data-e2e-answer`, `data-langcoach-e2e`, `localhost` or `127.0.0.1` (3 new zip tests, RED first). E2E still 9/9 because the e2e build keeps the hosts.

Zip verification (`node verify-zip.mjs apps/extension/langcoach-extension-0.2.0.zip`, scratch script, not committed):

```
zip: apps/extension/langcoach-extension-0.2.0.zip
size: 203828 bytes, 17 entries
PASS  valid zip (EOCD found)
PASS  entries read (17)
PASS  manifest.json at the archive root
PASS  manifest version 0.2.0  [0.2.0]
PASS  permissions exactly storage, unlimitedStorage, sidePanel, contextMenus, alarms, notifications
PASS  host_permissions exactly ["https://labs.google/lll/*"]
PASS  no optional permissions / externally_connectable / web_accessible_resources
PASS  no localhost / 127.0.0.1 / [::1] / data-e2e-answer / data-langcoach-e2e in any text file
PASS  icons 16/32/48/128 present and PNG
PASS  manifest icon paths resolve
PASS  all 5 locales present (en, tr, es, fr, pt_BR)
PASS  every locale has the same 276 keys
PASS  service worker, side panel and content scripts present  [background.js, sidepanel.html, content-main.js, content-isolated.js]
PASS  no source maps
ALL CHECKS PASSED
```

Entries: `background.js, content-isolated.js, content-main.js, manifest.json, sidepanel.html, sidepanel.js, assets/sidepanel-*.css, chunks/translate-*.js, icons/{16,32,48,128}.png, _locales/{en,es,fr,pt_BR,tr}/messages.json`. The zip is git-ignored (`.gitignore:5 *.zip`). Running `npm run zip` on the e2e dist is refused ("dist/manifest.json is a dev/e2e build").

`npm pack -w langcoach --dry-run`: `langcoach@0.2.0`, 4 files: `LICENSE` (1.1 kB), `README.md` (9.9 kB), `dist/index.js` (56.0 kB), `package.json` (1.3 kB); 20.8 kB packed. Local pack smoke (what CI runs): `SMOKE OK: langcoach@0.2.0, 11 tools (… export_cards …), exit 0, stderr empty, no data.json`.

## 6. CI

`.github/workflows/ci.yml` jobs still match the scripts: `test` (npm ci, typecheck, test, build on 3 OS × Node 20/22), `pack-smoke`, `extension-e2e` (e2e, production build, zip, upload artifact). Added workflow-level `permissions: contents: read`. Found and fixed: `scripts/smoke-stdio.mjs` expected 10 tools; with `export_cards` there are 11, so the `pack-smoke` job would have failed on the next push.

## 7. Media placeholder

`docs/media/README.md`: setup, a 15 s demo GIF script at 1280×800, five store screenshots, rules. No README or guide references a missing image (only the three badges are images; placeholders are HTML comments or plain text paths).

## Final verification (in order)

1. `npx vitest run`: 62 files, **756 tests passed** (736 before Task 7).
2. `npm run typecheck`: clean (exit 0).
3. `npm run test:e2e -w @langcoach/extension`: **9 passed**.
4. `npm run build`, `npm run zip -w @langcoach/extension`, zip checks: all passed (above).

## Concerns / for the owner

- Store upload and `npm publish -w langcoach --access public` are yours (not done). Also create a GitHub Release `v0.2.0` with the zip; the install guides point to Releases, and the CHANGELOG has no compare links because there is no `v0.1.0` tag (consider tagging both).
- Media files are not recorded yet; the store needs at least one screenshot.
- The "inside a clone" npx gotcha is documented as described in the task; I did not reproduce the failure myself.
- Chrome's Translator API availability in Edge/Brave is described cautiously ("may be missing"); not tested in those browsers.
- Choice now moves focus to the first option on every new exercise; screen readers will read that option after the prompt. Real screen-reader testing (NVDA/VoiceOver) was not done, only jsdom tests and the Playwright e2e.
