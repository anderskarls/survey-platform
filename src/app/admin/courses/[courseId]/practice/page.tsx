import { prisma } from "@/lib/prisma";
import { loadCourseRelearningOverview } from "@/lib/relearning-data";
import { notFound } from "next/navigation";
import Link from "next/link";

export const dynamic = "force-dynamic";

const dayFormatter = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Europe/Stockholm",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export default async function CoursePracticePage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;
  const cId = Number(courseId);
  if (isNaN(cId)) notFound();

  const [course, students, overview] = await Promise.all([
    prisma.course.findUnique({ where: { id: cId } }),
    prisma.student.findMany({
      where: { courseId: cId },
      orderBy: { number: "asc" },
      select: { id: true, number: true, username: true },
    }),
    loadCourseRelearningOverview(cId),
  ]);

  if (!course) notFound();

  const { byStudent, questionGaps, totals } = overview;
  const studentsWithPool = students.filter((st) => {
    const o = byStudent.get(st.id);
    return o && o.learning + o.graduated > 0;
  });

  const stats = [
    { label: "Att öva nu", value: String(totals.due), color: "text-accent" },
    {
      label: "Under inlärning",
      value: String(totals.learning),
      color: "text-primary",
    },
    {
      label: "Behärskade (minst veckointervall)",
      value: String(totals.graduated),
      color: "text-primary",
    },
    {
      label: "Aktiva övare (7 d)",
      value: `${totals.activePractitioners7d} av ${students.length}`,
      color: "text-accent",
    },
  ];

  function lastPracticeLabel(d: Date | null): string {
    if (!d) return "–";
    return dayFormatter.format(d);
  }

  return (
    <div className="animate-fade-in">
      <h1 className="text-2xl font-bold mb-2 tracking-tight">Övning</h1>
      <p className="text-muted text-sm mb-8">
        Spaced repetition i Anki-stil (FSRS): alla flervalsfrågor en elev mött
        schemaläggs individuellt och återkommer i övningspasset lagom innan de
        glöms - oftare när de är svåra, alltmer sällan när de sitter. Behärskad
        = nästa repetition ligger minst en vecka bort. Här ser du vem som övar,
        vem som låter luckorna ligga, och vilka frågor som inte sitter i
        klassen.
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
      ) : studentsWithPool.length === 0 ? (
        <div className="card p-12 text-center">
          <p className="text-muted">
            Ingen övningsdata ännu. När elever besvarar flervalsfrågor i quiz
            schemaläggs frågorna i deras övningspool och dyker upp här.
          </p>
        </div>
      ) : (
        <>
          <div className="card overflow-x-auto mb-8">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-light text-left">
                  <th className="p-4 font-semibold text-muted text-xs uppercase tracking-wider">
                    Elev
                  </th>
                  <th className="p-4 font-semibold text-muted text-xs uppercase tracking-wider text-center">
                    Att öva nu
                  </th>
                  <th className="p-4 font-semibold text-muted text-xs uppercase tracking-wider text-center">
                    Under inlärning
                  </th>
                  <th className="p-4 font-semibold text-muted text-xs uppercase tracking-wider text-center">
                    Behärskade
                  </th>
                  <th className="p-4 font-semibold text-muted text-xs uppercase tracking-wider text-center">
                    Försök 7 d
                  </th>
                  <th className="p-4 font-semibold text-muted text-xs uppercase tracking-wider text-center">
                    Senast övade
                  </th>
                </tr>
              </thead>
              <tbody>
                {students.map((st) => {
                  const o = byStudent.get(st.id);
                  const due = o?.due ?? 0;
                  const learning = o?.learning ?? 0;
                  const graduated = o?.graduated ?? 0;
                  const attempts7d = o?.attempts7d ?? 0;
                  const neglecting = due > 0 && attempts7d === 0;
                  return (
                    <tr
                      key={st.id}
                      className="border-b border-border-light last:border-0 hover:bg-surface-muted/50 transition-colors"
                    >
                      <td className="p-4 whitespace-nowrap">
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
                      <td className="p-4 text-center">
                        {due > 0 ? (
                          <span className="inline-flex items-center gap-1.5">
                            <span className="font-semibold text-accent">
                              {due}
                            </span>
                            {neglecting && (
                              <span
                                className="badge bg-warning-light text-warning text-xs"
                                title="Har frågor att öva men har inte övat senaste veckan"
                              >
                                ej övat
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="text-muted-light">–</span>
                        )}
                      </td>
                      <td className="p-4 text-center">
                        {learning > 0 ? (
                          <span className="font-medium">{learning}</span>
                        ) : (
                          <span className="text-muted-light">–</span>
                        )}
                      </td>
                      <td className="p-4 text-center">
                        {graduated > 0 ? (
                          <span className="text-accent font-semibold">
                            {graduated}
                          </span>
                        ) : (
                          <span className="text-muted-light">–</span>
                        )}
                      </td>
                      <td className="p-4 text-center">
                        {attempts7d > 0 ? (
                          <span className="font-medium">{attempts7d}</span>
                        ) : (
                          <span className="text-muted-light">–</span>
                        )}
                      </td>
                      <td className="p-4 text-center whitespace-nowrap text-muted">
                        {lastPracticeLabel(o?.lastPractice ?? null)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {questionGaps.length > 0 && (
            <div className="mb-8">
              <h2 className="text-lg font-semibold mb-1 tracking-tight">
                Klassens luckor
              </h2>
              <p className="text-sm text-muted mb-3">
                Frågor som flest elever ännu inte behärskar (intervall under en
                vecka). Toppen av listan är kandidater att ta upp i helklass.
              </p>
              <div className="card overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border-light text-left">
                      <th className="p-4 font-semibold text-muted text-xs uppercase tracking-wider">
                        Fråga
                      </th>
                      <th className="p-4 font-semibold text-muted text-xs uppercase tracking-wider whitespace-nowrap">
                        Topic
                      </th>
                      <th className="p-4 font-semibold text-muted text-xs uppercase tracking-wider text-center whitespace-nowrap">
                        Elever med luckan
                      </th>
                      <th className="p-4 font-semibold text-muted text-xs uppercase tracking-wider text-center whitespace-nowrap">
                        Varav redo att öva
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {questionGaps.slice(0, 10).map((g) => (
                      <tr
                        key={g.questionId}
                        className="border-b border-border-light last:border-0"
                      >
                        <td className="p-4">{g.text}</td>
                        <td className="p-4 whitespace-nowrap text-muted">
                          {g.topicName}
                        </td>
                        <td className="p-4 text-center font-semibold">
                          {g.studentsInLearning}
                        </td>
                        <td className="p-4 text-center text-muted">
                          {g.studentsDue}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {questionGaps.length > 10 && (
                <p className="text-xs text-muted-light mt-2">
                  Visar de 10 största av {questionGaps.length} frågor med
                  luckor.
                </p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
