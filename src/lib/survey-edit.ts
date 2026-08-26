import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { UpdateSurveyInput } from "@/lib/validators";

export class SurveyEditError extends Error {
  status: number;
  payload: Record<string, unknown>;

  constructor(message: string, status: number, payload: Record<string, unknown> = {}) {
    super(message);
    this.name = "SurveyEditError";
    this.payload = payload;
    this.status = status;
  }
}

export const surveyEditInclude = {
  questions: {
    select: { questionId: true, order: true },
    orderBy: { order: "asc" },
  },
  _count: { select: { responses: true } },
} satisfies Prisma.SurveyInclude;

export type SurveyForEdit = Prisma.SurveyGetPayload<{
  include: typeof surveyEditInclude;
}>;

/**
 * Enkäten som den ser ut före ändringen, plus det som krävs för att räkna ut
 * konsekvenserna. `answeredByQuestion` räknar bara svar som lämnats i den här
 * enkäten - samma fråga kan ha svar i andra enkäter och i övningen, och de
 * berörs inte av att frågan lyfts ur enkäten.
 */
export interface PlannableSurvey {
  title: string;
  description: string;
  mode: string;
  lockMode: boolean;
  unitId: number | null;
  lesson: number | null;
  openAt: Date | null;
  questions: { questionId: number; order: number }[];
  responseCount: number;
  answeredByQuestion: Record<number, number>;
}

export interface SurveyEditImpact {
  /** Fältnamn som faktiskt fick ett nytt värde - tomt vid ren omsortering. */
  changedFields: string[];
  addedQuestions: number;
  removedQuestions: number;
  reordered: boolean;
  /** Svar som fanns kvar men försvinner ur enkätens resultat. */
  hiddenAnswers: number;
  /** Inlämningar som saknar svar på de nytillagda frågorna. */
  responsesMissingNew: number;
}

export interface SurveyUpdatePlan {
  /** Hela den nya ordnade uppsättningen, eller null när frågorna är orörda. */
  nextQuestionIds: number[] | null;
  added: number[];
  removed: number[];
  kept: number[];
  reordered: boolean;
  hiddenAnswers: number;
  responsesMissingNew: number;
  changedFields: string[];
  /** Icke-null när ändringen döljer svar som eleverna redan lämnat. */
  confirmationMessage: string | null;
}

function sameDate(a: Date | null, b: Date | null): boolean {
  if (a === null || b === null) return a === b;
  return a.getTime() === b.getTime();
}

function plural(n: number, ental: string, flertal: string): string {
  return `${n} ${n === 1 ? ental : flertal}`;
}

/**
 * Räknar ut vad en ändring gör med enkäten och med elevernas inlämningar, utan
 * att röra databasen. Bruten ur applySurveyUpdate för att gå att testa.
 *
 * Den enda ändringen som når elevernas data är att lyfta ur en fråga. Svaren
 * hänger på Response och Question, inte på SurveyQuestion, så de raderas inte -
 * men resultatvyn går igenom enkätens frågor, och det som inte står där syns
 * inte. Läggs frågan tillbaka kommer svaren tillbaka med den. Därför bekräftelse
 * i stället för spärr, och därför ingen radering.
 */
export function planSurveyUpdate(
  existing: PlannableSurvey,
  input: UpdateSurveyInput
): SurveyUpdatePlan {
  const changedFields: string[] = [];
  if (input.title !== undefined && input.title !== existing.title)
    changedFields.push("titel");
  if (input.description !== undefined && input.description !== existing.description)
    changedFields.push("beskrivning");
  if (input.mode !== undefined && input.mode !== existing.mode)
    changedFields.push("läge");
  if (input.lockMode !== undefined && input.lockMode !== existing.lockMode)
    changedFields.push("låst läge");
  if (input.unitId !== undefined && input.unitId !== existing.unitId)
    changedFields.push("moment");
  if (input.lesson !== undefined && input.lesson !== existing.lesson)
    changedFields.push("lektion");
  if (input.openAt !== undefined) {
    const next = input.openAt === null ? null : new Date(input.openAt);
    if (!sameDate(next, existing.openAt)) changedFields.push("öppnar");
  }

  const currentIds = existing.questions.map((q) => q.questionId);
  const next = input.questionIds;

  if (next === undefined) {
    return {
      nextQuestionIds: null,
      added: [],
      removed: [],
      kept: currentIds,
      reordered: false,
      hiddenAnswers: 0,
      responsesMissingNew: 0,
      changedFields,
      confirmationMessage: null,
    };
  }

  if (new Set(next).size !== next.length) {
    throw new SurveyEditError("Samma fråga förekommer flera gånger i enkäten", 400);
  }

  const currentSet = new Set(currentIds);
  const nextSet = new Set(next);
  const added = next.filter((id) => !currentSet.has(id));
  const removed = currentIds.filter((id) => !nextSet.has(id));
  const kept = next.filter((id) => currentSet.has(id));
  const reordered =
    added.length === 0 &&
    removed.length === 0 &&
    next.some((id, i) => id !== currentIds[i]);

  const hiddenAnswers = removed.reduce(
    (sum, id) => sum + (existing.answeredByQuestion[id] ?? 0),
    0
  );
  const responsesMissingNew = added.length > 0 ? existing.responseCount : 0;

  let confirmationMessage: string | null = null;
  if (hiddenAnswers > 0) {
    confirmationMessage =
      `Du lyfter ur ${plural(removed.length, "fråga", "frågor")} som ` +
      `${plural(hiddenAnswers, "elevsvar", "elevsvar")} hänger på. Svaren raderas inte, ` +
      `men de försvinner ur enkätens resultat och export. Läggs frågan tillbaka kommer de tillbaka med den.`;
  }

  return {
    nextQuestionIds: next,
    added,
    removed,
    kept,
    reordered,
    hiddenAnswers,
    responsesMissingNew,
    changedFields,
    confirmationMessage,
  };
}

