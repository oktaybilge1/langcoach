# LangCoach Core + MCP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A tested core library (profile, weekly planner, FSRS reviews, streak/XP, JSON storage) and an MCP server `langcoach` that Claude Code users install with one command.

**Architecture:** npm-workspaces monorepo. `packages/core` is pure TypeScript with no I/O except the `JsonFileStore`. A `Coach` class orchestrates every use case; MCP tools are thin wrappers over `Coach`. `packages/mcp` is published to npm as `langcoach` with `core` bundled in (core stays private).

**Tech Stack:** Node ≥20, TypeScript (strict, ESM), vitest, zod, ts-fsrs, @modelcontextprotocol/sdk, tsup.

**Spec:** `docs/superpowers/specs/2026-10-20-langcoach-design.md`

## Global Constraints
- Node `>=20`, `"type": "module"`, TypeScript `strict: true`.
- No network calls and no telemetry anywhere in core or mcp.
- License MIT. Package/bin name `langcoach`. The words "Google" and "Little Language Lessons" never appear in package names, tool names or the product name; only in README attribution and disclaimer.
- Data file: `$LANGCOACH_HOME/data.json`, default `~/.langcoach/data.json`. Writes are atomic (write `data.json.tmp`, then rename).
- State `version: 1`. Dates are local `YYYY-MM-DD`; weeks are ISO `YYYY-Www` (Monday start).
- Every `Coach` method reloads state from the store before changing it and saves after (two Claude sessions must not overwrite each other with stale state).
- Before writing any code that uses ts-fsrs or the MCP SDK, check the installed version's README/types; the call names below describe intent, not guaranteed API spelling.

## Review Focus
1. Day/week boundaries: local midnight and ISO-year rollover (2027-01-01 is in `2026-W53`) must not break "today" or the plan → tests in Task 1.
2. Corrupt or hand-edited `data.json`: file is preserved as `data.corrupt-<timestamp>.json` and a clear error is raised, never silently reset → test in Task 1.
3. Any tool used before `set_profile`: clear "call set_profile first" error, not a crash → test in Task 5.
4. Completing the same task twice or an unknown task id: no double XP, clear error for unknown → tests in Task 5.
5. Non-Latin text and sloppy duplicates: `東京`, `مرحبا` round-trip unchanged; `"  Hola "` and `"hola"` are one card → tests in Task 5.

---

### Task 1: Workspace scaffold, types, dates, storage

**Files:**
- Create: `package.json` (workspaces `packages/*`, scripts `build`, `test`, `typecheck`), `tsconfig.base.json`, `.gitignore` (node_modules, dist, coverage, *.tgz), `.nvmrc` (`20`)
- Create: `packages/core/package.json` (name `@langcoach/core`, `private: true`), `packages/core/tsconfig.json`
- Create: `packages/core/src/types.ts`, `packages/core/src/dates.ts`, `packages/core/src/schema.ts`, `packages/core/src/store.ts`, `packages/core/src/index.ts`
- Test: `packages/core/test/dates.test.ts`, `packages/core/test/store.test.ts`

**Interfaces:**
- Produces (`types.ts`):
  - `type Cefr = 'A1'|'A2'|'B1'|'B2'|'C1'|'C2'`
  - `type TaskType = 'tiny_lesson'|'slang_hang'|'review'|'quiz'`
  - `interface Profile { nativeLanguage: string; targetLanguage: string; level: Cefr; goal: string; minutesPerDay: number; daysPerWeek: number; createdAt: string }`
  - `interface LessonItem { term: string; translation: string; example: string; note?: string }`
  - `interface Lesson { id: string; kind: 'tiny_lesson'|'slang_hang'; situation: string; items: LessonItem[]; createdAt: string }`
  - `interface SrsState { due: string; stability: number; difficulty: number; elapsed_days: number; scheduled_days: number; reps: number; lapses: number; state: number; last_review?: string }` (ts-fsrs card with ISO date strings; match field names to installed ts-fsrs)
  - `interface ReviewCard { id: string; lessonId: string; term: string; translation: string; example: string; srs: SrsState }`
  - `interface PlanTask { id: string; date: string; type: TaskType; minutes: number; status: 'todo'|'done'; completedAt?: string; lessonId?: string }`
  - `interface WeekPlan { week: string; theme: string; tasks: PlanTask[] }`
  - `interface LogEntry { at: string; date: string; taskId: string; type: TaskType; xp: number }`
  - `interface State { version: 1; profile: Profile|null; plans: Record<string, WeekPlan>; lessons: Lesson[]; cards: ReviewCard[]; log: LogEntry[] }`
  - `function emptyState(): State`
