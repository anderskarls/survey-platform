import { z } from "zod";

/**
 * Förmågeträning: delfärdigheter i orsaks- och konsekvensresonemang.
 * Kriterierna kommer från "Delfärdighetstaxonomin operationaliserad"
 * (vaultet, 2026-07-19) - nivåbeteckningar och kriteriespråk är lärar-
 * och AI-vända och får aldrig visas för elev i feedback.
 */

export const SUBSKILLS = [
  "kategorisera",
  "kedjor",
  "forgrena",
  "vikta",
  "kritisera",
] as const;
export type Subskill = (typeof SUBSKILLS)[number];

// --- Sorteringsfrågor (delfärdighet 1: kategorisera) ---

export const sortingConfigSchema = z
  .object({
    categories: z.array(z.string().min(1).max(100)).min(2).max(6),
    items: z
      .array(
        z.object({
          text: z.string().min(1).max(300),
          category: z.string().min(1).max(100),
        })
      )
      .min(2)
      .max(20),
  })
  .superRefine((config, ctx) => {
    for (const item of config.items) {
      if (!config.categories.includes(item.category)) {
        ctx.addIssue({
          code: "custom",
          message: `Item "${item.text}" har kategorin "${item.category}" som inte finns i categories`,
        });
      }
    }
  });
export type SortingConfig = z.infer<typeof sortingConfigSchema>;

/** Konfiguration som kan skickas till klienten före svar - utan facit. */
export interface ClientSortingConfig {
  categories: string[];
  items: string[];
}

export function stripSortingFacit(config: SortingConfig): ClientSortingConfig {
  return {
    categories: config.categories,
    items: config.items.map((i) => i.text),
  };
}

/** Elevens placeringar: itemtext -> vald kategori */
export const sortingPlacementsSchema = z.record(z.string(), z.string());
export type SortingPlacements = z.infer<typeof sortingPlacementsSchema>;

export interface SortingItemResult {
  text: string;
  chosen: string | null;
  correct: string;
  isCorrect: boolean;
}

export interface SortingResult {
  perItem: SortingItemResult[];
  correctCount: number;
  total: number;
  allCorrect: boolean;
}

export function gradeSorting(
  config: SortingConfig,
  placements: SortingPlacements
): SortingResult {
  const perItem = config.items.map((item): SortingItemResult => {
    const chosen = placements[item.text] ?? null;
    return {
      text: item.text,
      chosen,
      correct: item.category,
      isCorrect: chosen === item.category,
    };
  });
  const correctCount = perItem.filter((i) => i.isCorrect).length;
  return {
    perItem,
    correctCount,
    total: perItem.length,
    allCorrect: correctCount === perItem.length,
  };
}

// --- Exempelsvar i nivåer (visas först EFTER elevens försök) ---

export const exemplarsSchema = z
  .array(
    z.object({
      level: z.enum(["E", "C", "A"]),
      text: z.string().min(1).max(5000),
      kommentar: z.string().max(2000).optional().default(""),
    })
  )
  .min(1)
  .max(3);
export type Exemplar = z.infer<typeof exemplarsSchema>[number];

// --- Kvalitetskriterier per delfärdighet (underlag för AI-feedback) ---

export interface SubskillCriteria {
  /** Vad delfärdigheten tränar - en mening för promptens kontext */
  beskrivning: string;
  /** Observerbara kriterier per nivå, N1 -> N3 */
  nivaer: { n1: string; n2: string; n3: string };
  /** Typiska svagheter i prioritetsordning - "EN förbättring" riktas mot den tidigaste som hittas */
  svagheter: string[];
}

