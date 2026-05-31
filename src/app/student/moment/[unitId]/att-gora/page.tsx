import { getStudentSession } from "@/lib/student-session";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { buildMomentState, LessonOutline, TaskState } from "@/lib/moment-status";
import { quizResult, draftProgress } from "@/lib/moment-scoring";
import { IconCheck, IconArrowRight, IconFlag, IconClock, IconDot } from "@/components/moment-icons";
import Link from "next/link";

const KIND_LABEL: Record<string, string> = { QUIZ: "Övning", SURVEY: "Reflektion" };

function formatDate(iso?: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString("sv-SE", { weekday: "short", day: "numeric", month: "short" });
}

// task enriched with its lesson context, for display
type FlowTask = TaskState & {
  lessonTitle?: string;
  lessonWeek?: string;
  lessonDate?: string;
  kind: string;
};

// ── status dot ────────────────────────────────────────────────
function StatusDot({ status, size = 40 }: { status: TaskState["status"]; size?: number }) {
  const inner = Math.round(size * 0.4);
  const map: Record<TaskState["status"], { cls: string; style?: React.CSSProperties; icon: React.ReactNode }> = {
    done: { cls: "bg-success-light text-success", icon: <IconCheck size={inner} /> },
    active: { cls: "bg-primary-light text-primary", icon: <IconDot size={Math.round(inner * 0.5)} /> },
    todo: { cls: "bg-accent-light text-accent", icon: <IconArrowRight size={inner} /> },
    missed: { cls: "text-error", style: { background: "#f6e1da" }, icon: <IconFlag size={inner} /> },
    upcoming: { cls: "bg-surface-muted text-muted", icon: <IconClock size={inner} /> },
  };
  const m = map[status];
  return (
    <div
      className={`rounded-lg flex items-center justify-center shrink-0 ${m.cls}`}
      style={{ width: size, height: size, ...m.style }}
    >
      {m.icon}
    </div>
  );
}

function GroupHead({ label, count, color, note }: { label: string; count: number; color: string; note?: string }) {
  return (
    <div className="flex items-center gap-3 mb-3.5 mt-1">
      <h2 className="text-lg font-bold tracking-tight">{label}</h2>
      <span
        className="text-xs font-semibold rounded-full min-w-[1.4rem] h-[1.4rem] inline-flex items-center justify-center px-1.5"
        style={{ color, border: `1px solid ${color}` }}
      >
        {count}
      </span>
      {note && <span className="text-xs text-muted">{note}</span>}
    </div>
  );
}

// big card for "Gör härnäst"
function NextCard({ task }: { task: FlowTask }) {
  const active = task.status === "active";
  return (
    <div
      className="card p-5 flex items-center gap-4"
      style={active ? { borderColor: "var(--primary)", boxShadow: "0 6px 20px rgba(26,58,42,0.08)" } : undefined}
    >
      <StatusDot status={task.status} size={42} />
      <div className="flex-1 min-w-0">
        <div className="font-mono text-[10px] uppercase tracking-wider text-muted mb-0.5">
          {task.kind}
          {task.lessonTitle && <span className="text-muted-light"> · {task.lessonWeek ? `${task.lessonWeek} · ` : ""}{task.lessonTitle}</span>}
        </div>
        <h3 className="font-bold tracking-tight">{task.title}</h3>
        <div className="text-xs text-muted mt-0.5">
          {task.questionCount > 0 ? `${task.questionCount} frågor` : "Uppgift"}
          {active && <span className="text-primary font-medium"> · pågår{task.progress ? ` ${task.progress}` : ""}</span>}
        </div>
      </div>
      <Link href={`/student/quiz/${task.surveyId}`} className="btn-primary shrink-0 inline-flex items-center gap-2">
        {active ? "Fortsätt" : "Börja"} <IconArrowRight size={15} />
      </Link>
    </div>
  );
}

// compact row for missed / upcoming / done
function FlowRow({ task }: { task: FlowTask }) {
  const dateLabel = formatDate(task.lessonDate);
  const right: Record<TaskState["status"], React.ReactNode> = {
    done: <span className="text-xs text-success">{task.result ?? "Klar"}</span>,
    active: <span className="text-xs text-primary font-medium">Pågår</span>,
    todo: <span className="text-xs text-accent font-medium">Att göra</span>,
    missed: (
      <Link href={`/student/quiz/${task.surveyId}`} className="btn-secondary text-sm shrink-0">
        Ta igen
      </Link>
    ),
    upcoming: <span className="text-xs text-muted">Öppnas {dateLabel ?? "senare"}</span>,
  };
  return (
    <div className={`flex items-center gap-3 py-3 ${task.status === "upcoming" ? "opacity-60" : ""}`}>
      <StatusDot status={task.status} size={22} />
      <div className="flex-1 min-w-0">
        <div className="font-mono text-[10px] uppercase tracking-wider text-muted">
          {task.kind}
          {task.lessonTitle && <span className="text-muted-light"> · {task.lessonTitle}</span>}
        </div>
        <div className={`text-sm leading-snug ${task.status === "done" ? "text-muted" : "text-foreground font-medium"}`}>
          {task.title}
          {task.questionCount > 0 && <span className="text-muted font-normal"> · {task.questionCount} frågor</span>}
        </div>
      </div>
      <div className="shrink-0">{right[task.status]}</div>
    </div>
  );
}

