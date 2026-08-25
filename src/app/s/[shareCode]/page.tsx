import { prisma } from "@/lib/prisma";
import { notFound, redirect } from "next/navigation";
import SurveyForm from "@/components/SurveyForm";
import { getStudentSession } from "@/lib/student-session";
import { toClientClozeConfig } from "@/lib/cloze";
import { isReleased, formatRelease } from "@/lib/survey-release";
import Link from "next/link";

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

  // Delningslänken är ingen genväg förbi släppdatumet. Eleven får se att
  // enkäten finns och när den öppnar - inte dess innehåll.
  if (survey.openAt && !isReleased(survey)) {
    return (
      <div className="min-h-screen bg-background py-12">
        <div className="max-w-2xl mx-auto px-4">
          <div className="card p-8 text-center">
            <h1 className="text-xl font-bold tracking-tight">{survey.title}</h1>
            <p className="text-muted mt-2">
              Öppnar {formatRelease(survey.openAt)}
            </p>
            <Link href="/student" className="btn-primary inline-block mt-6">
              Till mina uppgifter
            </Link>
          </div>
        </div>
      </div>
    );
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
      // Luckfrågans ledtråd. Facit stannar på servern - se toClientClozeConfig.
      cloze: toClientClozeConfig(sq.question.type, sq.question.config),
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
