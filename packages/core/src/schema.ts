import { z } from 'zod';
import { InvalidDataError } from './errors.js';
import type { State } from './types.js';

const cefr = z.enum(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']);
const taskType = z.enum(['tiny_lesson', 'slang_hang', 'review', 'quiz', 'word_cam']);

// Every object is "loose": keys this version does not know about are kept, so data written by a
// newer LangCoach survives a load → save by this one.
const obj = z.looseObject;

const profile = obj({
  nativeLanguage: z.string(),
  targetLanguage: z.string(),
  level: cefr,
  goal: z.string(),
  minutesPerDay: z.number().int().min(5).max(180),
  daysPerWeek: z.number().int().min(1).max(7),
  dailyGoalXp: z.union([z.literal(10), z.literal(20), z.literal(30), z.literal(50)]).optional(),
  createdAt: z.string(),
});

const lessonItem = obj({
  term: z.string(),
  translation: z.string(),
  example: z.string(),
  note: z.string().optional(),
  pronunciation: z.string().optional(),
});

const grammarExample = obj({
  sentence: z.string(),
  translation: z.string(),
  transliteration: z.string().optional(),
  explanation: z.string().optional(),
});

const grammarPoint = obj({
  topic: z.string(),
  description: z.string(),
  examples: z.array(grammarExample),
});

const lessonSource = obj({
  app: z.literal('lll'),
  targetLanguage: z.string(),
  sourceLanguage: z.string(),
  purpose: z.string().optional(),
});

const lesson = obj({
  id: z.string(),
  kind: z.enum(['tiny_lesson', 'slang_hang', 'word_cam']),
  situation: z.string(),
  items: z.array(lessonItem),
  grammar: z.array(grammarPoint).optional(),
  source: lessonSource.optional(),
  createdAt: z.string(),
});

// Required core fields; remaining ts-fsrs fields pass through untouched.
const srs = obj({
  due: z.iso.datetime({ offset: true }),
  state: z.number(),
  reps: z.number(),
  lapses: z.number(),
});

const reviewCard = obj({
  id: z.string(),
  lessonId: z.string(),
  term: z.string(),
  translation: z.string(),
  example: z.string(),
  pronunciation: z.string().optional(),
  nativeTranslation: z.string().optional(),
  favorite: z.boolean().optional(),
  mastered: z.boolean().optional(),
  srs,
});

const planTask = obj({
  id: z.string(),
  date: z.string(),
  type: taskType,
  minutes: z.number().int().min(1),
  status: z.enum(['todo', 'done']),
  completedAt: z.string().optional(),
  lessonId: z.string().optional(),
});

const weekPlan = obj({ week: z.string(), theme: z.string(), tasks: z.array(planTask) });

const logEntry = obj({
  at: z.string(),
  date: z.string(),
  taskId: z.string(),
  type: taskType,
  xp: z.number().min(0),
  lessonId: z.string().optional(),
});

const practiceSession = obj({
  id: z.string(),
  at: z.string(),
  date: z.string(),
  exercises: z.number().int().min(0),
  correct: z.number().int().min(0),
  xp: z.number().min(0),
});

const stateSchema = obj({
  version: z.literal(1),
  profile: profile.nullable(),
  plans: z.record(z.string(), weekPlan),
  lessons: z.array(lesson),
  cards: z.array(reviewCard),
  log: z.array(logEntry),
  streakFreezes: z.number().int().min(0).optional(),
  freezeUsedDates: z.array(z.string()).optional(),
  freezeAward: obj({ start: z.string(), highestMilestone: z.number().int().min(0) }).optional(),
  sessions: z.array(practiceSession).optional(),
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
