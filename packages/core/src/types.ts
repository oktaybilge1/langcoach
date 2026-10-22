export type Cefr = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
export type TaskType = 'tiny_lesson' | 'slang_hang' | 'review' | 'quiz' | 'word_cam';

export interface Profile {
  nativeLanguage: string;
  targetLanguage: string;
  level: Cefr;
  goal: string;
  minutesPerDay: number;
  daysPerWeek: number;
  /** Daily XP goal (default 20). */
  dailyGoalXp?: DailyGoalXp;
  createdAt: string;
}

export type DailyGoalXp = 10 | 20 | 30 | 50;
export const DAILY_GOALS: readonly DailyGoalXp[] = [10, 20, 30, 50];
export const DEFAULT_DAILY_GOAL: DailyGoalXp = 20;

export interface LessonItem {
  term: string;
  translation: string;
  example: string;
  note?: string;
  pronunciation?: string;
}

export interface GrammarExample {
  sentence: string;
  translation: string;
  transliteration?: string;
  explanation?: string;
}

export interface GrammarPoint {
  topic: string;
  description: string;
  examples: GrammarExample[];
}

export interface LessonSource {
  app: 'lll';
  targetLanguage: string;
  sourceLanguage: string;
  purpose?: string;
}

export interface Lesson {
  id: string;
  kind: 'tiny_lesson' | 'slang_hang' | 'word_cam';
  situation: string;
  items: LessonItem[];
  grammar?: GrammarPoint[];
  source?: LessonSource;
  createdAt: string;
}

/** ts-fsrs Card with Date fields stored as ISO strings. */
export interface SrsState {
  due: string;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  learning_steps: number;
  reps: number;
  lapses: number;
  state: number;
  last_review?: string;
}

export interface ReviewCard {
  id: string;
  lessonId: string;
  term: string;
  translation: string;
  example: string;
  pronunciation?: string;
  /** Meaning in the learner's native language (on-device translation). */
  nativeTranslation?: string;
  favorite?: boolean;
  /** Set once by "I know this". */
  mastered?: boolean;
  srs: SrsState;
}

export interface PlanTask {
  id: string;
  date: string;
  type: TaskType;
  minutes: number;
  status: 'todo' | 'done';
  completedAt?: string;
  lessonId?: string;
}

export interface WeekPlan {
  week: string;
  theme: string;
  tasks: PlanTask[];
}

export interface LogEntry {
  at: string;
  date: string;
  taskId: string;
  type: TaskType;
  xp: number;
}

export interface PracticeSession {
  id: string;
  at: string;
  date: string;
  exercises: number;
  correct: number;
  xp: number;
}

export interface State {
  version: 1;
  profile: Profile | null;
  plans: Record<string, WeekPlan>;
  lessons: Lesson[];
  cards: ReviewCard[];
  log: LogEntry[];
  /** Streak freezes held (0..2). */
  streakFreezes?: number;
  /** Dates protected by a consumed freeze (last 60 kept). */
  freezeUsedDates?: string[];
  /** Freeze rewards of the current streak: its start date and the highest 7-day milestone rewarded. */
  freezeAward?: { start: string; highestMilestone: number };
  /** Recorded practice sessions (last 500 kept). */
  sessions?: PracticeSession[];
}

export function emptyState(): State {
  return { version: 1, profile: null, plans: {}, lessons: [], cards: [], log: [] };
}
