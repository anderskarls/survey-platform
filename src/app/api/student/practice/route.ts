import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { practiceAttemptSchema, practiceGradeSchema } from "@/lib/validators";
import { handleApiError } from "@/lib/api-helpers";
import { getStudentSession } from "@/lib/student-session";
import {
  AttemptRecord,
  buildQuestionState,
  hasAttemptOnDay,
  previewIntervals,
} from "@/lib/relearning";
import {
  exemplarsSchema,
  gradeSorting,
  sortingConfigSchema,
  sortingPlacementsSchema,
  type SortingResult,
} from "@/lib/formaga";
import { Rating } from "ts-fsrs";
import { gradeCloze, parseClozeConfig } from "@/lib/cloze";
import { FLASHCARD_RATINGS, FLASHCARD_REVEAL, isCardType } from "@/lib/flashcard";

/** Hela försökshistoriken för en fråga hos ett elevkonto (quiz + övning) */
async function loadQuestionHistory(
  questionId: number,
  studentId: number
): Promise<AttemptRecord[]> {
  const [answers, practice] = await Promise.all([
    prisma.answer.findMany({
      where: { questionId, response: { studentId } },
      select: {
        isCorrect: true,
        grade: true,
        response: { select: { createdAt: true } },
      },
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
        grade: a.grade ?? undefined,
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
// för självskattningsknapparna. Exempelsvaren returneras EFTER försöket -
// aldrig före; det är hela poängen med timingen. Feedback på fritextsvar
// genereras asynkront via lärarens CLI-flöde (/api/practice/feedback),
// aldrig av servern själv.
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
    // Frågan måste höra till kursen kontot är inloggat i. Övningen är
    // kursavgränsad (se loadRelearningData) - vill eleven öva en annan kurs
    // byter hen kurs i sidomenyn och övar med det kontot.
    if (!question || question.topic.courseId !== session.courseId) {
      return NextResponse.json(
        { error: "Frågan hittades inte" },
        { status: 404 }
      );
    }
    const ownerStudentId = session.studentId;

    const fritext = isFormagaFritext(question);
    const flashcardReveal =
      isCardType(question.type) && value === FLASHCARD_REVEAL;
    if (
      !isCardType(question.type) &&
      question.type !== "SORTING" &&
      question.type !== "CLOZE" &&
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
    let nearMiss = false;

    if (question.type === "MULTIPLE_CHOICE") {
      // Samma rättningslogik som /api/surveys/[id]/respond
      const correctOption = question.options.find((o) => o.isCorrect);
      correctAnswer = correctOption?.text ?? null;
      // Flashcard: eleven vände kortet i stället för att välja alternativ.
      // Servern rättar ingenting - baksidan skickas tillbaka och eleven
      // skattar sig själv i fas 2.
      if (value !== "__UNSURE__" && !flashcardReveal) {
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
    } else if (question.type === "CLOZE_CARD") {
      const config = parseClozeConfig(question.config);
      if (!config) {
        return NextResponse.json(
          { error: "Kortet saknar giltig baksida" },
          { status: 400 }
        );
      }
      if (!flashcardReveal) {
        return NextResponse.json(
          { error: "Luckmeningskortet besvaras genom att vändas" },
          { status: 400 }
        );
      }
      // Baksidan lämnar servern först nu, efter att försöket är sparat -
      // samma regel som för sorteringsfacit och luckfrågornas facit.
      // isCorrect förblir null: eleven skattar sig själv i fas 2.
      correctAnswer = config.answer;
    } else if (question.type === "CLOZE") {
      const config = parseClozeConfig(question.config);
      if (!config) {
        return NextResponse.json(
          { error: "Frågan saknar giltigt facit" },
          { status: 400 }
        );
      }
      const verdict = gradeCloze(value, config);
      isCorrect = verdict.isCorrect;
      nearMiss = verdict.nearMiss;
      // Facit skickas tillbaka först nu, efter elevens försök.
      correctAnswer = verdict.answer;
    }
    // Fritext: isCorrect förblir null - kvaliteten bedöms av eleven själv
    // mot exempelsvaren (fas 2), inte av servern.

    // Förhandsvisa intervallen ur historiken FÖRE det nya försöket -
    // knapparna ska visa vad respektive betyg ger för just detta svar.
    const now = new Date();
    const history = await loadQuestionHistory(questionId, ownerStudentId);
    const intervals = previewIntervals(history, now);

    // Bara dagens första försök styr schemat (se firstAttemptPerDay i
    // relearning.ts). Har frågan redan besvarats idag - i ett skarpt quiz
    // eller tidigare i passet - är det här en omkörning: den sparas och
    // lägger tillbaka frågan i kön, men flyttar inte fram nästa repetition.
    // Klienten döljer intervallöftena när flaggan är false.
    const schedulesToday = !hasAttemptOnDay(history, now);

    // Defaultbetyg: rätt -> Bra, fel/osäker -> Om igen. Fritext -> Bra som
    // neutral default tills elevens självskattning justerar via PATCH.
    const appliedGrade =
      isCorrect === true || fritext || flashcardReveal
        ? Rating.Good
        : Rating.Again;
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

    // Exempelsvar skickas först nu - efter att elevens eget försök är sparat
    const exemplars = exemplarsSchema.safeParse(question.exemplars);

    return NextResponse.json(
      {
        attemptId: attempt.id,
        isCorrect,
        correctAnswer,
        nearMiss,
        sorting,
        exemplars: exemplars.success ? exemplars.data : null,
        selfAssess: fritext || flashcardReveal,
        appliedGrade,
        schedulesToday,
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
      // value behövs för att känna igen vända kort nedan
    });
    // Försöket bokförs alltid på det inloggade kontot, så självskattningen
    // gäller bara egna försök i den kursen.
    if (!attempt || attempt.studentId !== session.studentId) {
      return NextResponse.json(
        { error: "Försöket hittades inte" },
        { status: 404 }
      );
    }

    const fritext =
      attempt.isCorrect === null && isFormagaFritext(attempt.question);
    // Ett vänt kort är orättat (isCorrect null) - hela betyget 1-4 är elevens,
    // inklusive Om igen, precis som i Anki.
    const flashcard =
      attempt.isCorrect === null && attempt.value === FLASHCARD_REVEAL;
    if (attempt.isCorrect !== true && !fritext && !flashcard) {
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
      data: flashcard
        ? {
            grade,
            // Markören ersätts med den faktiska skattningen, så försöket är
            // läsbart i efterhand i stället för att bara stå som "vänt".
            value: FLASHCARD_RATINGS.find((r) => r.grade === grade)!.value,
            isCorrect: grade > 1,
          }
        : { grade },
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