export default async function MomentTasksPage({
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

  const unit = await prisma.unit.findUnique({
    where: { id },
    include: { surveys: { orderBy: { createdAt: "asc" }, include: { questions: true } } },
  });
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

  const resultBySurvey = new Map<number, string>();
  for (const r of responses) {
    const res = quizResult(r.answers); // asc -> latest wins
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

  const lessonByN = new Map(moment.lessons.map((l) => [l.n, l]));
  const enrich = (t: TaskState): FlowTask => {
    const l = t.lesson != null ? lessonByN.get(t.lesson) : undefined;
    return { ...t, lessonTitle: l?.title, lessonWeek: l?.week, lessonDate: l?.date, kind: kindOf(t.surveyId) };
  };
  const all: FlowTask[] = [...moment.lessons.flatMap((l) => l.tasks), ...moment.looseTasks].map(enrich);
  const by = (s: TaskState["status"]) => all.filter((t) => t.status === s);
  const next = [...by("active"), ...by("todo")];
  const missed = by("missed");
  const upcoming = by("upcoming");
  const done = by("done");

  const summary = [
    { v: next.length, k: "att göra", c: "var(--accent)" },
    { v: missed.length, k: "missade", c: "var(--error)" },
    { v: done.length, k: "klara", c: "var(--success)" },
    { v: upcoming.length, k: "kommande", c: "var(--muted)" },
  ];

  return (
    <div className="animate-fade-in">
      <Link href={`/student/moment/${id}`} className="text-sm text-primary hover:underline">
        &larr; Till momentet
      </Link>

      <div className="mt-3 mb-6">
        <div className="font-mono text-[11px] uppercase tracking-wider text-muted mb-2">ATT GÖRA · {unit.title}</div>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight leading-tight">Vad du har kvar</h1>
        <p className="text-sm text-muted mt-2 max-w-prose leading-relaxed">
          Alla övningar du fått under momentet, samlade. Här ser du vad som ligger framför dig - och fångar upp det du missat.
        </p>
      </div>

      {/* summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-border-light border border-border-light rounded-xl overflow-hidden mb-8">
        {summary.map((x) => (
          <div key={x.k} className="bg-surface p-4">
            <div className="text-2xl font-bold leading-none" style={{ color: x.c }}>{x.v}</div>
            <div className="text-xs text-muted mt-1.5">{x.k}</div>
          </div>
        ))}
      </div>

      {/* Gör härnäst */}
      <GroupHead label="Gör härnäst" count={next.length} color="var(--accent)" note="Övningar du kan jobba med nu" />
      {next.length > 0 ? (
        <div className="flex flex-col gap-3 mb-9">
          {next.map((t) => <NextCard key={t.surveyId} task={t} />)}
        </div>
      ) : (
        <p className="text-sm text-muted mb-9">Inget på gång just nu - fint jobbat! 🎉</p>
      )}

      {/* Missat */}
      {missed.length > 0 && (
        <>
          <GroupHead label="Missat - ta igen" count={missed.length} color="var(--error)" note="Låg kvar från en tidigare lektion" />
          <div className="card px-5 mb-9" style={{ background: "#fbf0ec", borderColor: "#e8c3b6" }}>
            <div className="divide-y" style={{ borderColor: "#ecd2c8" }}>
              {missed.map((t) => <FlowRow key={t.surveyId} task={t} />)}
            </div>
          </div>
        </>
      )}

      {/* Kommande */}
      {upcoming.length > 0 && (
        <>
          <GroupHead label="Kommande" count={upcoming.length} color="var(--muted)" note="Lektioner som inte börjat än" />
          <div className="card px-5 mb-9">
            <div className="divide-y divide-border-light">
              {upcoming.map((t) => <FlowRow key={t.surveyId} task={t} />)}
            </div>
          </div>
        </>
      )}

      {/* Klart */}
      {done.length > 0 && (
        <>
          <GroupHead label="Klart" count={done.length} color="var(--success)" />
          <div className="card px-5">
            <div className="divide-y divide-border-light">
              {done.map((t) => <FlowRow key={t.surveyId} task={t} />)}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
