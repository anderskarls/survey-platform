// Status derivation for the "hela momentet" student views (Momentvägen + Uppgiftsflödet).
//
// Self-paced model: nothing is ever locked. A lesson's recommended date is a
// suggestion, not a gate. Once that date has passed, an unstarted task is
// surfaced as a friendly "missed" nudge - never a block. Status is derived
// here from Response/DraftResponse + the lesson date, so no extra DB column is
// needed (see docs/elevuppgifter/05-hela-momentet-implementation.md, Fas 2).

export type TaskStatus = "done" | "active" | "todo" | "missed" | "upcoming";
export type LessonStatus = "done" | "active" | "today" | "upcoming";

// How many days past a lesson's recommended date before an unstarted task is
// shown as "missed" rather than "todo". Roughly one lesson (a week) behind.
export const MISSED_AFTER_DAYS = 7;

const MS_PER_DAY = 1000 * 60 * 60 * 24;

export interface LessonOutline {
  n: number;
  title: string;
  note?: string;
  date?: string; // recommended date, ISO YYYY-MM-DD
  week?: string; // optional week label, e.g. "v.17"
}

// A survey as the moment views need it - already fetched by the server component.
export interface SurveyInput {
  id: number;
  title: string;
  lesson: number | null; // Survey.lesson (matches LessonOutline.n), or null = loose
  questionCount: number;
  result?: string; // e.g. "8/8" for a graded quiz (display only, computed by the page)
  progress?: string; // e.g. "11/14" answered in a saved draft (display only)
}

export interface TaskState {
  surveyId: number;
  title: string;
  questionCount: number;
  lesson: number | null;
  status: TaskStatus;
  result?: string;
  progress?: string;
}

export interface LessonState {
  n: number;
  title: string;
  note?: string;
  date?: string;
  week?: string;
  status: LessonStatus;
  isCurrent: boolean; // the "Du är här" lesson
  tasks: TaskState[];
}

export interface MomentStats {
  total: number; // all tasks (lesson tasks + loose)
  done: number;
  todo: number; // todo + active - everything the student can work on now
  missed: number;
  upcoming: number;
  lessonsDone: number;
  lessonsTotal: number;
  percent: number; // round(done / total * 100), 0 when there are no tasks
}

export interface MomentState {
  lessons: LessonState[];
  looseTasks: TaskState[]; // surveys without a lesson number
  stats: MomentStats;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

// Parse a lesson's recommended date. Returns null for missing/invalid input,
// so the rest of the logic can treat "no date" as an always-open task.
export function parseLessonDate(date?: string): Date | null {
  if (!date) return null;
  const d = new Date(date);
  return isNaN(d.getTime()) ? null : startOfDay(d);
}

// Derive a single task's status from completion state + its lesson's date.
export function deriveTaskStatus(opts: {
  hasResponse: boolean;
  hasDraft: boolean;
  lessonDate?: Date | null;
  today?: Date;
}): TaskStatus {
  if (opts.hasResponse) return "done";
  if (opts.hasDraft) return "active";

  const lessonDate = opts.lessonDate ?? null;
  if (!lessonDate) return "todo"; // no recommended date -> just open

  const today = startOfDay(opts.today ?? new Date());
  if (lessonDate.getTime() > today.getTime()) return "upcoming";
  if (lessonDate.getTime() < today.getTime() - MISSED_AFTER_DAYS * MS_PER_DAY) {
    return "missed";
  }
  return "todo";
}

// A lesson is "resolved" (i.e. behind us, not the current step) when its work
// is finished, or when it carries no digital task and its date is not in the
// future. Used to find the single "Du är här" lesson.
function isLessonResolved(ls: LessonState, today: Date): boolean {
  const hasTasks = ls.tasks.length > 0;
  if (hasTasks) return ls.tasks.every((t) => t.status === "done");
  const d = parseLessonDate(ls.date);
  return !d || d.getTime() <= today.getTime();
}

// Build the full state the moment views render from. Pure - pass already-fetched
// data (unit.lessons, surveys, and the sets of submitted/draft survey ids).
export function buildMomentState(input: {
  lessons: LessonOutline[];
  surveys: SurveyInput[];
  submittedSurveyIds: Iterable<number>;
  draftSurveyIds: Iterable<number>;
  today?: Date;
}): MomentState {
  const today = startOfDay(input.today ?? new Date());
  const submitted = new Set(input.submittedSurveyIds);
  const drafts = new Set(input.draftSurveyIds);

  const orderedLessons = [...input.lessons].sort((a, b) => a.n - b.n);
  const dateByLesson = new Map<number, Date | null>();
  for (const l of orderedLessons) dateByLesson.set(l.n, parseLessonDate(l.date));

  const toTaskState = (s: SurveyInput): TaskState => ({
    surveyId: s.id,
    title: s.title,
    questionCount: s.questionCount,
    lesson: s.lesson,
    result: s.result,
    progress: s.progress,
    status: deriveTaskStatus({
      hasResponse: submitted.has(s.id),
      hasDraft: drafts.has(s.id),
      lessonDate: s.lesson != null ? dateByLesson.get(s.lesson) ?? null : null,
      today,
    }),
  });

  const lessons: LessonState[] = orderedLessons.map((l) => ({
    n: l.n,
    title: l.title,
    note: l.note,
    date: l.date,
    week: l.week,
    status: "upcoming",
    isCurrent: false,
    tasks: input.surveys.filter((s) => s.lesson === l.n).map(toTaskState),
  }));

  // Mark done / current / upcoming. "current" is the first unresolved lesson;
  // by construction everything before it is resolved (done or passed).
  let currentSet = false;
  for (const ls of lessons) {
    if (isLessonResolved(ls, today)) {
      ls.status = "done";
    } else if (!currentSet) {
      ls.isCurrent = true;
      currentSet = true;
      ls.status = ls.tasks.some((t) => t.status === "active") ? "active" : "today";
    } else {
      ls.status = "upcoming";
    }
  }

  const looseTasks = input.surveys
    .filter((s) => s.lesson == null)
    .map(toTaskState);

  const allTasks = [...lessons.flatMap((l) => l.tasks), ...looseTasks];
  const count = (s: TaskStatus) => allTasks.filter((t) => t.status === s).length;
  const done = count("done");
  const total = allTasks.length;

  const stats: MomentStats = {
    total,
    done,
    todo: count("todo") + count("active"),
    missed: count("missed"),
    upcoming: count("upcoming"),
    lessonsDone: lessons.filter((l) => l.status === "done").length,
    lessonsTotal: lessons.length,
    percent: total > 0 ? Math.round((done / total) * 100) : 0,
  };

  return { lessons, looseTasks, stats };
}
