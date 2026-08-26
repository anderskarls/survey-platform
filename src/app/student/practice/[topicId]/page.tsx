import { getStudentSession } from "@/lib/student-session";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getRelearningData } from "@/lib/relearning-data";
import { toPracticeQuestion } from "@/lib/practice-question";
import PracticeRunner from "@/components/PracticeRunner";
import {
  loadWeekPracticeTopics,
  loadDoneToday,
} from "@/lib/week-practice-data";
import { orderWeekQuestions, remainingToday } from "@/lib/week-practice";
import Link from "next/link";

/**
 * Veckoövningen: en bestämd veckas ord som kort, på elevens begäran.
 *
 * Vilka veckor som får övas avgörs på servern av samma laddning som bygger
 * listan (loadWeekPracticeTopics) - kortformskurs, släppt enkät. Länken är
 * alltså inte spärren; ett gissat topicId ger notFound.
 *
 * Veckan är delbar. Kort eleven redan gjort idag räknas bort, så ett avbrutet
 * pass fortsätter där det slutade i stället för att börja om. `?igen=1` kör
 * hela veckan ändå - repetitionen flyttar då inga intervall, men den som vill
 * nöta inför provet ska inte hindras.
 */
export default async function WeekPracticePage({
  params,
  searchParams,
}: {
  params: Promise<{ topicId: string }>;
  searchParams: Promise<{ igen?: string }>;
}) {
  const session = await getStudentSession();
  if (!session) redirect("/login");

  const { topicId } = await params;
  const { igen } = await searchParams;
  const tId = Number(topicId);
  if (isNaN(tId)) notFound();

  const weeks = await loadWeekPracticeTopics(session.courseId);
  const week = weeks.find((w) => w.id === tId);
  if (!week) notFound();

  const [{ states }, doneToday] = await Promise.all([
    getRelearningData(session.studentId),
    loadDoneToday(session.studentId, week.questionIds),
  ]);

  const körAllt = igen === "1";
  const kvar = körAllt
    ? week.questionIds
    : remainingToday(week.questionIds, doneToday);

  const rubrik = (
    <>
      <Link
        href="/student/practice"
        className="text-sm text-muted hover:text-foreground transition-colors"
      >
        &larr; Att öva på
      </Link>
      <h2 className="text-xl font-bold tracking-tight mb-1 mt-2">
        {week.name}
      </h2>
    </>
  );

  // Hela veckan avklarad idag. Att visa korten igen vore arbete utan verkan -
  // bara dagens första försök flyttar ett intervall - men vägen finns för den
  // som vill nöta ändå.
  if (kvar.length === 0) {
    return (
      <div className="animate-fade-in">
        {rubrik}
        <div className="card p-6 text-center mt-6">
          <p className="font-semibold mb-1">Klar med veckan för idag</p>
          <p className="text-sm text-muted">
            Du har gått igenom alla {week.questionIds.length} kort idag. Orden
            återkommer i ditt vanliga pass när det är dags att repetera dem -
            att köra om dem nu flyttar inte fram nästa repetition.
          </p>
          <div className="flex items-center justify-center gap-3 mt-4">
            <Link href="/student/practice" className="btn-primary py-2 px-5">
              Tillbaka till Att öva på
            </Link>
            <Link
              href={`/student/practice/${week.id}?igen=1`}
              className="btn-secondary py-2 px-5"
            >
              Kör igenom ändå
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Elevens FSRS-status styr ordningen: det som behöver arbete kommer först.
  const orderedIds = orderWeekQuestions(kvar, states);

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

  const gjordaIdag = week.questionIds.length - kvar.length;
  const due = kvar.filter((id) => states.get(id)?.isDue).length;
  const nya = kvar.filter((id) => !states.has(id)).length;

  return (
    <div className="animate-fade-in">
      {rubrik}
      <p className="text-sm text-muted mb-6">
        {gjordaIdag > 0
          ? `${questions.length} kort kvar av veckans ${week.questionIds.length} - du gjorde ${gjordaIdag} tidigare idag.`
          : `${questions.length} kort, hela veckan.`}{" "}
        {due > 0 || nya > 0
          ? `Det som behöver arbete ligger först${
              due > 0 ? ` (${due} att repetera` : " ("
            }${nya > 0 ? `${due > 0 ? ", " : ""}${nya} nya` : ""}).`
          : "Allt sitter just nu - kör ändå om du vill nöta inför testet."}{" "}
        Du kan sluta när du vill och fortsätta senare; varje kort sparas när du
        skattat det. Skattningen räknas som övning, så orden återkommer i ditt
        vanliga pass.
      </p>
      <PracticeRunner
        questions={questions}
        doneHref="/student/practice"
        doneLabel="Tillbaka till Att öva på"
        pauseHref="/student/practice"
      />
    </div>
  );
}
