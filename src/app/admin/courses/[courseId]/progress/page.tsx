import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";

export const dynamic = "force-dynamic";

interface Cell {
  submitted: boolean;
  correct: number;
  scorable: number;
  pendingFeedback: number;
}

const EMPTY: Cell = { submitted: false, correct: 0, scorable: 0, pendingFeedback: 0 };

export default async function CourseProgressPage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;
  const cId = Number(courseId);
  if (isNaN(cId)) notFound();

  const [course, students, surveys] = await Promise.all([
    prisma.course.findUnique({ where: { id: cId } }),
    prisma.student.findMany({
      // Lärarens provkonto hör inte till klassens siffror
      where: { courseId: cId, isTest: false },
      orderBy: { number: "asc" },
      select: { id: true, number: true, username: true },
    }),
    prisma.survey.findMany({
      where: { courseId: cId },
      orderBy: [{ unitId: "asc" }, { lesson: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        title: true,
        lesson: true,
        unit: { select: { id: true, title: true } },
        responses: {
          select: {
            studentId: true,
            createdAt: true,
            answers: {
              select: {
                isCorrect: true,
                feedback: true,
                question: { select: { type: true } },
              },
            },
          },
        },
      },
    }),
  ]);

  if (!course) notFound();

  type Survey = (typeof surveys)[number];

  // Latest response per (survey, student) -> scoring + pending-feedback counts.
  function statFor(survey: Survey, studentId: number): Cell {
    const rs = survey.responses.filter((r) => r.studentId === studentId);
    if (rs.length === 0) return EMPTY;
    const latest = rs.reduce((a, b) => (b.createdAt > a.createdAt ? b : a));
    let correct = 0;
    let scorable = 0;
    let pendingFeedback = 0;
    for (const ans of latest.answers) {
      if (ans.isCorrect !== null) {
        scorable++;
        if (ans.isCorrect) correct++;
      }
      if (
        ans.question.type === "FREE_TEXT" &&
        (!ans.feedback || ans.feedback.trim() === "")
      ) {
        pendingFeedback++;
      }
    }
    return { submitted: true, correct, scorable, pendingFeedback };
  }

  // Group surveys by moment (unit) for a two-level column header. Surveys are
  // already ordered by unitId, so same-unit surveys are contiguous.
  const groups: { key: string; title: string; surveys: Survey[] }[] = [];
  for (const s of surveys) {
    const key = s.unit ? `u${s.unit.id}` : "none";
    const title = s.unit?.title ?? "Övriga enkäter";
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.surveys.push(s);
    else groups.push({ key, title, surveys: [s] });
  }

  // Short column label: "Uppgift 1 - ..." -> "Uppgift 1", else lesson, else truncated.
  function shortLabel(s: Survey): string {
    const dash = s.title.indexOf(" - ");
    if (dash > 0) return s.title.slice(0, dash);
    if (s.lesson != null) return `L${s.lesson}`;
    return s.title.length > 16 ? s.title.slice(0, 15) + "…" : s.title;
  }

  // Class-wide aggregates.
  let totalCells = 0;
  let submittedCells = 0;
  let classCorrect = 0;
  let classScorable = 0;
  let classPending = 0;
  for (const s of surveys) {
    for (const st of students) {
      const c = statFor(s, st.id);
      totalCells++;
      if (c.submitted) submittedCells++;
      classCorrect += c.correct;
      classScorable += c.scorable;
      classPending += c.pendingFeedback;
    }
  }
  const classAvgPct =
    classScorable > 0 ? Math.round((classCorrect / classScorable) * 100) : null;
  const completionPct =
    totalCells > 0 ? Math.round((submittedCells / totalCells) * 100) : 0;

  const stats = [
    { label: "Elever", value: String(students.length), color: "text-primary" },
    { label: "Completion", value: `${completionPct}%`, color: "text-primary" },
    {
      label: "Snittpoäng (flerval)",
      value: classAvgPct != null ? `${classAvgPct}%` : "–",
      color: "text-accent",
    },
    { label: "Väntar på feedback", value: String(classPending), color: "text-accent" },
  ];

  function cellContent(c: Cell) {
    if (!c.submitted) {
      return <span className="text-muted-light">–</span>;
    }
    let scoreNode;
    if (c.scorable > 0) {
      const ratio = c.correct / c.scorable;
      const cls =
        ratio === 1
          ? "text-accent font-semibold"
          : ratio === 0
            ? "text-muted"
            : "text-foreground font-medium";
      scoreNode = <span className={cls}>{`${c.correct}/${c.scorable}`}</span>;
    } else {
      scoreNode = <span className="text-accent font-semibold">✓</span>;
    }
    return (
      <span className="inline-flex items-center gap-1.5">
        {scoreNode}
        {c.pendingFeedback > 0 && (
          <span
            className="badge bg-warning-light text-warning text-xs"
            title={`${c.pendingFeedback} fritextsvar väntar på feedback`}
          >
            ✎{c.pendingFeedback}
          </span>
        )}
      </span>
    );
  }

  return (
    <div className="animate-fade-in">
      <h1 className="text-2xl font-bold mb-2 tracking-tight">Elevöversikt</h1>
      <p className="text-muted text-sm mb-8">
        Completion och flervalspoäng per elev och uppgift. Cellformat:{" "}
        <span className="font-medium">rätt/totalt</span> flerval, ✓ = inlämnad
        utan flerval, <span className="text-muted-light">–</span> = ej inlämnad,{" "}
        <span className="badge bg-warning-light text-warning text-xs">✎n</span> ={" "}
        n fritextsvar väntar på feedback. Klicka på en ifylld cell för att läsa
        elevens svar och feedback.
      </p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {stats.map((s, i) => (
          <div
            key={s.label}
            className="card p-5 animate-fade-in"
            style={{ animationDelay: `${i * 75}ms` }}
          >
            <div className={`text-3xl font-bold ${s.color}`}>{s.value}</div>
            <div className="text-muted text-sm mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {students.length === 0 ? (
        <div className="card p-12 text-center">
          <p className="text-muted">
            Inga elever registrerade ännu.{" "}
            <Link
              href={`/admin/courses/${cId}/students`}
              className="text-primary hover:underline font-medium"
            >
              Lägg till elever
            </Link>
          </p>
        </div>
      ) : surveys.length === 0 ? (
        <div className="card p-12 text-center">
          <p className="text-muted">
            Inga uppgifter skapade ännu.{" "}
            <Link
              href={`/admin/courses/${cId}/units`}
              className="text-primary hover:underline font-medium"
            >
              Importera ett moment
            </Link>
          </p>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-light text-left">
                <th
                  rowSpan={2}
                  className="p-4 font-semibold text-muted text-xs uppercase tracking-wider align-bottom sticky left-0 bg-surface"
                >
                  Elev
                </th>
                {groups.map((g) => (
                  <th
                    key={g.key}
                    colSpan={g.surveys.length}
                    className="px-3 pt-3 pb-1 font-semibold text-xs tracking-wide text-center border-l border-border-light"
                  >
                    {g.title}
                  </th>
                ))}
                <th
                  rowSpan={2}
                  className="p-4 font-semibold text-muted text-xs uppercase tracking-wider text-center align-bottom border-l border-border-light"
                >
                  Totalt
                </th>
              </tr>
              <tr className="border-b border-border-light text-left">
                {surveys.map((s, idx) => {
                  const groupStart = groups.some((g) => g.surveys[0]?.id === s.id);
                  return (
                    <th
                      key={s.id}
                      title={s.title}
                      className={`px-3 pb-3 pt-1 font-medium text-muted text-xs text-center whitespace-nowrap ${
                        groupStart && idx !== 0 ? "border-l border-border-light" : ""
                      }`}
                    >
                      {shortLabel(s)}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {students.map((st) => {
                let sCompleted = 0;
                let sCorrect = 0;
                let sScorable = 0;
                let sPending = 0;
                const cells = surveys.map((s) => {
                  const c = statFor(s, st.id);
                  if (c.submitted) sCompleted++;
                  sCorrect += c.correct;
                  sScorable += c.scorable;
                  sPending += c.pendingFeedback;
                  return { survey: s, cell: c };
                });
                const sPct =
                  sScorable > 0 ? Math.round((sCorrect / sScorable) * 100) : null;
                return (
                  <tr
                    key={st.id}
                    className="border-b border-border-light last:border-0 hover:bg-surface-muted/50 transition-colors"
                  >
                    <td className="p-4 whitespace-nowrap sticky left-0 bg-surface">
                      <Link
                        href={`/admin/courses/${cId}/students/${st.number}`}
                        className="font-semibold text-primary hover:underline"
                      >
                        #{st.number}
                      </Link>
                      <span className="text-muted-light font-mono text-xs ml-2">
                        {st.username}
                      </span>
                    </td>
                    {cells.map(({ survey, cell }, idx) => {
                      const groupStart = groups.some(
                        (g) => g.surveys[0]?.id === survey.id
                      );
                      return (
                        <td
                          key={survey.id}
                          className={`p-4 text-center ${
                            groupStart && idx !== 0
                              ? "border-l border-border-light"
                              : ""
                          }`}
                        >
                          {cell.submitted ? (
                            <Link
                              href={`/admin/courses/${cId}/students/${st.number}#survey-${survey.id}`}
                              title={`Läs ${st.username}s svar på ${survey.title}`}
                              className="inline-block rounded-md px-1.5 py-0.5 hover:bg-surface-muted transition-colors"
                            >
                              {cellContent(cell)}
                            </Link>
                          ) : (
                            cellContent(cell)
                          )}
                        </td>
                      );
                    })}
                    <td className="p-4 text-center border-l border-border-light whitespace-nowrap">
                      <span className="font-semibold">
                        {sCompleted}/{surveys.length}
                      </span>
                      {sPct != null && (
                        <span className="text-muted-light text-xs ml-2">
                          {sPct}%
                        </span>
                      )}
                      {sPending > 0 && (
                        <span
                          className="badge bg-warning-light text-warning text-xs ml-2"
                          title={`${sPending} fritextsvar väntar på feedback`}
                        >
                          ✎{sPending}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
