import { getStudentSession } from "@/lib/student-session";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { FORMAGA_QUESTION_WHERE, toPracticeQuestion } from "@/lib/practice-question";
import PracticeRunner from "@/components/PracticeRunner";
import { shuffle } from "@/lib/shuffle";

/**
 * Max övningar per förmågepass - kort och tätt slår långt och sällan.
 *
 * Urvalet blandas innan det kapas. Togs förut de första åtta på id, vilket
 * betydde att ett område med många sorteringsfrågor aldrig visade sina
 * tidslinjefrågor (de importerades senare och har högre id) - "Hela kursen"
 * hade tolv sorteringar och noll klickfrågor i passet. Att shuffle här styr
 * urvalet är avsiktligt: förmågeträningen har inget schema att skydda, passet
 * är ett stickprov ur området, och varje nytt pass får vara ett nytt stickprov.
 */
const FORMAGA_SET_CAP = 8;

export default async function FormagaTopicPage({
  params,
}: {
  params: Promise<{ topicId: string }>;
}) {
  const session = await getStudentSession();
  if (!session) redirect("/login");

  const { topicId } = await params;
  const tId = Number(topicId);
  if (isNaN(tId)) notFound();

  // Bara den egna kursens områden - övningen är kursavgränsad.
  const courseIds = [session.courseId];

  const topic = await prisma.topic.findUnique({
    where: { id: tId },
    select: { id: true, name: true, courseId: true },
  });
  if (!topic || !courseIds.includes(topic.courseId)) notFound();

  const dbQuestions = await prisma.question.findMany({
    where: {
      topicId: tId,
      ...FORMAGA_QUESTION_WHERE,
    },
    include: { options: true },
  });

  const questions = shuffle(
    dbQuestions
      .map((q) => toPracticeQuestion(q))
      .filter((q): q is NonNullable<typeof q> => q !== null)
  ).slice(0, FORMAGA_SET_CAP);

  if (questions.length === 0) notFound();

  return (
    <div className="animate-fade-in">
      <h2 className="text-xl font-bold tracking-tight mb-1">{topic.name}</h2>
      <p className="text-sm text-muted mb-6">
        {questions.length} {questions.length === 1 ? "övning" : "övningar"}.
        Efter varje försök får du jämföra med exempelsvar - det är i
        jämförelsen träningen sitter.
      </p>
      <PracticeRunner questions={questions} />
    </div>
  );
}
