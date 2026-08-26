import { getStudentSession } from "@/lib/student-session";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  calculateMastery,
  latestAnswers,
  type AnswerRecord,
} from "@/lib/question-progress";
import { getRelearningData } from "@/lib/relearning-data";
import StudentQuizForm from "@/components/StudentQuizForm";
import Link from "next/link";
import { toClientClozeConfig } from "@/lib/cloze";
import { isReleased } from "@/lib/survey-release";

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

  // Schemalagt test som inte släppts än - direktlänken ska inte vara en genväg
  // förbi veckoordningen.
  if (!isReleased(survey)) {
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

  const allRecords: AnswerRecord[] = responses.flatMap((r) =>
    r.answers.map((a) => ({
      questionId: a.questionId,
      isCorrect: a.isCorrect,
      createdAt: r.createdAt,
    }))
  );

  // Samma behärskningsmodell som startsidans progressbar: FSRS för det som
  // finns i övningspoolen, senaste svaret för luckfrågor och fritext. Annars
  // kunde eleven läsa "12 av 15 klarade" och sedan få alla 15 igen.
  const { states } = await getRelearningData(studentId);
  const questionIds = survey.questions.map((sq) => sq.questionId);
  const { remainingIds } = calculateMastery(
    questionIds,
    states,
    latestAnswers(allRecords)
  );
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
      // Luckfrågans ledtråd. Facit stannar på servern - se toClientClozeConfig.
      cloze: toClientClozeConfig(sq.question.type, sq.question.config),
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
