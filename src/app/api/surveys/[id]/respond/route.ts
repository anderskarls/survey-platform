import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { respondSchema } from "@/lib/validators";
import { handleApiError } from "@/lib/api-helpers";
import { getStudentSession } from "@/lib/student-session";
import {
  flashcardGrade,
  flashcardIsCorrect,
  isFlashcardValue,
} from "@/lib/flashcard";
import { gradeCloze, parseClozeConfig, type ClozeVerdict } from "@/lib/cloze";
import { formatRelease, isReleased } from "@/lib/survey-release";

/**
 * Så länge räknas ett identiskt svarspaket som samma inlämning.
 * Täcker dubbelklick och elevens retry efter en nätverkstimeout - båda
 * skapade förr dubbla Response-rader som dubbelräknades i momentrapporter
 * och i FSRS-replayen. Avsiktliga omkörningar ligger alltid långt utanför
 * fönstret (och har i praktiken andra svar), så de påverkas inte.
 */
const IDEMPOTENCY_WINDOW_MS = 2 * 60 * 1000;

/** Samma frågor med samma värden = samma inlämning (ordning spelar ingen roll) */
function sameAnswers(
  saved: { questionId: number; value: string }[],
  incoming: { questionId: number; value: string }[]
): boolean {
  if (saved.length !== incoming.length) return false;
  const savedMap = new Map(saved.map((a) => [a.questionId, a.value]));
  return incoming.every((a) => savedMap.get(a.questionId) === a.value);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const surveyId = Number(id);
    if (isNaN(surveyId)) {
      return NextResponse.json({ error: "Ogiltigt enkät-ID" }, { status: 400 });
    }

    const session = await getStudentSession();
    if (!session) {
      return NextResponse.json(
        { error: "Du måste vara inloggad för att svara." },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { answers, lockModeViolations } = respondSchema.parse(body);

    const survey = await prisma.survey.findUnique({
      where: { id: surveyId },
      include: {
        course: true,
        questions: {
          include: { question: { include: { options: true } } },
        },
      },
    });
    if (!survey) {
      return NextResponse.json(
        { error: "Enkät hittades inte" },
        { status: 404 }
      );
    }

    // Verify student belongs to this course
    if (survey.courseId !== session.courseId) {
      return NextResponse.json(
        { error: "Du har inte tillgång till denna enkät." },
        { status: 403 }
      );
    }

    // Här hålls veckoordningen. Elevvyerna döljer det osläppta, men ett
    // gammalt formulär i en flik eller en delad länk går förbi dem - inte
    // förbi den här kontrollen.
    if (survey.openAt && !isReleased(survey)) {
      return NextResponse.json(
        { error: `Enkäten öppnar ${formatRelease(survey.openAt)}.` },
        { status: 403 }
      );
    }

    // Build a questionId → SurveyQuestion lookup map (O(1) access)
    const questionMap = new Map(
      survey.questions.map((sq) => [sq.questionId, sq])
    );

    // Validate that every answer references a question in this survey AND
    // that there are no duplicate answers for the same question.
    const seen = new Set<number>();
    for (const a of answers) {
      if (!questionMap.has(a.questionId)) {
        return NextResponse.json(
          { error: "Vissa svar refererar till frågor som inte ingår i enkäten" },
          { status: 400 }
        );
      }
      if (seen.has(a.questionId)) {
        return NextResponse.json(
          { error: "Samma fråga besvaras flera gånger" },
          { status: 400 }
        );
      }
      seen.add(a.questionId);
    }

    // Build answer data, computing isCorrect for multiple choice questions in all modes
    const isQuiz = survey.mode === "QUIZ";
    // Luckfrågornas domar sparas vid sidan av: nära-miss är återkoppling till
    // eleven, inte ett resultat, och har därför ingen kolumn i Answer.
    const clozeVerdicts = new Map<number, ClozeVerdict>();
    const answerData = answers.map((a) => {
      let isCorrect: boolean | null = null;
      let grade: number | null = null;
      const sq = questionMap.get(a.questionId);
      if (sq && sq.question.type === "CLOZE") {
        const config = parseClozeConfig(sq.question.config);
        if (config) {
          const verdict = gradeCloze(a.value, config);
          clozeVerdicts.set(a.questionId, verdict);
          isCorrect = verdict.isCorrect;
        }
        // Saknas configen är frågan orättbar. Den lämnas orättad (null)
        // i stället för att räknas som fel - felet är lärarens, inte elevens.
      } else if (sq && sq.question.type === "MULTIPLE_CHOICE") {
        if (isFlashcardValue(a.value)) {
          // Flashcardläge: svaret ÄR elevens självskattning. Betyget bär
          // nyansen till FSRS, isCorrect håller poäng och statistik igång.
          isCorrect = flashcardIsCorrect(a.value);
          grade = flashcardGrade(a.value);
        } else if (a.value === "__UNSURE__") {
          isCorrect = null; // Metacognitive "I'm not sure" - neither correct nor incorrect
        } else {
          const correctOption = sq.question.options.find((o) => o.isCorrect);
          isCorrect = correctOption ? a.value === correctOption.text : null;
        }
      }
      return { questionId: a.questionId, value: a.value, isCorrect, grade };
    });

    // Idempotensskydd: har eleven nyss lämnat in exakt samma svar på samma
    // enkät, returnera den befintliga inlämningen i stället för att skapa en
    // ny. Utan detta blev ett dubbelklick - eller elevens naturliga retry
    // efter ett timeout-fel - två inlämningar i statistiken.
    const recent = await prisma.response.findFirst({
      where: {
        surveyId,
        studentId: session.studentId,
        createdAt: { gte: new Date(Date.now() - IDEMPOTENCY_WINDOW_MS) },
      },
      orderBy: { createdAt: "desc" },
      include: { answers: { select: { questionId: true, value: true } } },
    });
    const duplicate = recent !== null && sameAnswers(recent.answers, answerData);

    const response = duplicate
      ? recent
      : await prisma.response.create({
          data: {
            surveyId,
            studentId: session.studentId,
            lockModeViolations: survey.lockMode ? lockModeViolations ?? 0 : 0,
            answers: { create: answerData },
          },
        });

    // Delete any draft for this student+survey
    await prisma.draftResponse.deleteMany({
      where: { surveyId, studentId: session.studentId },
    });

    // Calculate score if there are any MC questions
    let score = null;
    const correct = answerData.filter((a) => a.isCorrect === true).length;
    const total = answerData.filter((a) => a.isCorrect !== null).length;
    if (total > 0) {
      score = {
        correct,
        total,
        percentage: Math.round((correct / total) * 100),
      };
    }

    // Fetch saved answers to get their IDs for the immediate-feedback payload
    const savedAnswers = await prisma.answer.findMany({
      where: { responseId: response.id },
      select: { id: true, questionId: true },
    });
    const answerIdMap = new Map(
      savedAnswers.map((a) => [a.questionId, a.id])
    );

    // Immediate feedback results (same shape for quiz and survey, client decides rendering)
    const results = answerData.map((a) => {
      const sq = questionMap.get(a.questionId);
      const correctOption = sq?.question.options.find((o) => o.isCorrect);
      const cloze = clozeVerdicts.get(a.questionId);
      return {
        answerId: answerIdMap.get(a.questionId) ?? null,
        questionId: a.questionId,
        questionText: sq?.question.text,
        questionType: sq?.question.type,
        yourAnswer: a.value,
        isCorrect: a.isCorrect,
        // Luckfrågans facit kommer ur config, inte ur alternativen.
        correctAnswer: cloze ? cloze.answer : correctOption?.text || null,
        // Fel svar som bara var några bokstäver bort - eleven kan ordet men
        // inte stavningen, och det är en annan sak att säga till hen.
        nearMiss: cloze?.nearMiss ?? false,
      };
    });

    return NextResponse.json(
      {
        success: true,
        responseId: response.id,
        duplicate,
        score,
        quizResults: isQuiz ? results : null,
        surveyResults: !isQuiz ? results : null,
      },
      { status: duplicate ? 200 : 201 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
