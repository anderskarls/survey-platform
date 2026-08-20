import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { UpdateQuestionInput } from "@/lib/validators";
import { hasGap, parseClozeConfig } from "@/lib/cloze";

// Metakognitiva "Jag är inte säker" - varken rätt eller fel, se respond-routen.
const UNSURE = "__UNSURE__";

// Två alternativ kan byta text med varandra i samma sparning. En rak följd av
// updateMany skulle då slå ihop dem, så textbytena går via en unik markör.
// (Postgres tillåter inte nolltecken i text, därav en vanlig strängmarkör.)
const TEMP_PREFIX = "__BYTER__:";

export class QuestionEditError extends Error {
  status: number;
  payload: Record<string, unknown>;

  constructor(message: string, status: number, payload: Record<string, unknown> = {}) {
    super(message);
    this.name = "QuestionEditError";
    this.status = status;
    this.payload = payload;
  }
}

export const questionListInclude = {
  options: { orderBy: { id: "asc" } },
  topic: true,
  _count: { select: { answers: true, practiceAttempts: true } },
} satisfies Prisma.QuestionInclude;

export type QuestionForEdit = Prisma.QuestionGetPayload<{
  include: typeof questionListInclude;
}>;

export interface QuestionEditImpact {
  renamedOptions: number;
  removedOptions: number;
  addedOptions: number;
  migratedAnswers: number;
  migratedAttempts: number;
  orphanedAnswers: number;
  regradedAnswers: number;
  regradedAttempts: number;
}

/**
 * Rättningslogiken från /api/surveys/[id]/respond och /api/student/practice,
 * tillämpad i efterhand på redan lagrade svar.
 */
export function desiredCorrect(
  value: string,
  correctText: string | null
): boolean | null {
  if (value === UNSURE) return null;
  if (correctText === null) return null;
  return value === correctText;
}

function countPhrase(answers: number, attempts: number): string {
  const parts: string[] = [];
  if (answers > 0) parts.push(`${answers} elevsvar`);
  if (attempts > 0) parts.push(`${attempts} övningsförsök`);
  return parts.join(" och ");
}

/**
 * Uppdaterar en fråga och håller elevernas historik i takt med ändringen.
 *
 * Answer.value och PracticeAttempt.value lagrar alternativets TEXT, inte ett
 * option-id, och Answer.isCorrect fryses vid inlämning. Utan migrering skulle
 * en rättad alternativtext dyka upp som en spökstapel i resultatdiagrammet och
 * ett flyttat facit visa gamla svar som fel bredvid ett facit eleven aldrig såg.
 *
 * Repetitionsschemat (PracticeAttempt.grade) räknas medvetet INTE om - att
 * skriva om FSRS-historiken i efterhand ställer till mer än ett kvarvarande
 * betyg gör.
 */
export interface PlannableQuestion {
  text: string;
  type: string;
  config?: unknown;
  options: { id: number; text: string; isCorrect: boolean }[];
  _count: { answers: number; practiceAttempts: number };
}

export interface QuestionUpdatePlan {
  nextType: string;
  isMc: boolean;
  typeChanged: boolean;
  incoming: NonNullable<UpdateQuestionInput["options"]> | undefined;
  removed: { id: number; text: string; isCorrect: boolean }[];
  renames: { id: number; from: string; to: string }[];
  facitChanged: boolean;
  regradeNeeded: boolean;
  /** Icke-null när ändringen skriver om hur tidigare svar bedöms. */
  confirmationMessage: string | null;
}

/**
 * Räknar ut vad en ändring gör med frågan och med elevernas historik, utan att
 * röra databasen. Bruten ur applyQuestionUpdate för att gå att testa.
 */
