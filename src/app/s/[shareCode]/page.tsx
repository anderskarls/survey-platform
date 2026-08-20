import { prisma } from "@/lib/prisma";
import { notFound, redirect } from "next/navigation";
import SurveyForm from "@/components/SurveyForm";
import { getStudentSession } from "@/lib/student-session";

export const dynamic = "force-dynamic";

export default async function PublicSurveyPage({
  params,
}: {
  params: Promise<{ shareCode: string }>;
}) {
  const { shareCode } = await params;

  const session = await getStudentSession();
  if (!session) {
    redirect(`/login?next=${encodeURIComponent(`/s/${shareCode}`)}`);
  }

  const survey = await prisma.survey.findUnique({
    where: { shareCode },
    include: {
      course: { select: { flashcardMode: true } },
      questions: {
        include: { question: { include: { options: true } } },
        orderBy: { order: "asc" },
      },
    },
  });

  if (!survey) notFound();

  if (survey.courseId !== session.courseId) {
    redirect("/student");
  }

  const flashcard = survey.course.flashcardMode;
  const surveyData = {
    id: survey.id,
    title: survey.title,
    description: survey.description,
    mode: survey.mode,
    lockMode: survey.lockMode,
    flashcard,
    questions: survey.questions.map((sq) => ({
      id: sq.question.id,
      text: sq.question.text,
      type: sq.question.type,
      options: sq.question.options.map((o) => o.text),
      // Baksidan följer bara med i flashcardläge - i vanliga enkäter får
      // facit aldrig nå klienten före svaret.
      answer: flashcard
        ? sq.question.options.find((o) => o.isCorrect)?.text ?? null
        : null,
    })),
  };

  return (
    <div className="min-h-screen bg-background py-12">
      <div className="max-w-2xl mx-auto px-4">
        <SurveyForm survey={surveyData} />
      </div>
    </div>
  );
}
