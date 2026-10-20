export type Cefr = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
export type TaskType = 'tiny_lesson' | 'slang_hang' | 'review' | 'quiz';

export interface Profile {
  nativeLanguage: string;
  targetLanguage: string;
  level: Cefr;
  goal: string;
  minutesPerDay: number;
  daysPerWeek: number;
  createdAt: string;
}

export interface LessonItem {
  term: string;
  translation: string;
  example: string;
  note?: string;
}

export interface Lesson {
  id: string;
  kind: 'tiny_lesson' | 'slang_hang';
  situation: string;
  items: LessonItem[];
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

export interface State {
  version: 1;
  profile: Profile | null;
  plans: Record<string, WeekPlan>;
  lessons: Lesson[];
  cards: ReviewCard[];
  log: LogEntry[];
}

export function emptyState(): State {
  return { version: 1, profile: null, plans: {}, lessons: [], cards: [], log: [] };
}
