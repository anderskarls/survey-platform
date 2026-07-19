import { getStudentSession } from "@/lib/student-session";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { resolveLinkedAccounts } from "@/lib/relearning-data";
import Link from "next/link";

const SUBSKILL_LABEL: Record<string, string> = {
  kategorisera: "Kategorisera",
  kedjor: "Bygga kedjor",
  forgrena: "Förgrena",
  vikta: "Vikta",
  kritisera: "Kritisera och förbättra",
};

/**
 * Förmågeträning: fritt tillgängliga övningar i orsaks- och konsekvens-
 * resonemang, grupperade per område. Skiljer sig från "Att öva på" som
 * styrs av repetitionsschemat - här väljer eleven själv vad som övas.
 */
export default async function FormagorPage() {
  const session = await getStudentSession();
  if (!session) redirect("/login");

  const accounts = await resolveLinkedAccounts(session.studentId);
  const courseIds = accounts.map((a) => a.courseId);
  const multiCourse = new Set(courseIds).size > 1;

  const questions = await prisma.question.findMany({
    where: {
      topic: { courseId: { in: courseIds } },
      OR: [{ subskill: { not: null } }, { type: "SORTING" }],
    },
    select: {
      id: true,
      subskill: true,
      topic: {
        select: { id: true, name: true, course: { select: { name: true } } },
      },
    },
    orderBy: { id: "asc" },
  });

  const byTopic = new Map<
    number,
    { name: string; courseName: string; count: number; subskills: Set<string> }
  >();
  for (const q of questions) {
    const entry = byTopic.get(q.topic.id) ?? {
      name: q.topic.name,
      courseName: q.topic.course.name,
      count: 0,
      subskills: new Set<string>(),
    };
    entry.count++;
    if (q.subskill) entry.subskills.add(q.subskill);
    byTopic.set(q.topic.id, entry);
  }

  return (
    <div className="animate-fade-in">
      <h2 className="text-xl font-bold tracking-tight mb-1">Förmågeträning</h2>
      <p className="text-sm text-muted mb-6">
        Här tränar du själva resonerandet - att sortera orsaker, bygga kedjor
        och väga vad som spelade störst roll. Du får se exempelsvar efter
        varje försök och bedömer själv hur ditt resonemang stod sig.
      </p>

      {byTopic.size === 0 ? (
        <div className="card p-6 text-center">
          <p className="font-semibold mb-1">Inga förmågeövningar ännu</p>
          <p className="text-sm text-muted">
            Övningar dyker upp här när din lärare har lagt in dem.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {Array.from(byTopic.entries()).map(([topicId, t]) => (
            <div key={topicId} className="card p-5">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  {multiCourse && (
                    <span className="inline-block text-xs font-semibold uppercase tracking-wider text-muted bg-surface-muted rounded-full px-2.5 py-1 mb-2">
                      {t.courseName}
                    </span>
                  )}
                  <h3 className="font-bold tracking-tight">{t.name}</h3>
                  <p className="text-sm text-muted mt-1">
                    {t.count} {t.count === 1 ? "övning" : "övningar"}
                    {t.subskills.size > 0 && (
                      <>
                        {" - "}
                        {Array.from(t.subskills)
                          .map((s) => SUBSKILL_LABEL[s] ?? s)
                          .join(", ")}
                      </>
                    )}
                  </p>
                </div>
                <Link
                  href={`/student/formagor/${topicId}`}
                  className="btn-primary py-2.5 px-5"
                >
                  Öva
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
