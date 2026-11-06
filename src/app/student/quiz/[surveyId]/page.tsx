import { getStudentSession } from "@/lib/student-session";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import StudentQuizForm from "@/components/StudentQuizForm";
import { toEnkatFraga } from "@/lib/enkatfraga";
import Link from "next/link";
import { isReleased } from "@/lib/survey-release";
import { serieHref } from "@/lib/serie";
import { kanVisaLedtrad } from "@/lib/ledtrad-sparr";
import type { LedtradKind, TidigareLedtrad } from "@/lib/ledtrad";

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

  // Serieuppgifter (kartan) lämnas aldrig in - de fylls i i kartvyn, där allt
  // sparas som utkast. Gamla länkar och startsidan leder hit.
  if (survey.series && survey.unitId != null) {
    redirect(serieHref(survey.unitId, survey.series, survey.id));
  }

  const flashcard = survey.course.flashcardMode;
  const questions = survey.questions.map((sq) =>
    toEnkatFraga(sq.question, flashcard)
  );

  // Ett tomt test är lärarens halvfärdiga utkast, inte något eleven ska möta.
  if (questions.length === 0) {
    redirect("/student");
  }

  const ledtradar = await hamtaLedtradar(survey, session.studentId, courseId);

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
        ledtradar={ledtradar}
      />
    </div>
  );
}

/**
 * Vilka frågor som får en ledtrådsknapp, och vad eleven redan fått. Samma
 * spärrar som routen (kanVisaLedtrad); undefined när eleven inte har stödet,
 * så att formuläret ser ut precis som förut för alla andra.
 */
async function hamtaLedtradar(
  survey: {
    id: number;
    mode: string;
    lockMode: boolean;
    courseId: number;
    openAt: Date | null;
    questions: { question: { id: number; type: string; hintBasis: unknown } }[];
  },
  studentId: number,
  courseId: number
): Promise<{ fragor: number[]; tidigare: Record<number, TidigareLedtrad[]> } | undefined> {
  const [student, inlamningar] = await Promise.all([
    prisma.student.findUnique({ where: { id: studentId }, select: { hintsEnabled: true } }),
    prisma.response.count({ where: { surveyId: survey.id, studentId } }),
  ]);
  if (!student?.hintsEnabled || inlamningar > 0) return undefined;

  const fragor = survey.questions
    .map((sq) => sq.question)
    .filter(
      (q) =>
        kanVisaLedtrad({
          survey: { ...survey, slappt: isReleased(survey) },
          sessionCourseId: courseId,
          hintsEnabled: true,
          fraga: { type: q.type, iSurvey: true, hintBasis: q.hintBasis },
        }).ok
    )
    .map((q) => q.id);
  if (fragor.length === 0) return undefined;

  const rader = await prisma.hintRequest.findMany({
    where: { surveyId: survey.id, studentId, questionId: { in: fragor } },
    select: { questionId: true, kind: true, rung: true, hint: true },
    orderBy: { createdAt: "asc" },
  });
  const tidigare: Record<number, TidigareLedtrad[]> = {};
  for (const r of rader) {
    (tidigare[r.questionId] ??= []).push({ kind: r.kind as LedtradKind, rung: r.rung, hint: r.hint });
  }
  return { fragor, tidigare };
}
