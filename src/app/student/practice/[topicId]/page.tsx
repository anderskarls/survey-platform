import { getStudentSession } from "@/lib/student-session";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getRelearningData } from "@/lib/relearning-data";
import { toPracticeQuestion } from "@/lib/practice-question";
import PracticeRunner from "@/components/PracticeRunner";
import { loadWeekPracticeTopics } from "@/lib/week-practice-data";
import { orderWeekQuestions } from "@/lib/week-practice";
import Link from "next/link";

/**
 * Veckoövningen: en bestämd veckas ord som kort, på elevens begäran.
 *
 * Vilka veckor som får övas avgörs på servern av samma laddning som bygger
 * listan (loadWeekPracticeTopics) - kortformskurs, släppt enkät. Länken är
 * alltså inte spärren; ett gissat topicId ger notFound.
 */
export default async function WeekPracticePage({
  params,
}: {
  params: Promise<{ topicId: string }>;
}) {
  const session = await getStudentSession();
  if (!session) redirect("/login");

  const { topicId } = await params;
  const tId = Number(topicId);
  if (isNaN(tId)) notFound();

  const weeks = await loadWeekPracticeTopics(session.courseId);
  const week = weeks.find((w) => w.id === tId);
  if (!week) notFound();

  // Elevens FSRS-status styr ordningen: det som behöver arbete kommer först.
  const { states } = await getRelearningData(session.studentId);
  const orderedIds = orderWeekQuestions(week.questionIds, states);

  const dbQuestions = await prisma.question.findMany({
    where: { id: { in: orderedIds } },
    include: {
      options: true,
      topic: { select: { course: { select: { flashcardMode: true } } } },
    },
  });
  const byId = new Map(dbQuestions.map((q) => [q.id, q]));
  const questions = orderedIds
    .map((id) => byId.get(id))
    .filter((q): q is NonNullable<typeof q> => q !== undefined)
    .map((q) => toPracticeQuestion(q, null, q.topic.course.flashcardMode))
    .filter((q): q is NonNullable<typeof q> => q !== null);

  if (questions.length === 0) notFound();

  const due = week.questionIds.filter((id) => states.get(id)?.isDue).length;
  const fresh = week.questionIds.filter((id) => !states.has(id)).length;

  return (
    <div className="animate-fade-in">
      <Link
        href="/student/practice"
        className="text-sm text-muted hover:text-foreground transition-colors"
      >
        &larr; Att öva på
      </Link>
      <h2 className="text-xl font-bold tracking-tight mb-1 mt-2">
        {week.name}
      </h2>
      <p className="text-sm text-muted mb-6">
        {questions.length} kort, hela veckan.{" "}
        {due > 0 || fresh > 0
          ? `Det som behöver arbete ligger först${
              due > 0 ? ` (${due} att repetera` : " ("
            }${fresh > 0 ? `${due > 0 ? ", " : ""}${fresh} nya` : ""}).`
          : "Allt sitter just nu - kör ändå om du vill nöta inför testet."}{" "}
        Skattningen räknas som övning, så orden återkommer i ditt vanliga pass.
      </p>
      <PracticeRunner
        questions={questions}
        doneHref="/student/practice"
        doneLabel="Tillbaka till Att öva på"
      />
    </div>
  );
}
