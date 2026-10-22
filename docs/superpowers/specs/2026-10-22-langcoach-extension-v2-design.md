# LangCoach Extension v2 — "Duolingo-level" Design

## Intent (owner)
"Google bile 'keşke biz böyle çıkarsaydık' demeli." v1 captures lessons and tracks progress, but the owner's live test showed it still feels like a tracker, not a learning product. v2 turns LLL + LangCoach into a real learning experience: the learner understands everything in their own language, practices actively in short game-like sessions, and feels rewarded every day. Owner's direct feedback so far: dislikes flip-card-only review ("kelimeler listelensin direkt"); wants Turkish meanings; wants one-tap scenarios; wants it to feel premium.

## Goals
1. **Native-language layer (on-device).** Every saved word/phrase also gets a translation into the learner's native language (e.g. Turkish) using Chrome's built-in on-device Translator API (Chrome 138+, desktop; no key, no network from our code). On the LLL page, a small native-language line appears under each vocabulary/phrase card and grammar example. If the API or language pair is unavailable, everything still works without it (English meaning shown).
2. **Practice sessions (the core "Duolingo" loop).** A "Practice" button starts a ~10-exercise session built from the learner's deck (due cards first, then new, then weak). Exercise types:
   - Meaning choice: target term (+🔊) → pick the meaning (4 options).
   - Reverse choice: meaning → pick the target term (4 options).
   - Listening: 🔊 audio only → pick the term (4 options) — only when a TTS voice for the target language exists.
   - Match pairs: 5 terms ↔ 5 meanings, tap to pair.
   - Type it: meaning → type the target term (accent/case/punctuation-tolerant, 1 typo allowed for ≥6 chars; "almost — check spelling" feedback).
   - Fill the blank: an example sentence from LLL with the term blanked → pick the word.
   Immediate feedback (green/red, correct answer shown, 🔊), progress bar, combo counter, end screen with XP earned, accuracy, words strengthened, and confetti on perfect sessions. Answers feed FSRS (correct first try → Good; correct after a hint/typo → Hard; wrong → Again). Sounds generated with WebAudio (no assets), toggleable.
3. **Daily goal & streak like Duolingo.** Choose a daily XP goal (Casual 10 / Regular 20 / Serious 30 / Intense 50). Streak = days the daily goal (or ≥1 practice session) was met. Streak freeze: earned automatically every 7-day streak (max 2 held), consumed automatically to protect a missed day. Animated streak flame, "streak extended" celebration, weekly XP bar chart (7 days).
4. **Vocabulary hub (replaces flip-only review as default).** List of all words grouped by lesson/theme with search, filters (All / Due / New / Weak / Favorites / Mastered), per-word strength meter (from FSRS stability/state), ⭐ favorite, 🔊, inline edit of native translation, "I know this" (marks mastered once: FSRS Easy, XP awarded once per card, idempotent). Flip-card mode stays available.
5. **One-tap scenarios.** "Today" suggests 3 scenarios (≤40 chars, localized). Tapping "Start" focuses/opens the LLL Tiny Lesson tab, fills the purpose field and presses Generate for the learner; after capture, the panel offers "Practice these words now".
6. **Polish & delight.** Friendly visual identity (rounded cards, bold colors, playful micro-animations respecting prefers-reduced-motion), level system with named levels, more achievements (perfect session, 100 XP day, 10 sessions, first match game), clear empty states guiding the next action.

## Non-goals (v2)
- Microphone pronunciation scoring (Chrome Web Store reviews audio capture strictly; Web Speech in extensions is unofficial) — v3 candidate.
- Leagues/friends (needs a backend).
- Hearts/lives that block learning (anti-goal: never punish the learner).
- Calling any translation or AI service over the network.

## Anti-goals
- Never break LLL (writing into its input must respect its 50-char limit and React-controlled input semantics; if the field isn't found, show a copy fallback instead of guessing).
- Never award XP twice for the same action (e.g. "I know this" spam).
- Never lose data; v2 data stays inside core State v1 (loose schema; new optional fields only).

## Data additions (core, optional fields)
- `ReviewCard.nativeTranslation?: string`, `ReviewCard.favorite?: boolean`, `ReviewCard.mastered?: boolean`.
- `Profile.dailyGoalXp?: 10|20|30|50` (default 20).
- `State.streakFreezes?: number`, `State.freezeUsedDates?: string[]`, `State.sessions?: { at, date, exercises, correct, xp }[]` (cap 500, oldest dropped).
- Practice XP: 1 XP per correct answer + 5 completion bonus + 5 perfect bonus; "I know this" 2 XP once per card.

## Builder's calls
- Translator API used from extension pages/content script via `self.Translator` with availability checks and download progress; translations cached on cards; batch translate at capture (content script) and lazily in the hub for older cards.
- Exercise generation is a pure, seeded, unit-tested module (`apps/extension/src/lib/practice/`); distractors drawn from the same target language deck, never duplicates of the answer; sessions require ≥4 cards (otherwise guide to do a lesson).
- Answer checking: Unicode NFKD normalization, strip diacritics/punctuation, case-fold, Damerau-Levenshtein ≤1 for length ≥6.
- Side panel gets a 6th tab "Practice" (default tab when cards are due) and "Words" (hub) replaces "Review" label; flip mode inside Words.
- All new strings in 5 locales.

## Success
On a fresh profile: do one Tiny Lesson → toast → panel shows Turkish meanings → "Practice" runs 10 mixed exercises with sounds and an end screen → streak/goal ring updates → next day due words come back in practice. E2E covers this with the local LLL mock (Translator API stubbed in e2e).
