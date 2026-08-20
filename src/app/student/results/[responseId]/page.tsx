import { getStudentSession } from "@/lib/student-session";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import FeedbackDisplay from "@/components/FeedbackButton";
import { flashcardLabel } from "@/lib/flashcard";

export default async function ResultDetailPage({
  params,
}: {
  params: Promise<{ responseId: string }>;
}) {
  const { responseId: responseIdStr } = await params;
  const responseId = Number(responseIdStr);

  const session = await getStudentSession();
  if (!session) redirect("/login");

  const response = await prisma.response.findUnique({
    where: { id: responseId },
    include: {
      survey: true,
      answers: {
        include: {
          question: { include: { options: true } },
        },
      },
    },
  });

  if (!response || response.studentId !== session.studentId) {
    redirect("/student/results");
  }

  const isQuiz = response.survey.mode === "QUIZ";
  const correctCount = response.answers.filter(
    (a) => a.isCorrect === true
  ).length;
  const totalGraded = response.answers.filter(
    (a) => a.isCorrect !== null
  ).length;

  return (
    <div className="animate-fade-in">
      <div className="mb-4">
        <Link href="/student/results" className="text-sm text-primary font-medium hover:underline">
          &larr; Tillbaka till resultat
        </Link>
      </div>

      <div className="card p-5 mb-6">
        <h2 className="text-xl font-bold tracking-tight">
          {response.survey.title}
        </h2>
        <p className="text-sm text-muted mt-1">
          Besvarad {response.createdAt.toLocaleDateString("sv-SE")}
        </p>
        {isQuiz && totalGraded > 0 && (
          <div className="mt-3 flex items-center gap-3">
            <span
              className={`text-2xl font-bold ${
                Math.round((correctCount / totalGraded) * 100) >= 80
                  ? "text-success"
                  : Math.round((correctCount / totalGraded) * 100) >= 50
                    ? "text-warning"
                    : "text-error"
              }`}
            >
              {correctCount}/{totalGraded} rätt
            </span>
            <span className="text-sm text-muted">
              ({Math.round((correctCount / totalGraded) * 100)}%)
            </span>
          </div>
        )}
      </div>

      <div className="space-y-4">
        {response.answers.map((answer, idx) => {
          const correctOption = answer.question.options.find(
            (o) => o.isCorrect
          );
          const isCorrect = answer.isCorrect === true;
          const isWrong = answer.isCorrect === false;
          const isUnsure = answer.value === "__UNSURE__";
          const isFreeText = answer.question.type === "FREE_TEXT";
          // Flashcard: värdet är elevens egen skattning, inte ett valt svar
          const rating = flashcardLabel(answer.value);

          return (
            <div
              key={answer.id}
              className={`card p-4 border-l-4 ${
                isCorrect
                  ? "border-l-success"
                  : isWrong
                    ? "border-l-warning"
                    : isUnsure
                      ? "border-l-accent"
                      : "border-l-border"
              }`}
            >
              <p className="font-medium mb-2">
                {idx + 1}. {answer.question.text}
              </p>

              <div className="text-sm space-y-1">
                {isUnsure ? (
                  <p className="text-accent">
                    Du markerade att du var osäker - bra att du var ärlig!
                  </p>
                ) : rating ? (
                  <p>
                    Rätt svar:{" "}
                    <span className="font-semibold">{correctOption?.text}</span>
                    <span className="text-muted">
                      {" "}
                      - du skattade kortet som {rating.toLowerCase()}
                    </span>
                  </p>
                ) : (
                  <p>
                    <span className="text-muted">Ditt svar: </span>
                    <span
                      className={`font-medium ${
                        isCorrect
                          ? "text-success"
                          : isWrong
                            ? "text-muted"
                            : ""
                      }`}
                    >
                      {answer.value}
                    </span>
                  </p>
                )}
                {(isWrong || isUnsure) && correctOption && (
                  <p>
                    <span className="text-muted">Det rätta svaret: </span>
                    <span className="font-medium text-success">
                      {correctOption.text}
                    </span>
                  </p>
                )}
              </div>

              {isFreeText && (
                <FeedbackDisplay feedback={answer.feedback} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
