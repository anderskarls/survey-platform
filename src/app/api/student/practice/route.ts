import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { practiceAttemptSchema, practiceGradeSchema } from "@/lib/validators";
import { handleApiError } from "@/lib/api-helpers";
import { getStudentSession } from "@/lib/student-session";
import { resolveLinkedAccounts } from "@/lib/relearning-data";
import {
  AttemptRecord,
  buildQuestionState,
  previewIntervals,
} from "@/lib/relearning";
import { Rating } from "ts-fsrs";

/** Hela försökshistoriken för en fråga hos ett elevkonto (quiz + övning) */
async function loadQuestionHistory(
  questionId: number,
  studentId: number
): Promise<AttemptRecord[]> {
  const [answers, practice] = await Promise.all([
    prisma.answer.findMany({
      where: { questionId, response: { studentId } },
      select: { isCorrect: true, response: { select: { createdAt: true } } },
    }),
    prisma.practiceAttempt.findMany({
      where: { questionId, studentId },
      select: { isCorrect: true, grade: true, createdAt: true },
    }),
  ]);
  return [
    ...answers.map(
      (a): AttemptRecord => ({
        questionId,
        isCorrect: a.isCorrect,
        createdAt: a.response.createdAt,
        source: "answer",
      })
    ),
    ...practice.map(
      (p): AttemptRecord => ({
        questionId,
        isCorrect: p.isCorrect,
        grade: p.grade,
        createdAt: p.createdAt,
        source: "practice",
      })
    ),
  ];
}

// Fas 1: svara. Servern rättar, sparar försöket med defaultbetyg
// (rätt -> Bra, fel/osäker -> Om igen) och returnerar intervallförhands-
// visningar för självskattningsknapparna. Väljer eleven "Bra" behövs
// inget mer anrop; Svårt/Lätt justeras via PATCH.
export async function POST(request: NextRequest) {
  try {
    const session = await getStudentSession();
    if (!session) {
      return NextResponse.json(
        { error: "Du måste vara inloggad för att öva." },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { questionId, value } = practiceAttemptSchema.parse(body);

    const question = await prisma.question.findUnique({
      where: { id: questionId },
      include: { options: true, topic: { select: { courseId: true } } },
    });
    // Frågan måste höra till någon av elevens länkade kurser. Försöket
    // bokförs på kontot i frågans kurs så lärarstatistiken per kurs stämmer.
    const accounts = await resolveLinkedAccounts(session.studentId);
    const owner = question
      ? accounts.find((a) => a.courseId === question.topic.courseId)
      : undefined;
    if (!question || !owner) {
      return NextResponse.json(
        { error: "Frågan hittades inte" },
        { status: 404 }
      );
    }
    const ownerStudentId = owner.studentId;
    if (question.type !== "MULTIPLE_CHOICE") {
      return NextResponse.json(
        { error: "Bara flervalsfrågor kan övas" },
        { status: 400 }
      );
    }

    // Samma rättningslogik som /api/surveys/[id]/respond
    let isCorrect: boolean | null = null;
    const correctOption = question.options.find((o) => o.isCorrect);
    if (value !== "__UNSURE__") {
      isCorrect = correctOption ? value === correctOption.text : null;
    }

    // Förhandsvisa intervallen ur historiken FÖRE det nya försöket -
    // knapparna ska visa vad respektive betyg ger för just detta svar.
    const now = new Date();
    const history = await loadQuestionHistory(questionId, ownerStudentId);
    const intervals = previewIntervals(history, now);

    const appliedGrade = isCorrect === true ? Rating.Good : Rating.Again;
    const attempt = await prisma.practiceAttempt.create({
      data: {
        studentId: ownerStudentId,
        questionId,
        value,
        isCorrect,
        grade: appliedGrade,
      },
    });

    // Poststatus: historik + nya försöket i minnet (ingen andra DB-läsning)
    const state = buildQuestionState(
      [
        ...history,
        {
          questionId,
          isCorrect,
          grade: appliedGrade,
          createdAt: attempt.createdAt,
          source: "practice",
        },
      ],
      now
    );

    return NextResponse.json(
      {
        attemptId: attempt.id,
        isCorrect,
        correctAnswer: correctOption?.text ?? null,
        appliedGrade,
        nextDueDays: state?.daysUntilDue ?? null,
        mastered: state?.mastered ?? false,
        intervals: {
          hard: intervals.hard,
          good: intervals.good,
          easy: intervals.easy,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}

/** Självskattningsfönster: så länge får ett försök omgraderas */
const GRADE_WINDOW_MS = 10 * 60 * 1000;

// Fas 2: självskattning efter rätt svar. Uppdaterar bara grade-kolumnen
// på elevens eget, färska, korrekta försök. Idempotent inom fönstret.
export async function PATCH(request: NextRequest) {
  try {
    const session = await getStudentSession();
    if (!session) {
      return NextResponse.json(
        { error: "Du måste vara inloggad för att öva." },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { attemptId, grade } = practiceGradeSchema.parse(body);

    const attempt = await prisma.practiceAttempt.findUnique({
      where: { id: attemptId },
    });
    const accounts = await resolveLinkedAccounts(session.studentId);
    const owned =
      attempt !== null &&
      accounts.some((a) => a.studentId === attempt.studentId);
    if (!attempt || !owned) {
      return NextResponse.json(
        { error: "Försöket hittades inte" },
        { status: 404 }
      );
    }
    if (attempt.isCorrect !== true) {
      return NextResponse.json(
        { error: "Bara rätta svar kan självskattas" },
        { status: 400 }
      );
    }
    const now = new Date();
    if (now.getTime() - attempt.createdAt.getTime() > GRADE_WINDOW_MS) {
      return NextResponse.json(
        { error: "Självskattningsfönstret har gått ut" },
        { status: 400 }
      );
    }

    await prisma.practiceAttempt.update({
      where: { id: attempt.id },
      data: { grade },
    });

    const history = await loadQuestionHistory(
      attempt.questionId,
      attempt.studentId
    );
    const state = buildQuestionState(history, now);

    return NextResponse.json({
      nextDueDays: state?.daysUntilDue ?? null,
      mastered: state?.mastered ?? false,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
