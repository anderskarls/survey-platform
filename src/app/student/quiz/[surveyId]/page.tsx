import { getStudentSession } from "@/lib/student-session";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import StudentQuizForm from "@/components/StudentQuizForm";
import { toEnkatFraga } from "@/lib/enkatfraga";
import Link from "next/link";
import { isReleased } from "@/lib/survey-release";

/**
 * Elevens testvy. Hela testet, varje gång.
 *
 * Fram till 2026-09-22 filtrerade den här vyn bort frågor eleven redan
 * räknades som klar med, så ett omförsök bara ställde det man haft fel på.
 * Det var rimligt när "Öva igen" var appens enda repetitionsväg, men den
 * vägen finns numera i övningen, där FSRS avgör vad som ska tillbaka och när.
 * Kvar blev en mätning som mätte olika saker för olika elever: veckotestet
 * gav femton ord till den som var ny och tre till den som var nära, och ett
 * resultat gick inte att jämföra med sig självt en vecka senare.
 *
 * Nu gäller en regel: testet är testet. Den som gör om det gör om hela.
 */
export default async function StudentQuizPage({
  params,
}: {
  params: Promise<{ surveyId: string }>;
}) {
  const { surveyId: surveyIdStr } = await params;
  const surveyId = Number(surveyIdStr);

  const session = await getStudentSession();
  if (!session) redirect("/login");

  const { courseId } = session;

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

  const flashcard = survey.course.flashcardMode;
  const questions = survey.questions.map((sq) =>
    toEnkatFraga(sq.question, flashcard)
  );

  // Ett tomt test är lärarens halvfärdiga utkast, inte något eleven ska möta.
  if (questions.length === 0) {
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
          questions,
        }}
        lockMode={survey.lockMode}
        flashcard={flashcard}
      />
    </div>
  );
}
