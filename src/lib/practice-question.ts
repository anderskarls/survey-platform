import type { Prisma } from "@prisma/client";
import { sortingConfigSchema, stripSortingFacit } from "@/lib/formaga";
import { stripTimelineFacit, timelineConfigSchema } from "@/lib/tidslinje";
import { toClientClozeConfig } from "@/lib/cloze";
import { rendersAsCard } from "@/lib/flashcard";
import type { PracticeQuestion } from "@/components/PracticeRunner";

/**
 * Vilka frågor som hör till förmågeträningen (/student/formagor): allt med
 * delfärdighet, plus typerna som övas där utan en. Låg som tre likadana
 * literaler i layouten, listan och topic-sidan - en ny typ ska bara behöva
 * läggas till här.
 */
export const FORMAGA_QUESTION_WHERE: Prisma.QuestionWhereInput = {
  OR: [{ subskill: { not: null } }, { type: { in: ["SORTING", "TIMELINE"] } }],
};

interface DbQuestionLike {
  id: number;
  text: string;
  type: string;
  config: unknown;
  options: { text: string }[];
}

/**
 * Mappar en DB-fråga till klientens övningsformat. Sorteringsfrågor får sin
 * konfiguration MED FACIT BORTTAGET - rätt kategori får aldrig nå klienten
 * före svar. Returnerar null för sorteringsfrågor med trasig konfiguration.
 *
 * Flashcardfrågor skickas helt utan alternativ: baksidan hämtas först när
 * eleven vänder kortet, av samma skäl som sorteringsfacit hålls tillbaka.
 */
export function toPracticeQuestion(
  q: DbQuestionLike,
  courseName: string | null = null,
  flashcard = false
): PracticeQuestion | null {
  if (q.type === "SORTING") {
    const config = sortingConfigSchema.safeParse(q.config);
    if (!config.success) return null;
    return {
      id: q.id,
      text: q.text,
      type: q.type,
      options: [],
      sorting: stripSortingFacit(config.data),
      courseName,
    };
  }
  if (q.type === "TIMELINE") {
    const config = timelineConfigSchema.safeParse(q.config);
    if (!config.success) return null;
    return {
      id: q.id,
      text: q.text,
      type: q.type,
      options: [],
      sorting: null,
      timeline: stripTimelineFacit(config.data),
      courseName,
    };
  }
  const asCard = rendersAsCard(q.type, flashcard);
  return {
    id: q.id,
    text: q.text,
    type: q.type,
    options: asCard ? [] : q.options.map((o) => o.text),
    sorting: null,
    // Luckfrågan får ledtråden men aldrig facit - av samma skäl som
    // sorteringsfacit hålls tillbaka ovan.
    cloze: toClientClozeConfig(q.type, q.config),
    courseName,
    flashcard: asCard,
  };
}
