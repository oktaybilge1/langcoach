import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { exportCards, type Coach } from '@langcoach/core';
import pkg from '../package.json' with { type: 'json' };
import { TUTOR_PROMPT } from './prompt.js';

type ToolResult = { content: { type: 'text'; text: string }[]; isError?: boolean };

const ok = (value: unknown): ToolResult => ({
  content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
});

// Error messages are written for the learner. A CorruptDataError message already names the
// preserved copy and the recovery steps, so it is passed through as is.
const fail = (err: unknown): ToolResult => ({
  isError: true,
  content: [{ type: 'text', text: err instanceof Error ? err.message : String(err) }],
});

async function run(fn: () => Promise<unknown>): Promise<ToolResult> {
  try {
    return ok(await fn());
  } catch (err) {
    return fail(err);
  }
}

/** Largest export returned in one tool reply. */
const MAX_EXPORT_BYTES = 2 * 1024 * 1024;

const nonEmpty = z.string().trim().min(1);

export function createServer(coach: Coach): McpServer {
  const server = new McpServer({ name: 'langcoach', version: pkg.version });

  server.registerTool(
    'set_profile',
    {
      description:
        "Save or update the learner profile. Call this once at the very start (after interviewing the learner), or when their level, goal or schedule changes. Required before the other tools, except export_data, import_data and get_progress, which work without a profile. A changed schedule (minutes per day, days per week) applies from next week's plan; this week's existing plan is kept.",
      inputSchema: {
        nativeLanguage: nonEmpty,
        targetLanguage: nonEmpty,
        level: z.enum(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']),
        goal: z.string(),
        minutesPerDay: z.number().int().min(5).max(180),
        daysPerWeek: z.number().int().min(1).max(7),
      },
    },
    (args) => run(() => coach.setProfile(args)),
  );

  server.registerTool(
    'get_weekly_plan',
    {
      description:
        "Get this week's study plan. If none exists yet, pass a theme (picked from the learner's goal) to create it; without a theme and without an existing plan it returns an error asking for one.",
      inputSchema: { theme: z.string().optional() },
    },
    ({ theme }) => run(() => coach.weekPlan(theme)),
  );

  server.registerTool(
    'get_today',
    {
      description:
        "Call at the start of a study session: returns today's date and the tasks planned for today (with task ids and status).",
    },
    () => run(() => coach.today()),
  );

  server.registerTool(
    'save_lesson',
    {
      description:
        'Save a lesson you have written, BEFORE teaching it. Each item becomes a spaced-repetition review card (duplicates are skipped). Returns the lesson id to pass to complete_task.',
      inputSchema: {
        kind: z.enum(['tiny_lesson', 'slang_hang', 'word_cam']),
        situation: nonEmpty,
        items: z
          .array(
            z.object({
              term: nonEmpty,
              translation: nonEmpty,
              example: z.string(),
              note: z.string().optional(),
              pronunciation: z.string().optional(),
            }),
          )
          .min(1)
          .max(50),
      },
    },
    (args) => run(() => coach.saveLesson(args)),
  );

  server.registerTool(
    'complete_task',
    {
      description:
        'Mark a planned task as done and award XP. Call only after the learner actually finished the task. Pass lessonId for lesson tasks and cardsReviewed for review tasks.',
      inputSchema: {
        taskId: nonEmpty,
        lessonId: z.string().optional(),
        cardsReviewed: z.number().int().min(0).optional(),
      },
    },
    ({ taskId, lessonId, cardsReviewed }) =>
      run(() => {
        const opts: { lessonId?: string; cardsReviewed?: number } = {};
        if (lessonId !== undefined) opts.lessonId = lessonId;
        if (cardsReviewed !== undefined) opts.cardsReviewed = cardsReviewed;
        return coach.completeTask(taskId, opts);
      }),
  );

  server.registerTool(
    'get_due_reviews',
    {
      description:
        'Get review cards that are due now (oldest first). Use for review tasks, then quiz the learner one card at a time and record each answer with submit_review.',
      inputSchema: { limit: z.number().int().min(1).optional() },
    },
    ({ limit }) => run(() => coach.dueReviews(limit)),
  );

  server.registerTool(
    'submit_review',
    {
      description:
        "Record the learner's answer for one review card right after quizzing it. Rating: 1 = again (forgot), 2 = hard, 3 = good, 4 = easy.",
      inputSchema: {
        cardId: nonEmpty,
        rating: z.number().int().min(1).max(4),
      },
    },
    ({ cardId, rating }) => run(() => coach.submitReview(cardId, rating as 1 | 2 | 3 | 4)),
  );

  server.registerTool(
    'get_progress',
    {
      description:
        'Get profile, streak, total XP, weekly goal progress and number of due reviews. Call at the start of a session and when the learner asks how they are doing; never invent progress.',
    },
    () => run(() => coach.progress()),
  );

  server.registerTool(
    'export_data',
    {
      description: 'Export all stored learner data as JSON (backup, or to move to another machine).',
    },
    () => run(() => coach.exportData()),
  );

  server.registerTool(
    'export_cards',
    {
      description:
        "Export the learner's review cards for Anki, Quizlet or a spreadsheet. Returns JSON {filename, count, text}. Save `text` to a file named `filename` (UTF-8, keep the line breaks and tabs exactly) and tell the learner where it is. Import: Anki Desktop 2.1.54+ via File > Import, choose the .txt (notetype Basic; GUIDs make re-imports update instead of duplicate); Quizlet via Create > Import, paste the text (tab between term and definition); csv opens in Excel/Sheets (Data > From text, UTF-8). Scheduling data is not exported: cards start fresh. Not a backup; use export_data for that.",
      inputSchema: {
        format: z.enum(['anki', 'quizlet', 'csv']),
        includeMastered: z.boolean().optional(),
      },
    },
    ({ format, includeMastered }) =>
      run(async () => {
        const state = await coach.exportData();
        const { filename, count, text } = exportCards(state, format, { includeMastered: includeMastered ?? true });
        if (Buffer.byteLength(text, 'utf8') > MAX_EXPORT_BYTES) {
          throw new Error(
            `The ${format} export is larger than 2 MB (${count} cards), too big to return in one reply. Try a smaller export: set includeMastered to false, or export in parts.`,
          );
        }
        return { filename, count, text };
      }),
  );

  server.registerTool(
    'import_data',
    {
      description:
        'Replace all stored data with a previously exported JSON document (passed as a string). The current data is backed up first. Only use when the learner explicitly asks to restore data.',
      inputSchema: { json: z.string() },
    },
    ({ json }) =>
      run(async () => {
        let raw: unknown;
        try {
          raw = JSON.parse(json);
        } catch {
          throw new Error('Invalid JSON: the provided text could not be parsed. Nothing was changed.');
        }
        return coach.importData(raw);
      }),
  );

  server.registerPrompt(
    'tutor',
    {
      description: 'Start a LangCoach tutoring session.',
    },
    () => ({
      messages: [{ role: 'user', content: { type: 'text', text: TUTOR_PROMPT } }],
    }),
  );

  return server;
}