export const SUBSKILL_CRITERIA: Partial<Record<Subskill, SubskillCriteria>> = {
  kategorisera: {
    beskrivning:
      "Att sortera orsaker/konsekvenser i analytiska kategorier (kort-/långsiktig, utlösande/underliggande, politisk/ekonomisk/social/idémässig; för konsekvenser även avsedd/oavsedd) och motivera placeringen.",
    nivaer: {
      n1: "Placerar huvuddelen av faktorerna rätt. Motiveringen upprepar kategorins namn utan att använda dess definition.",
      n2: "Placerar korrekt och motiverar gränsfall med kategorins definition (t.ex. 'utlösande eftersom den direkt föregick händelsen och satte igång ett förlopp som de underliggande spänningarna gjort möjligt').",
      n3: "Ser och formulerar att kategoritillhörighet kan bero på perspektiv: samma faktor kan vara utlösande i ett tidsfönster och underliggande i ett annat. Motiverar varför tvetydigheten finns i stället för att dölja den.",
    },
    svagheter: [
      "Förväxlar 'utlösande' med 'viktigast' - tror att gnistan är den tyngsta orsaken",
      "Antar att kortsiktig betyder mindre betydelsefull",
      "Kategoriserar efter var faktorn stod i läroboken, inte efter dess funktion i förloppet",
      "Behandlar kategorierna som fack med facit i stället för analysverktyg",
    ],
  },
  kedjor: {
    beskrivning:
      "Att bygga kausala kedjor med mellanled: orsak till mellanled till händelse (bakåt) eller händelse till följd till följd (framåt), uttryckt som sammanhängande resonemang i löptext.",
    nivaer: {
      n1: "En kedja med minst ett mellanled i rimlig ordning, men länkarna är av typen 'ledde till' utan angiven mekanism. Texten är en uppräkning.",
      n2: "Flera mellanled där varje länk anger en mekanism - HUR ledet ger nästa ('eftersom', 'vilket gjorde att'). Sammanhängande resonemang, inte punktlista med sambandsord.",
      n3: "Mekanism i varje länk plus kalibrerad styrka: skiljer nödvändiga led från förstärkande ('bidrog till', 'påskyndade' används medvetet). Markerar var kedjan är osäker eller var en alternativ väg fanns.",
    },
    svagheter: [
      "Kronologi som kausalitet: händelser i tidsordning ('och sedan') utan mekanism som binder dem",
      "Jättekliv: hoppar över mellanled så att länken inte går att pröva",
      "Cirkelslut: sista ledet omformulerar frågan i stället för att landa i den efterfrågade händelsen eller följden",
      "Kedja utan prosa: korrekta led men ingen sammanhängande text som bär mekanismerna",
    ],
  },
};

/**
 * De tre kvalitetssprången som all progression bygger på. Feedbackens
 * enda förbättringsförslag ska peka mot det tidigaste språng som inte tagits.
 */
export const KVALITETSSPRANG = [
  "Från ATT till HUR: ange mekanismen i varje samband, inte bara ordningsföljden",
  "Från påstående till kriterium: motivera val och placeringar med en uttalad grund",
  "Från en linje till flera i samspel: visa hur faktorer samverkar eller var alternativa vägar fanns",
] as const;

/**
 * Regler för feedback på övningssvar - följer med i pending-svaret så att
 * den som genererar feedbacken (läraren via CLI-flödet) alltid har dem.
 * Från utvecklingsplanen; ej förhandlingsbara.
 */
export const FEEDBACK_REGLER = [
  "Exakt format: 'Styrka: <en mening om något specifikt som fungerar>' följt av 'Nästa steg: <EN konkret handling som lyfter just detta svar>'.",
  "En styrka + EN förbättring, läsbar på ca 15 sekunder. Inget annat.",
  "Aldrig nivåord (E-nivå, godtagbart, N1 osv) och inga omdömen om eleven som person.",
  "Förbättringen pekar mot det tidigaste kvalitetssprång som inte tagits (se kvalitetssprang).",
  "Kommentera resonemangets struktur, inte stavning eller stil.",
  "Rikta förbättringen mot den TIDIGASTE typiska svagheten du hittar (se svagheter, i prioritetsordning).",
  "Om svaret inte innehåller något resonemang (t.ex. 'vet inte'): hitta inte på en styrka som inte finns i texten. Styrkan får då vara ärlig (t.ex. att eleven markerade var det tog stopp) och Nästa steg ger en konkret väg in i uppgiften: startpunkt + slutpunkt + ett mellanled att fylla i.",
] as const;
