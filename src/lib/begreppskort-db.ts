import type { PrismaClient } from "@prisma/client";
import {
  CONCEPT_CARD,
  conceptTopicName,
  normalizeTerm,
  parseConceptConfig,
  type Begreppsrad,
} from "@/lib/begreppskort";

/**
 * Databasdelen av begreppskorten, skild från routen så att den kan köras mot
 * databasen utan HTTP-lagret (se scripts/verify-begreppskort.ts). Klienten
 * skickas in: appen ger sin egen, skripten en Neon-klient.
 */

export interface MomentRef {
  id: number;
  courseId: number;
  title: string;
}

export interface SparatResultat {
  topicId: number;
  skapade: number;
  uppdaterade: number;
  oforandrade: number;
}

/**
 * Sparar tolkade rader i momentets begreppsämne.
 *
 * Ämnet skapas vid första anropet, kopplas till momentet och öppnas för
 * övning - även om det redan fanns: läraren som skriver ett begrepp här vill
 * att det övas. Ett begrepp som redan finns får den nya förklaringen i stället
 * för en dubblett, så elevernas FSRS-historik på kortet ligger kvar.
 */
export async function sparaBegrepp(
  db: PrismaClient,
  unit: MomentRef,
  rader: Begreppsrad[]
): Promise<SparatResultat> {
  const name = conceptTopicName(unit.title);
  return db.$transaction(
    async (tx) => {
      const topic = await tx.topic.upsert({
        where: { courseId_name: { courseId: unit.courseId, name } },
        update: { unitId: unit.id, practiceOpen: true },
        create: { name, courseId: unit.courseId, unitId: unit.id, practiceOpen: true },
      });

      const existing = await tx.question.findMany({
        where: { topicId: topic.id, type: CONCEPT_CARD },
        select: { id: true, text: true, config: true },
      });
      const byTerm = new Map(existing.map((q) => [normalizeTerm(q.text), q]));

      let skapade = 0;
      let uppdaterade = 0;
      let oforandrade = 0;
      for (const rad of rader) {
        const found = byTerm.get(normalizeTerm(rad.term));
        if (!found) {
          await tx.question.create({
            data: {
              text: rad.term,
              type: CONCEPT_CARD,
              topicId: topic.id,
              config: { explanation: rad.explanation },
            },
          });
          skapade++;
        } else if (parseConceptConfig(found.config)?.explanation !== rad.explanation) {
          await tx.question.update({
            where: { id: found.id },
            data: { config: { explanation: rad.explanation } },
          });
          uppdaterade++;
        } else {
          oforandrade++;
        }
      }
      return { topicId: topic.id, skapade, uppdaterade, oforandrade };
    },
    { timeout: 30_000, maxWait: 5_000 }
  );
}

export type Borttagning =
  | { ok: true }
  | { ok: false; status: 404 | 409; error: string };

/**
 * Tar bort ett begreppskort - men bara ett som ingen elev mött.
 *
 * Övningsförsök och svar kaskaderar vid radering, och `answers=0` betyder
 * inte oanvänd: övningen skriver till PracticeAttempt. Ett kort med historik
 * får därför ligga kvar; en felskriven förklaring rättas genom att begreppet
 * skrivs in igen med den nya.
 */
export async function taBortBegrepp(
  db: PrismaClient,
  unit: MomentRef,
  questionId: number
): Promise<Borttagning> {
  const question = await db.question.findUnique({
    where: { id: questionId },
    select: {
      type: true,
      topic: { select: { unitId: true, name: true } },
      _count: { select: { practiceAttempts: true, answers: true, surveyQuestions: true } },
    },
  });
  if (
    !question ||
    question.type !== CONCEPT_CARD ||
    question.topic.unitId !== unit.id ||
    question.topic.name !== conceptTopicName(unit.title)
  ) {
    return { ok: false, status: 404, error: "Begreppet hittades inte" };
  }

  const { practiceAttempts, answers, surveyQuestions } = question._count;
  if (practiceAttempts + answers > 0) {
    return {
      ok: false,
      status: 409,
      error:
        "Elever har redan övat på begreppet, så kortet ligger kvar i deras repetition. " +
        "Skriv in begreppet igen med en ny förklaring om den behöver rättas.",
    };
  }
  if (surveyQuestions > 0) {
    return {
      ok: false,
      status: 409,
      error: "Begreppet ingår i en enkät - ta bort det därifrån först",
    };
  }

  await db.question.delete({ where: { id: questionId } });
  return { ok: true };
}
