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

/** "Styrka: ... Nästa steg: ..." -> rader med fetmarkerade etiketter */
function feedbackLines(feedback: string): { label: string; text: string }[] {
  const match = feedback.match(/Styrka:\s*([\s\S]*?)\s*Nästa steg:\s*([\s\S]*)/);
  if (!match) return [{ label: "", text: feedback }];
  return [
    { label: "Styrka", text: match[1].trim() },
    { label: "Nästa steg", text: match[2].trim() },
  ];
}

const dateFormatter = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Europe/Stockholm",
  day: "numeric",
  month: "short",
});

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
  const studentIds = accounts.map((a) => a.studentId);
  const multiCourse = new Set(courseIds).size > 1;

  // Feedback på fritextförsök skrivs asynkront av läraren - visa de senaste
  const feedbackAttempts = await prisma.practiceAttempt.findMany({
    where: { studentId: { in: studentIds }, aiFeedback: { not: null } },
    select: {
      id: true,
      value: true,
      aiFeedback: true,
      createdAt: true,
      question: { select: { text: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

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

      {feedbackAttempts.length > 0 && (
        <div className="mt-8">
          <h3 className="font-bold tracking-tight mb-1">
            Återkoppling på dina resonemang
          </h3>
          <p className="text-sm text-muted mb-3">
            Din lärare tittar löpande på övningssvaren - här är den senaste
            återkopplingen.
          </p>
          <div className="flex flex-col gap-3">
            {feedbackAttempts.map((a) => (
              <div key={a.id} className="card p-5">
                <div className="flex items-baseline justify-between gap-2 mb-2">
                  <p className="font-semibold text-sm">{a.question.text}</p>
                  <span className="text-xs text-muted whitespace-nowrap">
                    {dateFormatter.format(a.createdAt)}
                  </span>
                </div>
                <p className="text-sm text-muted mb-3 whitespace-pre-wrap border-l-2 border-border-light pl-3">
                  {a.value}
                </p>
                <div className="p-3 rounded-xl bg-primary-light">
                  {feedbackLines(a.aiFeedback ?? "").map((line, i) => (
                    <p key={i} className={`text-sm ${i > 0 ? "mt-2" : ""}`}>
                      {line.label && (
                        <span className="font-semibold">{line.label}: </span>
                      )}
                      {line.text}
                    </p>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