export function planQuestionUpdate(
  existing: PlannableQuestion,
  input: UpdateQuestionInput
): QuestionUpdatePlan {
  const nextType = input.type ?? existing.type;
  const isMc = nextType === "MULTIPLE_CHOICE";
  const typeChanged = nextType !== existing.type;
  const existingById = new Map(existing.options.map((o) => [o.id, o]));

  const incoming = isMc ? input.options : undefined;

  if (incoming) {
    for (const o of incoming) {
      if (o.id !== undefined && !existingById.has(o.id)) {
        throw new QuestionEditError("Ett av alternativen tillhör inte frågan", 400);
      }
    }
    if (incoming.length < 2) {
      throw new QuestionEditError(
        "En flervalsfråga behöver minst två alternativ",
        400
      );
    }
  } else if (isMc && typeChanged) {
    throw new QuestionEditError(
      "Ange alternativen när frågan görs om till flervalsfråga",
      400
    );
  }

  if (nextType === "SORTING" && !input.config && !existing.config) {
    throw new QuestionEditError(
      "Sorteringsfrågor kräver config med categories och items",
      400
    );
  }

  if (nextType === "CLOZE") {
    // Facit ligger i config. Byts typen till CLOZE utan att en config skickas
    // med finns inget att rätta mot, och frågan hade tyst blivit orättad.
    if (!parseClozeConfig(input.config ?? existing.config)) {
      throw new QuestionEditError(
        "Luckfrågor kräver config med facit (answer)",
        400
      );
    }
    if (!hasGap(input.text ?? existing.text)) {
      throw new QuestionEditError(
        "Luckfrågans mening måste innehålla markören ___ där ordet ska stå",
        400
      );
    }
  }

  const removed = incoming
    ? existing.options.filter((o) => !incoming.some((i) => i.id === o.id))
    : [];
  const renames = incoming
    ? incoming
        .filter((i) => i.id !== undefined && existingById.get(i.id)!.text !== i.text)
        .map((i) => ({
          id: i.id!,
          from: existingById.get(i.id!)!.text,
          to: i.text,
        }))
    : [];
  const facitChanged = incoming
    ? incoming.some(
        (i) =>
          i.id !== undefined && existingById.get(i.id)!.isCorrect !== i.isCorrect
      ) ||
      incoming.some((i) => i.id === undefined && i.isCorrect) ||
      removed.some((o) => o.isCorrect)
    : false;

  // Rena textbyten migreras förlustfritt och behöver ingen bekräftelse. Ett
  // flyttat facit, ett borttaget alternativ eller ett typbyte skriver däremot om
  // hur tidigare svar bedöms - det ska läraren se antalet på först.
  const destructive = typeChanged || facitChanged || removed.length > 0;
  const hasHistory = existing._count.answers + existing._count.practiceAttempts > 0;

  let confirmationMessage: string | null = null;
  if (destructive && hasHistory) {
    const consequences: string[] = [];
    if (typeChanged) consequences.push("byter frågetyp");
    if (facitChanged) consequences.push("flyttar rätt svar");
    if (removed.length > 0)
      consequences.push(
        `tar bort ${
          removed.length === 1 ? "ett alternativ" : `${removed.length} alternativ`
        }`
      );
    confirmationMessage = `Det finns ${countPhrase(
      existing._count.answers,
      existing._count.practiceAttempts
    )} på frågan. Ändringen ${consequences.join(
      " och "
    )}, vilket rättar om tidigare svar. Repetitionsschemat i övningen påverkas inte.`;
  }

  return {
    nextType,
    isMc,
    typeChanged,
    incoming,
    removed,
    renames,
    facitChanged,
    regradeNeeded:
      typeChanged || facitChanged || renames.length > 0 || removed.length > 0,
    confirmationMessage,
  };
}