/** Antal lagrade svar per fråga inom en enskild enkäts inlämningar. */
export async function countAnswersInSurvey(
  surveyId: number,
  questionIds: number[]
): Promise<Record<number, number>> {
  if (questionIds.length === 0) return {};
  const rows = await prisma.answer.groupBy({
    by: ["questionId"],
    where: { questionId: { in: questionIds }, response: { surveyId } },
    _count: { _all: true },
  });
  return Object.fromEntries(rows.map((r) => [r.questionId, r._count._all]));
}

/** Läser enkäten och det som behövs för att planera en ändring av den. */
export async function loadSurveyForEdit(
  surveyId: number
): Promise<{ survey: SurveyForEdit; plannable: PlannableSurvey } | null> {
  const survey = await prisma.survey.findUnique({
    where: { id: surveyId },
    include: surveyEditInclude,
  });
  if (!survey) return null;

  const answeredByQuestion = await countAnswersInSurvey(
    survey.id,
    survey.questions.map((q) => q.questionId)
  );

  return {
    survey,
    plannable: {
      title: survey.title,
      description: survey.description,
      mode: survey.mode,
      lockMode: survey.lockMode,
      unitId: survey.unitId,
      lesson: survey.lesson,
      openAt: survey.openAt,
      questions: survey.questions,
      responseCount: survey._count.responses,
      answeredByQuestion,
    },
  };
}

/**
 * Kursbundet ägarskap. Frågor, moment och elevsvar hör alla till en kurs, och
 * en enkät som blandade in frågor ur en annan kurs vore en väg att läsa dem
 * förbi kursbehörigheten.
 */
export async function assertQuestionsInCourse(
  questionIds: number[],
  courseId: number
): Promise<void> {
  const owned = await prisma.question.findMany({
    where: { id: { in: questionIds }, topic: { courseId } },
    select: { id: true },
  });
  if (owned.length !== new Set(questionIds).size) {
    const ownedSet = new Set(owned.map((q) => q.id));
    throw new SurveyEditError("Vissa frågor tillhör inte denna kurs", 400, {
      invalidIds: questionIds.filter((id) => !ownedSet.has(id)),
    });
  }
}

export async function assertUnitInCourse(
  unitId: number,
  courseId: number
): Promise<void> {
  const unit = await prisma.unit.findFirst({
    where: { id: unitId, courseId },
    select: { id: true },
  });
  if (!unit) {
    throw new SurveyEditError("Momentet tillhör inte denna kurs", 400);
  }
}

/**
 * Sparar ändringen. Frågeuppsättningen skrivs som en helhet: det som inte står
 * i `questionIds` lyfts ur, det som tillkommit skapas, och ordningen är
 * positionen i listan.
 */
export async function applySurveyUpdate(
  existing: SurveyForEdit,
  plannable: PlannableSurvey,
  input: UpdateSurveyInput
): Promise<{ survey: SurveyForEdit; impact: SurveyEditImpact }> {
  const plan = planSurveyUpdate(plannable, input);

  if (plan.confirmationMessage && !input.confirmRemoval) {
    throw new SurveyEditError(plan.confirmationMessage, 409, {
      requiresConfirmation: true,
      hiddenAnswers: plan.hiddenAnswers,
      removedQuestions: plan.removed.length,
    });
  }

  const surveyId = existing.id;

  const survey = await prisma.$transaction(async (tx) => {
    if (plan.nextQuestionIds) {
      if (plan.removed.length > 0) {
        await tx.surveyQuestion.deleteMany({
          where: { surveyId, questionId: { in: plan.removed } },
        });
      }

      // Ordningen skrivs om för alla behållna frågor, inte bara de som flyttat:
      // en borttagen fråga mitt i lämnar annars ett hål i numreringen.
      const currentOrder = new Map(
        existing.questions.map((q) => [q.questionId, q.order])
      );
      for (const [index, questionId] of plan.nextQuestionIds.entries()) {
        if (!currentOrder.has(questionId)) continue;
        if (currentOrder.get(questionId) === index) continue;
        await tx.surveyQuestion.update({
          where: { surveyId_questionId: { surveyId, questionId } },
          data: { order: index },
        });
      }

      if (plan.added.length > 0) {
        await tx.surveyQuestion.createMany({
          data: plan.added.map((questionId) => ({
            surveyId,
            questionId,
            order: plan.nextQuestionIds!.indexOf(questionId),
          })),
        });
      }
    }

    const data: Prisma.SurveyUpdateInput = {};
    if (input.title !== undefined) data.title = input.title;
    if (input.description !== undefined) data.description = input.description;
    if (input.mode !== undefined) data.mode = input.mode;
    if (input.lockMode !== undefined) data.lockMode = input.lockMode;
    if (input.lesson !== undefined) data.lesson = input.lesson;
    if (input.openAt !== undefined)
      data.openAt = input.openAt === null ? null : new Date(input.openAt);
    if (input.unitId !== undefined)
      data.unit = input.unitId === null ? { disconnect: true } : { connect: { id: input.unitId } };

    return tx.survey.update({
      where: { id: surveyId },
      data,
      include: surveyEditInclude,
    });
  }, { timeout: 20_000 });

  return {
    survey,
    impact: {
      changedFields: plan.changedFields,
      addedQuestions: plan.added.length,
      removedQuestions: plan.removed.length,
      reordered: plan.reordered,
      hiddenAnswers: plan.hiddenAnswers,
      responsesMissingNew: plan.responsesMissingNew,
    },
  };
}