- Produces (`dates.ts`): `toLocalDate(d: Date): string`, `isoWeek(d: Date): string`, `weekDates(week: string): string[]` (7 dates, Monday first)
- Produces (`schema.ts`): `parseState(raw: unknown): State` (zod; throws `InvalidDataError` with a readable message)
- Produces (`store.ts`): `interface Store { load(): Promise<State>; save(s: State): Promise<void>; backup(): Promise<string|null> }`, `class JsonFileStore implements Store { constructor(filePath: string) }`, `class MemoryStore implements Store`, `class CorruptDataError extends Error { preservedAt: string }`, `defaultDataPath(env = process.env): string`

- [ ] **Step 1: Scaffold the workspace** — root and core package files above; install `typescript vitest zod ts-fsrs` (dev/regular as appropriate). Run `npm install` → exit 0.
- [ ] **Step 2: Write failing tests**

```ts
// dates.test.ts
expect(isoWeek(new Date(2026, 9, 20))).toBe('2026-W43');
expect(isoWeek(new Date(2027, 0, 1))).toBe('2026-W53');
expect(isoWeek(new Date(2027, 0, 4))).toBe('2027-W01');
expect(weekDates('2026-W43')).toEqual(['2026-10-19','2026-10-20','2026-10-21','2026-10-22','2026-10-23','2026-10-24','2026-10-25']);
expect(toLocalDate(new Date(2026, 9, 20, 23, 59))).toBe('2026-10-20');

// store.test.ts (temp dir per test)
test('missing file loads emptyState and does not create file');
test('save then load round-trips, including "東京" and "مرحبا"');
test('save is atomic: no data.json.tmp left behind');
test('corrupt JSON throws CorruptDataError and preserves original bytes in data.corrupt-*.json');
test('wrong version (version: 2) throws InvalidDataError');
test('backup() copies data.json to data.backup-*.json and returns its path; returns null when no file');
test('defaultDataPath uses LANGCOACH_HOME when set, else ~/.langcoach/data.json');
```

- [ ] **Step 3: Run** `npx vitest run packages/core` → FAIL (modules missing)
- [ ] **Step 4: Implement** `types.ts`, `dates.ts`, `schema.ts`, `store.ts`, re-export from `index.ts`. `JsonFileStore.load` validates with `parseState`; on `JSON.parse` failure it copies the file to `data.corrupt-<timestamp>.json` before throwing. Create the parent directory on first save.
- [ ] **Step 5: Run** `npx vitest run packages/core` → PASS; `npx tsc -p packages/core --noEmit` → exit 0
- [ ] **Step 6: Commit** `feat(core): workspace, types, dates and JSON store`

### Task 2: Spaced repetition wrapper

**Files:** Create `packages/core/src/srs.ts`; Test `packages/core/test/srs.test.ts`

**Interfaces:**
- Consumes: `SrsState` (Task 1)
- Produces: `type Rating = 1|2|3|4` (Again, Hard, Good, Easy), `newSrs(now: Date): SrsState`, `reviewSrs(s: SrsState, rating: Rating, now: Date): SrsState`, `isDue(s: SrsState, now: Date): boolean`

- [ ] **Step 1: Write failing tests**

