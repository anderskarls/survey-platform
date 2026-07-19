import { sortingConfigSchema, stripSortingFacit } from "@/lib/formaga";
import type { PracticeQuestion } from "@/components/PracticeRunner";

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
 */
export function toPracticeQuestion(
  q: DbQuestionLike,
  courseName: string | null = null
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
  return {
    id: q.id,
    text: q.text,
    type: q.type,
    options: q.options.map((o) => o.text),
    sorting: null,
    courseName,
  };
}
