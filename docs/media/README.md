# Media to record (demo GIF and store screenshots)

Nothing in this folder exists yet except this file. The owner records the media; until then no README links to an image here, so there are no broken image links. When a file is added, add the image to the README (the spot is marked with an HTML comment under the tagline) and to the store dashboards.

## Setup before recording

- Production build loaded unpacked (`npm run build`, then Load unpacked `apps/extension/dist`), or the store build. Not the e2e build.
- A fresh browser profile with the UI language you want to show (English for the main set; Turkish for a second set if wanted).
- Chrome 138+ desktop if you want to show native-language translation (download the language model before recording).
- Seed a realistic deck by generating 2 or 3 Tiny Lessons first (for example Spanish (Spain), "ordering at a café", "asking for directions"), so Words and Practice have content. Practice needs at least 4 words.
- Window size so the whole browser viewport is **1280×800**; side panel open on the right. Light theme for the main set.
- Hide bookmarks bar, other extensions and personal data (profile picture, other tabs).

## Demo GIF: `extension-demo.gif`

- **Size:** 1280×800 (or 1280×720 if the tool needs 16:9), about **15 seconds**, under 8 MB, 10 to 15 fps, loops.
- **Script (about 15 s):**
  1. 0 to 3 s: Little Language Lessons Tiny Lesson page on the left, LangCoach Today on the right (goal ring, streak flame, scenario cards).
  2. 3 to 6 s: press **Start** on a scenario card; the language and purpose fill in and the lesson generates.
  3. 6 to 8 s: the toast "✓ 20 words saved to LangCoach" appears on the page.
  4. 8 to 12 s: switch to **Practice**, answer two exercises (one right, one "pick the meaning"), show the green feedback sheet.
  5. 12 to 15 s: end screen with XP and the goal ring filling up; end on the streak flame.
- No mouse jitter; pause about half a second on each new screen.

## Store screenshots (1280×800 PNG)

| File | What to show |
| --- | --- |
| `store-1-today.png` | Side panel next to Tiny Lesson: goal ring, streak flame with freezes, scenario cards, and the on-page save toast. |
| `store-2-practice.png` | A practice exercise (pick the meaning) with the feedback sheet open. |
| `store-3-words.png` | Words hub: groups by situation, filter chips, strength meters, one favorite star. |
| `store-4-progress.png` | Progress: level bar, 7-day XP chart, achievements. |
| `store-5-export.png` | Settings: Export cards (Anki / Quizlet / CSV) and the local-data / privacy note. |

Optional: `install-unpacked.png` (the extensions page with Developer mode on and the LangCoach card) for the install guide.

## Rules

- Show only LangCoach and the public Little Language Lessons page; no personal data.
- Do not use Google logos or imply endorsement; the store texts carry the "not affiliated with Google" disclaimer.
- Keep files small (PNG optimized, GIF under 8 MB); do not commit raw screen recordings.
