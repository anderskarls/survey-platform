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
import {
  Subskill,
  exemplarsSchema,
  gradeSorting,
  sortingConfigSchema,
  sortingPlacementsSchema,
  type SortingResult,
} from "@/lib/formaga";
import { generateAiFeedback } from "@/lib/ai-feedback";
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

/** Fritextövning i förmågeträningen: fri text + delfärdighet = AI-feedback */
function isFormagaFritext(question: {
  type: string;
  subskill: string | null;
}): boolean {
  return question.type === "FREE_TEXT" && question.subskill !== null;
}

// Fas 1: svara. Servern rättar (flerval, sortering) eller tar emot fritext,
// sparar försöket med defaultbetyg och returnerar intervallförhandsvisningar
// för självskattningsknapparna. Exempelsvar och AI-feedback returneras
// EFTER försöket - aldrig före; det är hela poängen med timingen.
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

    const fritext = isFormagaFritext(question);
    if (
      question.type !== "MULTIPLE_CHOICE" &&
      question.type !== "SORTING" &&
      !fritext
    ) {
      return NextResponse.json(
        { error: "Den här frågetypen kan inte övas" },
        { status: 400 }
      );
    }

    // Rättning per typ
    let isCorrect: boolean | null = null;
    let correctAnswer: string | null = null;
    let sorting: SortingResult | null = null;

    if (question.type === "MULTIPLE_CHOICE") {
      // Samma rättningslogik som /api/surveys/[id]/respond
      const correctOption = question.options.find((o) => o.isCorrect);
      correctAnswer = correctOption?.text ?? null;
      if (value !== "__UNSURE__") {
        isCorrect = correctOption ? value === correctOption.text : null;
      }
    } else if (question.type === "SORTING") {
      const config = sortingConfigSchema.safeParse(question.config);
      if (!config.success) {
        return NextResponse.json(
          { error: "Frågan saknar giltig sorteringskonfiguration" },
          { status: 400 }
        );
      }
      let placements;
      try {
        placements = sortingPlacementsSchema.parse(JSON.parse(value));
      } catch {
        return NextResponse.json(
          { error: "Ogiltigt svarsformat för sorteringsfråga" },
          { status: 400 }
        );
      }
      sorting = gradeSorting(config.data, placements);
      isCorrect = sorting.allCorrect;
    }
    // Fritext: isCorrect förblir null - kvaliteten bedöms av eleven själv
    // mot exempelsvaren (fas 2), inte av servern.

    // Förhandsvisa intervallen ur historiken FÖRE det nya försöket -
    // knapparna ska visa vad respektive betyg ger för just detta svar.
    const now = new Date();
    const history = await loadQuestionHistory(questionId, ownerStudentId);
    const intervals = previewIntervals(history, now);

    // AI-feedback i realtid för fritextövningar. Ingen elevidentitet i
    // anropet. Misslyckas det fortsätter övningen utan feedback.
    let aiFeedback: string | null = null;
    if (fritext && value !== "__UNSURE__") {
      aiFeedback = await generateAiFeedback({
        questionText: question.text,
        subskill: question.subskill as Subskill,
        answer: value,
      });
    }

    // Defaultbetyg: rätt -> Bra, fel/osäker -> Om igen. Fritext -> Bra som
    // neutral default tills elevens självskattning justerar via PATCH.
    const appliedGrade =
      isCorrect === true || fritext ? Rating.Good : Rating.Again;
    const attempt = await prisma.practiceAttempt.create({
      data: {
        studentId: ownerStudentId,
        questionId,
        value,
        isCorrect,
        grade: appliedGrade,
        aiFeedback,
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

    // Exempelsvar skickas först nu - efter att elevens eget försök är sparat
    const exemplars = exemplarsSchema.safeParse(question.exemplars);

    return NextResponse.json(
      {
        attemptId: attempt.id,
        isCorrect,
        correctAnswer,
        sorting,
        aiFeedback,
        exemplars: exemplars.success ? exemplars.data : null,
        selfAssess: fritext,
        appliedGrade,
        nextDueDays: state?.daysUntilDue ?? null,
        mastered: state?.mastered ?? false,
        intervals: {
          again: intervals.again,
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

// Fas 2: självskattning. För rätta svar (flerval/sortering) justeras
// Svårt/Lätt; för fritextövningar sätter eleven hela betyget 1-4 själv
// efter jämförelse med exempelsvaren. Idempotent inom fönstret.
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
      include: { question: { select: { type: true, subskill: true } } },
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

    const fritext =
      attempt.isCorrect === null && isFormagaFritext(attempt.question);
    if (attempt.isCorrect !== true && !fritext) {
      return NextResponse.json(
        { error: "Bara rätta svar kan självskattas" },
        { status: 400 }
      );
    }
    if (attempt.isCorrect === true && grade === 1) {
      return NextResponse.json(
        { error: "Om igen kan inte väljas för rätta svar" },
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
