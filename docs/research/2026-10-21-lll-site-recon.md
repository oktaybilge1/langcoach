# Little Language Lessons — site recon (2026-10-21)

Observed live on https://labs.google/lll (Next.js app, basePath `/lll`). Data shapes below are what the page received; Google may change them at any time.

## Routes
- Home: `/lll/<siteLang>` — siteLang ∈ `en`, `es`, `fr`, `pt` (UI / source language).
- Experiments: `/lll/<siteLang>/experiments/tiny-lesson`, `/slang-hang`, `/word-cam`. Client-side navigation between them (SPA).
- First visit to an experiment shows a "Before you begin" notice ("I understand" + Continue); acceptance stored in cookie `disclaimer_acknowledged`. Other cookies: `NEXT_LOCALE`, `guest_session`, GA.
- No localStorage/sessionStorage use.

## Target languages (dropdown, 23)
Arabic, Chinese (China), Chinese (Hong Kong), Chinese (Taiwan), English (AU), English (UK), English (US), French (Canada), French (France), German, Greek, Hebrew, Hindi, Italian, Japanese, Korean, Portuguese (Brazil), Portuguese (Portugal), Russian, Spanish (LatAm), Spanish (Spain), Turkish, Urdu.
The request uses a different label than the dropdown (e.g. "Spanish (Spain)" → `"European Spanish"`, "Chinese (China)" → `"Mandarin Chinese"`).

## API (all `POST https://labs.google/lll/api/insights/<name>`, JSON body, called via `window.fetch` — interceptable by wrapping fetch in the page's main world before the app loads)

### Tiny Lesson
Request (both calls): `{"sourceLanguage":"English","targetLanguage":"European Spanish","purpose":"ordering coffee at a cafe"}`
- `terms` → `{ vocabulary: [{ term, transliteration, translation }], phrases: [{ phrase, transliteration, translation }] }`
  - `term` may contain a newline for gendered pairs: `"el camarero (m)\nla camarera (f)"` (transliteration then `"\n"`).
- `grammar` → `{ relevantGrammar: [{ topic, description, examples: [{ sentence, transliteration, translation, explanation }] }] }`
- Regenerate button re-issues both calls with the same body.

### Slang Hang
Request: `{"sourceLanguage":"English","targetLanguage":"Mandarin Chinese"}`
- `conversation` → `{ context, dialogue: [{ speaker, gender, message, transliteration, notes: { "<slang expression>": "<explanation>" } }] }` (notes may be `{}`; transliteration filled for non-Latin scripts, e.g. pinyin).

### Word Cam (camera; also a hidden file input accepting image/png, image/jpeg)
- `detect-objects` request `{ sourceLanguage, targetLanguage, image, imageDimensions }` → `{ objects: [...] }` (bounding boxes)
- `object-descriptors` request `{ sourceLanguage, targetLanguage, object, image: { inlineData: { data, mimeType } } }` → `{ descriptors: [{ descriptor, pronunciation, translation, exampleSentence, exampleSentencePronunciation, exampleSentenceTranslation }] }`
- Not exercised live (needs camera); shapes read from the page bundle.

## UI notes
- Tiny Lesson result: title "<Language> for <purpose>", tabs Vocabulary / Phrases / Tips, cards with a speaker (audio) button, edit / regenerate / close buttons.
- Slang Hang result: conversation bubbles with reveal-per-line.

## Implications for the LangCoach extension
- Capture lesson content from API responses (precise, structured) rather than scraping DOM.
- Keep a DOM-independent fallback: select text on the page → "Save to LangCoach".
- Never send data anywhere; never call Google's API ourselves (only observe responses the user's own actions produced).