```ts
test('new card is due immediately', () => expect(isDue(newSrs(now), now)).toBe(true));
test('Good pushes due into the future', () => { const s = reviewSrs(newSrs(now), 3, now); expect(isDue(s, now)).toBe(false); expect(s.reps).toBe(1); });
test('Again after Good increments lapses and keeps it due sooner than Easy');
test('state survives JSON.stringify/parse and can be reviewed again');
test('rating outside 1..4 throws');
```

- [ ] **Step 2: Run** `npx vitest run packages/core/test/srs.test.ts` → FAIL
- [ ] **Step 3: Implement** with ts-fsrs default parameters; convert Date ↔ ISO string at the boundary only.
- [ ] **Step 4: Run** → PASS
- [ ] **Step 5: Commit** `feat(core): FSRS review wrapper`

### Task 3: Weekly planner

**Files:** Create `packages/core/src/planner.ts`; Test `packages/core/test/planner.test.ts`

**Interfaces:**
- Consumes: `Profile`, `WeekPlan`, `PlanTask`, `weekDates`
- Produces: `buildWeekPlan(profile: Profile, week: string, theme: string, newId: () => string): WeekPlan`

Algorithm (fixed by spec; `n = daysPerWeek`, `m = minutesPerDay`):
- Study-day offsets from Monday: `floor(i * 7 / n)` for `i = 0..n-1`.
- Study day `k`: main type = `quiz` if `k == n-1 && n >= 2`; else `tiny_lesson` if `k` even, `slang_hang` if odd.
- If `k > 0` add a `review` task first, minutes `max(5, round(m * 0.3))`; main minutes `max(5, m - reviewMinutes)`.

- [ ] **Step 1: Write failing tests**

```ts
test('3 days/week → Mon, Wed, Fri', () => expect(dates(plan(3))).toEqual(['2026-10-19','2026-10-21','2026-10-23']));
test('7 days/week → every day, last day quiz');
test('1 day/week → Monday, single tiny_lesson, no review, no quiz');
test('main types alternate tiny_lesson, slang_hang; last is quiz', () => expect(mainTypes(plan(4))).toEqual(['tiny_lesson','slang_hang','tiny_lesson','quiz']));
test('m=20 → review 6, main 14; m=5 → review 5, main 5');
test('first study day has no review task');
test('all tasks status todo, unique ids, theme and week copied');
```

- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: Implement** `buildWeekPlan`
- [ ] **Step 4: Run** → PASS
- [ ] **Step 5: Commit** `feat(core): deterministic weekly planner`

### Task 4: Progress (XP, streak, weekly goal)

**Files:** Create `packages/core/src/progress.ts`; Test `packages/core/test/progress.test.ts`

**Interfaces:**
- Consumes: `LogEntry`, `WeekPlan`, `TaskType`
- Produces: `xpFor(type: TaskType, cardsReviewed?: number): number`, `streak(log: LogEntry[], today: string): number`, `weeklyGoal(plan: WeekPlan|undefined): { done: number; planned: number }`

- [ ] **Step 1: Write failing tests**

```ts
expect(xpFor('tiny_lesson')).toBe(20); expect(xpFor('slang_hang')).toBe(20);
expect(xpFor('quiz')).toBe(30); expect(xpFor('review', 12)).toBe(22); expect(xpFor('review')).toBe(10);
test('streak counts consecutive days ending today');
test('streak still counts up to yesterday when today has no activity yet');
test('gap of one full day resets streak to 0');
test('several entries on one day count once');
test('weeklyGoal: a study day is done when all its tasks are done; undefined plan → {0,0}');
```

- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run** → PASS
- [ ] **Step 5: Commit** `feat(core): XP, streak and weekly goal`

### Task 5: Coach service

**Files:** Create `packages/core/src/coach.ts`, `packages/core/src/errors.ts`; Test `packages/core/test/coach.test.ts`

