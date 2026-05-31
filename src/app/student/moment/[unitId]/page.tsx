import { getStudentSession } from "@/lib/student-session";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { buildMomentState, LessonOutline, LessonState, TaskState } from "@/lib/moment-status";
import { quizResult, draftProgress } from "@/lib/moment-scoring";
import { IconCheck, IconArrowRight, IconFlag, IconClock } from "@/components/moment-icons";
import Link from "next/link";

// ── helpers ───────────────────────────────────────────────────
function formatDate(iso?: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString("sv-SE", { weekday: "short", day: "numeric", month: "short" });
}

const KIND_LABEL: Record<string, string> = { QUIZ: "Övning", SURVEY: "Reflektion" };

// ── timeline node ─────────────────────────────────────────────
function LessonNode({ lesson, isLast }: { lesson: LessonState; isLast: boolean }) {
  const done = lesson.status === "done";
  const current = lesson.isCurrent;
  const circle = done
    ? "bg-success text-white border-2 border-success"
    : current
    ? "bg-accent text-white border-2 border-accent"
    : "bg-surface text-muted border-2 border-border";
  return (
    <div className="flex flex-col items-center w-9 shrink-0">
      <div
        className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold ${circle}`}
        style={current ? { boxShadow: "0 0 0 5px var(--accent-light)" } : undefined}
      >
        {done ? <IconCheck size={17} /> : lesson.n}
      </div>
      {!isLast && (
        <div
          className="w-0.5 flex-1 min-h-[2rem] mt-1.5 rounded"
          style={{ background: done ? "var(--success)" : "var(--border)" }}
        />
      )}
    </div>
  );
}

// ── one task row (used inside the expanded current lesson) ─────
function TaskRow({ task, kind }: { task: TaskState; kind: string }) {
  const meta: Record<TaskState["status"], { text: string; cls: string }> = {
    done: { text: "Klar", cls: "text-success" },
    active: { text: "Pågår", cls: "text-primary font-medium" },
    todo: { text: "Att göra", cls: "text-accent font-medium" },
    missed: { text: "Missad", cls: "text-error font-medium" },
    upcoming: { text: "Kommande", cls: "text-muted" },
  };
  const action: Partial<Record<TaskState["status"], string>> = {
    active: "Fortsätt",
    todo: "Börja",
    missed: "Ta igen",
    done: "Repetera",
  };
  const m = meta[task.status];
  const label = action[task.status];
  const isUpcoming = task.status === "upcoming";
  const statusText =
    task.status === "done"
      ? task.result ?? "Klar"
      : task.status === "active"
      ? task.progress
        ? `Pågår ${task.progress}`
        : "Pågår"
      : m.text;
  return (
    <div className={`flex items-center gap-3 py-3 ${isUpcoming ? "opacity-60" : ""}`}>
      <div className="flex-1 min-w-0">
        <div className="font-mono text-[10px] uppercase tracking-wider text-muted mb-0.5">{kind}</div>
        <div className={`text-sm leading-snug ${task.status === "done" ? "text-muted" : "text-foreground font-medium"}`}>
          {task.title}
          {task.questionCount > 0 && <span className="text-muted font-normal"> · {task.questionCount} frågor</span>}
        </div>
      </div>
      <div className={`text-xs shrink-0 ${m.cls}`}>{statusText}</div>
      {label && !isUpcoming ? (
        <Link
          href={`/student/quiz/${task.surveyId}`}
          className={`shrink-0 text-center min-w-[5.5rem] text-sm ${
            task.status === "active" || task.status === "todo" ? "btn-primary" : "btn-secondary"
          }`}
        >
          {label}
        </Link>
      ) : (
        <div className="w-[5.5rem] shrink-0" />
      )}
    </div>
  );
}

// ── a single lesson on the timeline (collapsed unless current) ─
function TimelineLesson({
  lesson,
  isLast,
  kindOf,
}: {
  lesson: LessonState;
  isLast: boolean;
  kindOf: (surveyId: number) => string;
}) {
  const dateLabel = formatDate(lesson.date);
  const expanded = lesson.isCurrent;
  const done = lesson.status === "done";
  const doneCount = lesson.tasks.filter((t) => t.status === "done").length;

  return (
    <div className="flex gap-4">
      <LessonNode lesson={lesson} isLast={isLast} />
      <div className={`flex-1 min-w-0 pt-1 ${isLast ? "" : "pb-5"}`}>
        {!expanded ? (
          // collapsed row
          <div className={`flex items-center gap-3 py-1.5 ${lesson.status === "upcoming" ? "opacity-60" : ""}`}>
            <div className="flex-1 min-w-0">
              {dateLabel && <span className="font-mono text-[10px] uppercase tracking-wider text-muted mr-2.5">{dateLabel}</span>}
              <span className="font-semibold tracking-tight">{lesson.title}</span>
            </div>
            {done ? (
              <span className="text-xs text-success shrink-0">
                {lesson.tasks.length === 0
                  ? "Genomgången"
                  : doneCount === lesson.tasks.length
                  ? "Alla klara"
                  : `${doneCount}/${lesson.tasks.length} klara`}
              </span>
            ) : (
              <span className="text-xs text-muted shrink-0 flex items-center gap-1.5">
                <IconClock size={13} /> {dateLabel ? `Öppnas ${dateLabel}` : "Öppnas senare"}
              </span>
            )}
          </div>
        ) : (
          // expanded current lesson
          <div className="card p-5" style={{ borderColor: "var(--primary)", boxShadow: "0 6px 20px rgba(26,58,42,0.08)" }}>
            <div className="flex items-center gap-2.5 mb-1">
              {dateLabel && <span className="font-mono text-[10px] uppercase tracking-wider text-muted">{dateLabel}</span>}
              <span className="badge bg-accent-light text-accent">Du är här</span>
            </div>
            <h3 className="text-lg font-bold tracking-tight mb-1">{lesson.title}</h3>
            {lesson.note && <p className="text-sm text-muted leading-relaxed mb-2">{lesson.note}</p>}
            {lesson.tasks.length > 0 ? (
              <div className="mt-2 divide-y divide-border-light border-t border-border-light">
                {lesson.tasks.map((t) => (
                  <TaskRow key={t.surveyId} task={t} kind={kindOf(t.surveyId)} />
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted italic mt-2">Ingen digital uppgift den här lektionen - se lektionsmaterialet.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default async function MomentPage({
  params,
}: {
  params: Promise<{ unitId: string }>;
}) {
  const session = await getStudentSession();
  if (!session) redirect("/login");
  const { studentId, courseId } = session;

  const { unitId } = await params;
  const id = Number(unitId);
  if (isNaN(id)) redirect("/student");

  const [unit, course] = await Promise.all([
    prisma.unit.findUnique({
      where: { id },
      include: {
        surveys: { orderBy: { createdAt: "asc" }, include: { questions: true } },
      },
    }),
    prisma.course.findUnique({ where: { id: courseId } }),
  ]);
  if (!unit || unit.courseId !== courseId) redirect("/student");

  const surveyIds = unit.surveys.map((s) => s.id);
  const [responses, drafts] = await Promise.all([
    prisma.response.findMany({
      where: { studentId, surveyId: { in: surveyIds } },
      orderBy: { createdAt: "asc" },
      select: { surveyId: true, answers: { select: { isCorrect: true } } },
    }),
    prisma.draftResponse.findMany({
      where: { studentId, surveyId: { in: surveyIds } },
      select: { surveyId: true, answers: true },
    }),
  ]);

  const lessons = (Array.isArray(unit.lessons) ? unit.lessons : []) as unknown as LessonOutline[];
  const modeBySurvey = new Map(unit.surveys.map((s) => [s.id, s.mode]));
  const kindOf = (surveyId: number) => KIND_LABEL[modeBySurvey.get(surveyId) ?? "QUIZ"] ?? "Övning";
  const questionCountBySurvey = new Map(unit.surveys.map((s) => [s.id, s.questions.length]));

  // result ("8/8") from the latest graded response; progress ("11/14") from a saved draft
  const resultBySurvey = new Map<number, string>();
  for (const r of responses) {
    const res = quizResult(r.answers); // responses are asc -> latest wins
    if (res) resultBySurvey.set(r.surveyId, res);
    else resultBySurvey.delete(r.surveyId);
  }
  const progressBySurvey = new Map<number, string>();
  for (const d of drafts) {
    const p = draftProgress(d.answers, questionCountBySurvey.get(d.surveyId) ?? 0);
    if (p) progressBySurvey.set(d.surveyId, p);
  }

  const moment = buildMomentState({
    lessons,
    surveys: unit.surveys.map((s) => ({
      id: s.id,
      title: s.title,
      lesson: s.lesson,
      questionCount: s.questions.length,
      result: resultBySurvey.get(s.id),
      progress: progressBySurvey.get(s.id),
    })),
    submittedSurveyIds: responses.map((r) => r.surveyId),
    draftSurveyIds: drafts.map((d) => d.surveyId),
  });

  const { stats } = moment;
  const goals = unit.goals ?? [];

  // "Fortsätt där du var": current lesson's first actionable task, else any open task.
  const current = moment.lessons.find((l) => l.isCurrent);
  const resumeTask =
    current?.tasks.find((t) => t.status === "active") ??
    current?.tasks.find((t) => t.status === "todo") ??
    moment.lessons.flatMap((l) => l.tasks).find((t) => ["active", "todo", "missed"].includes(t.status));

  // Group lessons by week when week labels exist, otherwise one flat group.
  const hasWeeks = moment.lessons.some((l) => l.week);
  const groups: { week: string | null; lessons: LessonState[] }[] = [];
  for (const l of moment.lessons) {
    const key = hasWeeks ? l.week ?? "Övrigt" : null;
    const g = groups.find((x) => x.week === key);
    if (g) g.lessons.push(l);
    else groups.push({ week: key, lessons: [l] });
  }
  const totalLessons = moment.lessons.length;
  let lessonIndex = 0;

  return (
    <div className="animate-fade-in">
      <Link href="/student" className="text-sm text-primary hover:underline">
        &larr; Tillbaka
      </Link>

      {/* hero */}
      <div className="mt-3 mb-6">
        <div className="font-mono text-[11px] uppercase tracking-wider text-muted mb-2">
          {course?.name ?? "Moment"} · MOMENT{unit.period ? ` · ${unit.period}` : ""}
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight leading-tight">{unit.title}</h1>
        {unit.description && <p className="text-sm text-muted mt-1.5 max-w-prose">{unit.description}</p>}

        {goals.length > 0 && (
          <div className="grid sm:grid-cols-3 gap-x-6 gap-y-4 mt-5">
            {goals.map((g, i) => (
              <div key={i}>
                <div className="font-mono text-[10px] uppercase tracking-wider text-accent mb-1.5">
                  Mål {String(i + 1).padStart(2, "0")}
                </div>
                <div className="text-sm text-muted leading-relaxed">{g}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* slim progress meter */}
      <div className="card p-4 sm:p-5 flex items-center gap-4 mb-8">
        <div className="text-3xl font-bold text-primary leading-none">
          {stats.percent}
          <span className="text-base">%</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="h-1.5 bg-surface-muted rounded-full overflow-hidden mb-1.5">
            <div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: `${stats.percent}%` }} />
          </div>
          <div className="text-xs text-muted">
            {stats.done} klara · <span className="text-accent font-medium">{stats.todo} att göra</span>
            {stats.missed > 0 && <> · <span className="text-error font-medium">{stats.missed} missad</span></>}
            {" · "}
            <Link href={`/student/moment/${id}/att-gora`} className="text-primary hover:underline">Att göra-listan →</Link>
          </div>
        </div>
        {resumeTask ? (
          <Link href={`/student/quiz/${resumeTask.surveyId}`} className="btn-primary shrink-0 hidden sm:inline-flex items-center gap-2">
            Fortsätt <IconArrowRight size={15} />
          </Link>
        ) : (
          stats.total > 0 && <span className="text-sm text-success font-medium shrink-0 hidden sm:block">Momentet klart 🎉</span>
        )}
      </div>

      {/* missed nudge */}
      {stats.missed > 0 && (
        <div
          className="flex items-center gap-3 p-3.5 rounded-xl mb-6"
          style={{ background: "#fbf0ec", border: "1px solid #e8c3b6" }}
        >
          <span className="text-error shrink-0"><IconFlag size={18} /></span>
          <div className="flex-1 text-sm text-foreground">
            Du har <strong>{stats.missed} missad uppgift</strong> från en tidigare lektion. Den ligger kvar - du kan ta igen den när som helst.
          </div>
          <Link href={`/student/moment/${id}/att-gora`} className="btn-secondary text-sm shrink-0">Visa →</Link>
        </div>
      )}

      {/* timeline grouped by week */}
      <div>
        {groups.map((g) => (
          <div key={g.week ?? "all"} className="mb-1.5">
            {g.week && (
              <div className="flex items-center gap-3 mt-2.5 mb-3.5">
                <span className="font-mono text-[11px] uppercase tracking-wider text-muted">{g.week}</span>
                <div className="flex-1 h-px bg-border-light" />
              </div>
            )}
            {g.lessons.map((l) => {
              const isLast = lessonIndex === totalLessons - 1;
              lessonIndex++;
              return <TimelineLesson key={l.n} lesson={l} isLast={isLast} kindOf={kindOf} />;
            })}
          </div>
        ))}
      </div>

      {/* loose surveys (no lesson) */}
      {moment.looseTasks.length > 0 && (
        <div className="mt-8">
          <h3 className="font-semibold tracking-tight mb-2">Övriga uppgifter</h3>
          <div className="card px-5">
            <div className="divide-y divide-border-light">
              {moment.looseTasks.map((t) => (
                <TaskRow key={t.surveyId} task={t} kind={kindOf(t.surveyId)} />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
