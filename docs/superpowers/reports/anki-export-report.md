# Anki / Quizlet / CSV export report

- Core: `exportCards(state, 'anki' | 'quizlet' | 'csv', { deck, includeMastered, now })` in `packages/core/src/export-cards.ts`, exported from `index.ts` and `browser.ts`. Optional `now` option (for the filename date and tests) is an addition to the spec.
- MCP: `export_cards` tool (11 tools now), 2 MB cap returns isError.
- Extension: Settings > Export cards (three buttons, Blob URL revoked after 60 s), strings in en, tr, es, fr, pt_BR.
- Docs: `docs/ANKI.md`, `docs/ANKI.tr.md`, README links.
- Notes come from the lesson item matched by term (`ReviewCard` has no `note` field).
- Security follow-up: CSV formula guard now covers every cell (including `due`, `lesson`, `language`) except strict ISO date-times, skips leading whitespace/control/format characters before testing `= + - @`, and also guards a leading tab or CR. Documented trade-off: `-ing suffix` is prefixed. Anki and Quizlet are unaffected.
- Review fixes: CSV starts with a UTF-8 BOM (CSV only); ISO exemption removed (uniform guard); leading LF treated like tab/CR; Anki GUID sanitized to [A-Za-z0-9_-]; MCP 2 MB cap measured on the JSON reply with a corrected error message; panel test uses vi.spyOn on URL instead of overwriting the global.
- TDD: tests were written first and failed (core 16 failed, MCP 4 failed, panel 6 failed, hardened guard 3 failed) before implementation.