**Interfaces:**
- Consumes: everything above
- Produces:
  - `errors.ts`: `NoProfileError`, `ThemeRequiredError`, `NotFoundError`, `InvalidDataError` (move here from Task 1 if convenient; keep export from index)
  - `class Coach { constructor(store: Store, clock?: () => Date, newId?: () => string) }`
  - `setProfile(input: Omit<Profile,'createdAt'>): Promise<Profile>` — validates (CEFR, minutesPerDay 5–180, daysPerWeek 1–7, non-empty languages); keeps original `createdAt` on update
  - `weekPlan(theme?: string): Promise<WeekPlan>` — current ISO week; creates when missing (needs theme, else `ThemeRequiredError`)
  - `today(): Promise<{ date: string; tasks: PlanTask[]; planExists: boolean }>`
  - `saveLesson(input: { kind: 'tiny_lesson'|'slang_hang'; situation: string; items: LessonItem[] }): Promise<{ lesson: Lesson; newCards: number; duplicates: string[] }>` — duplicate key = `term.trim().toLocaleLowerCase()`; 1–50 items
  - `completeTask(taskId: string, opts?: { lessonId?: string; cardsReviewed?: number }): Promise<{ task: PlanTask; xpAwarded: number; alreadyDone: boolean }>`
  - `dueReviews(limit?: number): Promise<ReviewCard[]>` — default 20, oldest due first
  - `submitReview(cardId: string, rating: Rating): Promise<ReviewCard>`
  - `progress(): Promise<{ profile: Profile|null; streak: number; totalXp: number; weekly: { done: number; planned: number }; dueCount: number }>`
  - `exportData(): Promise<State>`; `importData(raw: unknown): Promise<{ lessons: number; cards: number }>` — validate first, then `store.backup()`, then save

- [ ] **Step 1: Write failing tests** (MemoryStore, fixed clock 2026-10-20 10:00, counter ids)

```ts
test('weekPlan/today/saveLesson/completeTask before setProfile throw NoProfileError with "set_profile" in message');
test('weekPlan without theme when none exists throws ThemeRequiredError; with theme creates; second call returns same plan');
test('setProfile rejects daysPerWeek 0 and 8, minutesPerDay 4 and 181, level "Z9"');
test('setProfile update keeps createdAt');
test('saveLesson creates one card per item; "  Hola " then "hola" → second is in duplicates, no new card');
test('"東京" and "مرحبا" terms are stored and exported unchanged');
test('completeTask awards XP once; second call → alreadyDone true, xpAwarded 0, log length unchanged');
test('completeTask unknown id throws NotFoundError');
test('submitReview moves card out of dueReviews; unknown id throws NotFoundError');
test('daysPerWeek 7, complete both of today\'s tasks (Tue = review + slang_hang, cardsReviewed 0) → streak 1, totalXp 30, weekly.done 1');
test('importData with invalid shape throws and leaves existing state untouched');
test('exportData → importData round-trips deep-equal');
```

- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: Implement** — every method: `load()` → change → `save()`.
- [ ] **Step 4: Run** `npx vitest run` → PASS; typecheck → exit 0
- [ ] **Step 5: Commit** `feat(core): Coach service`

### Task 6: MCP server

**Files:**
- Create: `packages/mcp/package.json` (name `langcoach`, `bin: { "langcoach": "dist/index.js" }`, `files: ["dist","README.md","LICENSE"]`, `engines.node >=20`), `packages/mcp/tsconfig.json`, `packages/mcp/tsup.config.ts` (bundle `@langcoach/core`, shebang banner)
- Create: `packages/mcp/src/server.ts`, `packages/mcp/src/prompt.ts`, `packages/mcp/src/index.ts`
- Test: `packages/mcp/test/server.test.ts`

**Interfaces:**
- Consumes: `Coach`, `JsonFileStore`, `defaultDataPath`, errors
- Produces: `createServer(coach: Coach): McpServer`; `TUTOR_PROMPT: string`

