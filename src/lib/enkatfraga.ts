import {
  sortingConfigSchema,
  stripSortingFacit,
  type ClientSortingConfig,
} from "@/lib/formaga";
import { cardBack } from "@/lib/flashcard";
import { toClientClozeConfig, type ClientClozeConfig } from "@/lib/cloze";
import {
  stripTimelineFacit,
  timelineConfigSchema,
  type ClientTimelineConfig,
} from "@/lib/tidslinje";

/**
 * En fråga som den ser ut för eleven i enkät- och quizflödet.
 *
 * Motsvarigheten på övningssidan är `toPracticeQuestion`. Att enkätflödet
 * saknade en sådan mappning var hela P1-12: sidorna plockade ihop `{ id, text,
 * type, options }` för hand, `config` följde aldrig med, och SORTING föll
 * igenom renderaren till en tom textruta. Kort- och luckfälten hör hemma på
 * samma ställe: det som får lämna servern före svaret avgörs här, inte per sida.
 */
export interface EnkatFraga {
  id: number;
  text: string;
  type: string;
  options: string[];
  /** SORTING: konfiguration MED FACIT BORTTAGET; null för övriga typer */
  sorting: ClientSortingConfig | null;
  /**
   * TIMELINE: axel, epoker och prickar MED FACIT BORTTAGET - målets år och de
   * icke-ankrade rubrikerna stannar på servern tills svaret är inne. Null för
   * övriga typer. Se stripTimelineFacit.
   */
  timeline: ClientTimelineConfig | null;
  /**
   * Kortets baksida: det rätta alternativet i flashcardläge, ordet som
   * fyller luckan för CLOZE_CARD. Null för allt som inte är ett kort - i
   * vanliga enkäter får facit aldrig nå klienten före svaret. Se cardBack.
   */
  answer?: string | null;
  /** Luckfrågans ledtråd. Facit ingår aldrig - det stannar på servern. */
  cloze?: ClientClozeConfig | null;
}

interface DbFragaLike {
  id: number;
  text: string;
  type: string;
  config: unknown;
  options: { text: string; isCorrect: boolean }[];
}

/** @param flashcard kursen kör flashcardläge - flervalsfrågor visas som kort */
export function toEnkatFraga(q: DbFragaLike, flashcard = false): EnkatFraga {
  const bas = {
    id: q.id,
    text: q.text,
    type: q.type,
    options: q.options.map((o) => o.text),
    answer: cardBack(q, flashcard),
    cloze: toClientClozeConfig(q.type, q.config),
  };
  if (q.type === "TIMELINE") {
    const config = timelineConfigSchema.safeParse(q.config);
    // Samma regel som för sorteringen: trasig konfiguration ger null, och
    // renderaren säger rakt ut att uppgiften inte går att visa.
    return {
      ...bas,
      sorting: null,
      timeline: config.success ? stripTimelineFacit(config.data) : null,
    };
  }
  if (q.type !== "SORTING") return { ...bas, sorting: null, timeline: null };

  const config = sortingConfigSchema.safeParse(q.config);
  // Trasig konfiguration ger `sorting: null`; renderaren säger då rakt ut att
  // uppgiften inte går att visa i stället för att lägga fram en textruta.
  return {
    ...bas,
    sorting: config.success ? stripSortingFacit(config.data) : null,
    timeline: null,
  };
}
