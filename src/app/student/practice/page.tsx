import { getStudentSession } from "@/lib/student-session";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { loadRelearningData } from "@/lib/relearning-data";
import { selectPracticeSet, summarizeStates } from "@/lib/relearning";
import PracticeRunner from "@/components/PracticeRunner";
import Link from "next/link";

export default async function PracticePage() {
  const session = await getStudentSession();
  if (!session) redirect("/login");

  const { states, candidates, questionInfo, accounts } =
    await loadRelearningData(session.studentId);
  const stats = summarizeStates(states);
  const setIds = selectPracticeSet(candidates, states);
  // Kursetiketter visas bara när övningen spänner över flera kurser
  const multiCourse = new Set(accounts.map((a) => a.courseId)).size > 1;

  if (setIds.length === 0) {
    // Nästa tillfälle = minsta antal dagar tills någon fråga blir due
    let nextInDays: number | null = null;
    for (const s of states.values()) {
      if (!s.isDue && (nextInDays === null || s.daysUntilDue < nextInDays)) {
        nextInDays = s.daysUntilDue;
      }
    }

    return (
      <div className="animate-fade-in">
        <h2 className="text-xl font-bold tracking-tight mb-1">Att öva på</h2>
        <p className="text-sm text-muted mb-6">
          Frågor du missat återkommer här tills du svarat rätt tre olika dagar.
        </p>
        <div className="card p-6 text-center">
          <p className="font-semibold mb-1">Inget att öva på just nu</p>
          {states.size === 0 ? (
            <p className="text-sm text-muted">
              När du svarar fel på en quizfråga hamnar den här, så att du kan
              träna bort luckan i lugn och ro.
            </p>
          ) : (
            <p className="text-sm text-muted">
              {stats.learning > 0 && (
                <>
                  {stats.learning}{" "}
                  {stats.learning === 1 ? "fråga är" : "frågor är"} under
                  inlärning
                  {nextInDays !== null && (
                    <>
                      {" "}
                      - nästa övningstillfälle{" "}
                      {nextInDays === 1 ? "imorgon" : `om ${nextInDays} dagar`}
                    </>
                  )}
                  .{" "}
                </>
              )}
              {stats.graduated > 0 && (
                <>
                  {stats.graduated}{" "}
                  {stats.graduated === 1 ? "fråga är" : "frågor är"} i
                  underhållsläge.
                </>
              )}
            </p>
          )}
          <Link href="/student" className="btn-secondary inline-block mt-4 py-2 px-5">
            Tillbaka till dashboard
          </Link>
        </div>
      </div>
    );
  }

  const dbQuestions = await prisma.question.findMany({
    where: { id: { in: setIds } },
    include: { options: true },
  });
  const byId = new Map(dbQuestions.map((q) => [q.id, q]));
  const questions = setIds
    .map((id) => byId.get(id))
    .filter((q): q is NonNullable<typeof q> => q !== undefined)
    .map((q) => ({
      id: q.id,
      text: q.text,
      options: q.options.map((o) => o.text),
      courseName: multiCourse
        ? (questionInfo.get(q.id)?.courseName ?? null)
        : null,
    }));

  return (
    <div className="animate-fade-in">
      <h2 className="text-xl font-bold tracking-tight mb-1">Att öva på</h2>
      <p className="text-sm text-muted mb-6">
        {questions.length} {questions.length === 1 ? "fråga" : "frågor"} är redo
        att övas. Rätt svar tre olika dagar gör att frågan sitter - det är
        därför samma fråga kommer tillbaka.
      </p>
      <PracticeRunner questions={questions} />
    </div>
  );
}
