import { z } from 'zod';
import { InvalidDataError } from './errors.js';
import type { State } from './types.js';

const cefr = z.enum(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']);
const taskType = z.enum(['tiny_lesson', 'slang_hang', 'review', 'quiz']);

const profile = z.object({
  nativeLanguage: z.string(),
  targetLanguage: z.string(),
  level: cefr,
  goal: z.string(),
  minutesPerDay: z.number(),
  daysPerWeek: z.number(),
  createdAt: z.string(),
});

const lessonItem = z.object({
  term: z.string(),
  translation: z.string(),
  example: z.string(),
  note: z.string().optional(),
});

const lesson = z.object({
  id: z.string(),
  kind: z.enum(['tiny_lesson', 'slang_hang']),
  situation: z.string(),
  items: z.array(lessonItem),
  createdAt: z.string(),
});

// Required core fields; remaining ts-fsrs fields pass through untouched.
const srs = z
  .object({
    due: z.string(),
    state: z.number(),
    reps: z.number(),
    lapses: z.number(),
  })
  .passthrough();

const reviewCard = z.object({
  id: z.string(),
  lessonId: z.string(),
  term: z.string(),
  translation: z.string(),
  example: z.string(),
  srs,
});

const planTask = z.object({
  id: z.string(),
  date: z.string(),
  type: taskType,
  minutes: z.number(),
  status: z.enum(['todo', 'done']),
  completedAt: z.string().optional(),
  lessonId: z.string().optional(),
});

const weekPlan = z.object({ week: z.string(), theme: z.string(), tasks: z.array(planTask) });

const logEntry = z.object({
  at: z.string(),
  date: z.string(),
  taskId: z.string(),
  type: taskType,
  xp: z.number(),
});

const stateSchema = z.object({
  version: z.literal(1),
  profile: profile.nullable(),
  plans: z.record(z.string(), weekPlan),
  lessons: z.array(lesson),
  cards: z.array(reviewCard),
  log: z.array(logEntry),
});

export function parseState(raw: unknown): State {
  const result = stateSchema.safeParse(raw);
  if (!result.success) {
    const detail = result.error.issues
      .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('; ');
    throw new InvalidDataError(`Invalid LangCoach data: ${detail}`);
  }
  return result.data as unknown as State;
}
