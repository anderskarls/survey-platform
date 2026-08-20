import { getStudentSession } from "@/lib/student-session";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { calculateMastery, ResponseRecord } from "@/lib/mastery";
import StudentQuizForm from "@/components/StudentQuizForm";
import Link from "next/link";

export default async function StudentQuizPage({
  params,
}: {
  params: Promise<{ surveyId: string }>;
}) {
  const { surveyId: surveyIdStr } = await params;
  const surveyId = Number(surveyIdStr);

  const session = await getStudentSession();
  if (!session) redirect("/login");

  const { studentId, courseId } = session;

  const survey = await prisma.survey.findUnique({
    where: { id: surveyId },
    include: {
      course: true,
      questions: {
        include: {
          question: {
            include: { options: true },
          },
        },
        orderBy: { order: "asc" },
      },
    },
  });

  if (!survey || survey.courseId !== courseId) {
    redirect("/student");
  }

  // Get all surveys in the course for mastery calculation
  const allSurveys = await prisma.survey.findMany({
    where: { courseId },
    select: { id: true },
  });

  const responses = await prisma.response.findMany({
    where: { studentId, surveyId: { in: allSurveys.map((s) => s.id) } },
    include: { answers: true },
    orderBy: { createdAt: "asc" },
  });

  const allRecords: ResponseRecord[] = responses.flatMap((r) =>
    r.answers.map((a) => ({
      questionId: a.questionId,
      isCorrect: a.isCorrect,
      createdAt: r.createdAt,
    }))
  );

  const questionIds = survey.questions.map((sq) => sq.questionId);
  const { remainingIds } = calculateMastery(questionIds, allRecords);
  const remainingSet = new Set(remainingIds);

  // Filter to only non-mastered questions
  const flashcard = survey.course.flashcardMode;
  const remainingQuestions = survey.questions
    .filter((sq) => remainingSet.has(sq.questionId))
    .map((sq) => ({
      id: sq.questionId,
      text: sq.question.text,
      type: sq.question.type,
      options: sq.question.options.map((o) => o.text),
      // Baksidan skickas bara i flashcardläge, där eleven ändå ska vända
      // kortet. I vanliga quiz får facit aldrig lämna servern före svaret.
      answer: flashcard
        ? sq.question.options.find((o) => o.isCorrect)?.text ?? null
        : null,
    }));

  if (remainingQuestions.length === 0) {
    redirect("/student");
  }

  return (
    <div>
      <div className="mb-4">
        <Link href="/student" className="text-sm text-blue-600 hover:underline">
          ← Tillbaka till dashboard
        </Link>
      </div>
      <StudentQuizForm
        survey={{
          id: survey.id,
          title: survey.title,
          description: survey.description,
          mode: survey.mode,
          questions: remainingQuestions,
        }}
        lockMode={survey.lockMode}
        flashcard={flashcard}
      />
    </div>
  );
}
