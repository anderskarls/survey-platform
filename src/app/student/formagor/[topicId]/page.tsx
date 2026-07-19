import { getStudentSession } from "@/lib/student-session";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { resolveLinkedAccounts } from "@/lib/relearning-data";
import { toPracticeQuestion } from "@/lib/practice-question";
import PracticeRunner from "@/components/PracticeRunner";

/** Max övningar per förmågepass - kort och tätt slår långt och sällan */
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

  const accounts = await resolveLinkedAccounts(session.studentId);
  const courseIds = accounts.map((a) => a.courseId);

  const topic = await prisma.topic.findUnique({
    where: { id: tId },
    select: { id: true, name: true, courseId: true },
  });
  if (!topic || !courseIds.includes(topic.courseId)) notFound();

  const dbQuestions = await prisma.question.findMany({
    where: {
      topicId: tId,
      OR: [{ subskill: { not: null } }, { type: "SORTING" }],
    },
    include: { options: true },
    orderBy: { id: "asc" },
    take: FORMAGA_SET_CAP,
  });

  const questions = dbQuestions
    .map((q) => toPracticeQuestion(q))
    .filter((q): q is NonNullable<typeof q> => q !== null);

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