export async function applyQuestionUpdate(
  existing: QuestionForEdit,
  input: UpdateQuestionInput
): Promise<{ question: QuestionForEdit; impact: QuestionEditImpact }> {
  const plan = planQuestionUpdate(existing, input);
  const { isMc, incoming, removed, renames } = plan;
  const existingById = new Map(existing.options.map((o) => [o.id, o]));

  if (plan.confirmationMessage && !input.confirmRegrade) {
    throw new QuestionEditError(plan.confirmationMessage, 409, {
      requiresConfirmation: true,
      answers: existing._count.answers,
      practiceAttempts: existing._count.practiceAttempts,
    });
  }

  const impact: QuestionEditImpact = {
    renamedOptions: renames.length,
    removedOptions: removed.length,
    addedOptions: incoming ? incoming.filter((i) => i.id === undefined).length : 0,
    migratedAnswers: 0,
    migratedAttempts: 0,
    orphanedAnswers: 0,
    regradedAnswers: 0,
    regradedAttempts: 0,
  };

  const questionId = existing.id;

  // Migreringen är många små satser i följd; över Neon räcker inte
  // standardtimeouten på 5 s när alla alternativ byter text samtidigt.
  const question = await prisma.$transaction(async (tx) => {
    // 1. Textbyten: flytta först elevernas lagrade värden till en unik markör,
    //    sedan till den nya texten. Två pass så att textbyten kan korsa varandra.
    if (renames.length > 0) {
      for (const r of renames) {
        const tmp = `${TEMP_PREFIX}${r.id}`;
        impact.migratedAnswers += (
          await tx.answer.updateMany({
            where: { questionId, value: r.from },
            data: { value: tmp },
          })
        ).count;
        impact.migratedAttempts += (
          await tx.practiceAttempt.updateMany({
            where: { questionId, value: r.from },
            data: { value: tmp },
          })
        ).count;
      }
      for (const r of renames) {
        const tmp = `${TEMP_PREFIX}${r.id}`;
        await tx.answer.updateMany({
          where: { questionId, value: tmp },
          data: { value: r.to },
        });
        await tx.practiceAttempt.updateMany({
          where: { questionId, value: tmp },
          data: { value: r.to },
        });
      }
    }

    // 2. Borttagna alternativ. Svaren finns kvar som fristående strängar -
    //    de raderas inte, men de matchar inget alternativ längre.
    if (removed.length > 0) {
      impact.orphanedAnswers = await tx.answer.count({
        where: { questionId, value: { in: removed.map((o) => o.text) } },
      });
      await tx.questionOption.deleteMany({
        where: { id: { in: removed.map((o) => o.id) } },
      });
    }

    // 3. Behållna alternativ: text och facitflagga.
    if (incoming) {
      for (const i of incoming) {
        if (i.id === undefined) continue;
        const prev = existingById.get(i.id)!;
        if (prev.text === i.text && prev.isCorrect === i.isCorrect) continue;
        await tx.questionOption.update({
          where: { id: i.id },
          data: { text: i.text, isCorrect: i.isCorrect },
        });
      }
      const added = incoming.filter((i) => i.id === undefined);
      if (added.length > 0) {
        await tx.questionOption.createMany({
          data: added.map((i) => ({
            questionId,
            text: i.text,
            isCorrect: i.isCorrect,
          })),
        });
      }
    }

    // 4. Frågan går från flerval till en textbaserad typ: alternativen faller
    //    bort och tidigare rättning är inte längre meningsfull.
    if (!isMc && existing.type === "MULTIPLE_CHOICE") {
      await tx.questionOption.deleteMany({ where: { questionId } });
    }

    // 5. Rätta om lagrade svar mot det nya facit.
    if (plan.regradeNeeded) {
      const correctText = isMc
        ? (
            await tx.questionOption.findFirst({
              where: { questionId, isCorrect: true },
              select: { text: true },
            })
          )?.text ?? null
        : null;

      const [answers, attempts] = await Promise.all([
        tx.answer.findMany({
          where: { questionId },
          select: { value: true, isCorrect: true },
        }),
        tx.practiceAttempt.findMany({
          where: { questionId },
          select: { value: true, isCorrect: true },
        }),
      ]);

      impact.regradedAnswers = answers.filter(
        (a) => desiredCorrect(a.value, correctText) !== a.isCorrect
      ).length;
      impact.regradedAttempts = attempts.filter(
        (a) => desiredCorrect(a.value, correctText) !== a.isCorrect
      ).length;

      if (correctText === null) {
        await tx.answer.updateMany({
          where: { questionId },
          data: { isCorrect: null },
        });
        await tx.practiceAttempt.updateMany({
          where: { questionId },
          data: { isCorrect: null },
        });
      } else {
        const correct = { questionId, value: correctText };
        const wrong = { questionId, value: { notIn: [correctText, UNSURE] } };
        const unsure = { questionId, value: UNSURE };
        await tx.answer.updateMany({ where: correct, data: { isCorrect: true } });
        await tx.answer.updateMany({ where: wrong, data: { isCorrect: false } });
        await tx.answer.updateMany({ where: unsure, data: { isCorrect: null } });
        await tx.practiceAttempt.updateMany({ where: correct, data: { isCorrect: true } });
        await tx.practiceAttempt.updateMany({ where: wrong, data: { isCorrect: false } });
        await tx.practiceAttempt.updateMany({ where: unsure, data: { isCorrect: null } });
      }
    }

    // 6. Själva frågan.
    const data: Prisma.QuestionUpdateInput = {};
    if (input.text !== undefined) data.text = input.text;
    if (input.type !== undefined) data.type = input.type;
    if (input.topicId !== undefined) data.topic = { connect: { id: input.topicId } };
    if (input.subskill !== undefined) data.subskill = input.subskill;
    if (input.config !== undefined) data.config = input.config as Prisma.InputJsonValue;
    if (input.exemplars !== undefined)
      data.exemplars = input.exemplars as Prisma.InputJsonValue;

    return tx.question.update({
      where: { id: questionId },
      data,
      include: questionListInclude,
    });
  }, { timeout: 20_000 });

  return { question, impact };
}

/**
 * Ägarskapskontroll för byte av ämne: en fråga får flytta mellan ämnen, men
 * inte mellan kurser - enkäter, moment och elevsvar är kursbundna.
 */
export async function assertTopicInSameCourse(
  topicId: number,
  courseId: number
): Promise<void> {
  const topic = await prisma.topic.findFirst({
    where: { id: topicId, courseId },
    select: { id: true },
  });
  if (!topic) {
    throw new QuestionEditError("Ämnet tillhör inte denna kurs", 400);
  }
}