Tools (name → Coach method; zod input schemas mirror Task 5 types; results returned as JSON text; known errors returned as `isError: true` with the message, never thrown):
`set_profile`, `get_weekly_plan {theme?}`, `get_today`, `save_lesson`, `complete_task {taskId, lessonId?, cardsReviewed?}`, `get_due_reviews {limit?}`, `submit_review {cardId, rating 1-4}`, `get_progress`, `export_data`, `import_data {json: string}`.
Prompt `tutor` (no args) → `TUTOR_PROMPT`: start with `get_progress` and `get_today`; if no profile, interview the learner then `set_profile`; if no plan, propose a theme from the goal and call `get_weekly_plan`; write lessons in the target language with translations in the native language and save them via `save_lesson` before teaching; quiz review cards one at a time and record each rating; call `complete_task` only after the learner actually finished; never invent progress; keep it encouraging and short.

- [ ] **Step 1: Write failing tests** (SDK in-memory client/server pair, Coach over MemoryStore)

```ts
test('lists exactly the 10 tools and the "tutor" prompt');
test('get_today before set_profile → isError true, text mentions set_profile');
test('full flow: set_profile → get_weekly_plan{theme} → save_lesson → complete_task (today\'s main slang_hang task, clock Tue 2026-10-20, daysPerWeek 7) → get_progress shows totalXp 20');
test('submit_review with rating 5 → schema error, not a crash');
test('import_data with "not json" → isError true and state unchanged');
```

- [ ] **Step 2: Run** `npx vitest run packages/mcp` → FAIL
- [ ] **Step 3: Implement** `server.ts`, `prompt.ts`; `index.ts` wires `JsonFileStore(defaultDataPath())` + stdio transport; on `CorruptDataError` tools return the preserved path in the error text.
- [ ] **Step 4: Run** `npx vitest run` → PASS; `npm run build -w langcoach` → `packages/mcp/dist/index.js` exists, starts with `#!/usr/bin/env node`
- [ ] **Step 5: Smoke test the packed package**: `npm pack -w langcoach` then in a fresh temp dir run `npx -y <path-to-tgz>` with stdin closed → exits cleanly without error output; with `LANGCOACH_HOME` set, nothing written until a tool is called.
- [ ] **Step 6: Commit** `feat(mcp): langcoach MCP server and tutor prompt`

### Task 7: Repo polish for launch readiness

**Files:** Create `README.md` (EN), `README.tr.md` (TR), `LICENSE` (MIT, "Copyright (c) 2026 Oktay Bilge"), `CONTRIBUTING.md`, `.github/workflows/ci.yml`, `.github/ISSUE_TEMPLATE/bug_report.md`, `.github/ISSUE_TEMPLATE/feature_request.md`; copy README/LICENSE into `packages/mcp` at build (script or tsup `onSuccess`)

- [ ] **Step 1: CI** — matrix `ubuntu-latest, windows-latest, macos-latest` × Node `20, 22`: `npm ci`, `npm run typecheck`, `npm test`, `npm run build`.
- [ ] **Step 2: README** must contain, in order: one-line pitch; placeholder for hero GIF (`docs/media/demo.gif`, recorded later); install `claude mcp add langcoach -- npx -y langcoach`; "Start with: *Use the langcoach tutor prompt*" usage; feature list; data location and export/import; attribution line linking https://labs.google/lll/en and the disclaimer "LangCoach is an independent project and is not affiliated with, endorsed by, or sponsored by Google."; roadmap (web app with Gemini key, Word Cam); contributing link. `README.tr.md` mirrors it.
- [ ] **Step 3: Verify** `npm ci && npm test && npm run build` from a clean clone of the branch → all pass; `npm pack -w langcoach --dry-run` lists only dist, README.md, LICENSE, package.json.
- [ ] **Step 4: Manual end-to-end in Claude Code** (user or executor): `claude mcp add langcoach -- node <abs>/packages/mcp/dist/index.js`, run the tutor prompt, set a profile, complete a lesson, confirm `~/.langcoach/data.json` updates and `get_progress` reflects it.
- [ ] **Step 5: Commit** `docs: README (EN/TR), license, CI and contribution guides`

Not in this plan (need explicit user go-ahead): creating the GitHub repo, pushing, `npm publish`. Web PWA is the next plan.
