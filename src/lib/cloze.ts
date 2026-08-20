import { z } from "zod";

/**
 * Luckfrågor - eleven skriver själv in det ord som saknas i en mening.
 *
 * Skillnaden mot flervalsfrågan är att svaret produceras i stället för att
 * väljas: eleven måste kunna stava ordet, inte bara känna igen det. Därför
 * rättas svaret exakt. Det enda som normaliseras bort är sådant som inte är
 * stavning - versaler, extra blanksteg och de krusiga citattecken mobilernas
 * tangentbord sätter in åt eleven utan att fråga.
 *
 * Meningen ligger i Question.text med markören ___ där ordet ska stå.
 * Facit ligger i Question.config och lämnar aldrig servern före rättningen.
 */

/** Markören i frågetexten som byts mot inmatningsfältet. */
export const CLOZE_GAP = "___";

export const clozeConfigSchema = z.object({
  /** Det ord som ska stå i luckan. */
  answer: z
    .string()
    .min(1, "Facit krävs")
    .max(100)
    .transform((s) => s.trim()),
  /**
   * Andra stavningar som också är rätt - brittiskt/amerikanskt
   * (behaviour/behavior), böjningar meningen tillåter. Inte synonymer:
   * ett annat ord är ett annat ord.
   */
  accept: z
    .array(z.string().min(1).max(100))
    .max(10)
    .optional()
    .default([]),
  /** Svensk glosa som ledtråd, så eleven vet vilket ord som avses. */
  hint: z.string().max(200).optional(),
});

export type ClozeConfig = z.infer<typeof clozeConfigSchema>;

/** Det klienten får se före rättning: ledtråden, aldrig facit. */
export interface ClientClozeConfig {
  hint?: string;
}

/** Har frågetexten en lucka att fylla i? */
export function hasGap(text: string): boolean {
  return text.includes(CLOZE_GAP);
}

/**
 * Meningen delad vid luckan, så renderaren kan lägga ett inmatningsfält
 * mitt i texten. Saknas markören blir luckan sist - frågan går inte förlorad
 * bara för att någon glömde skriva ___ i CSV:n.
 */
export function splitAtGap(text: string): { before: string; after: string } {
  const i = text.indexOf(CLOZE_GAP);
  if (i === -1) return { before: text, after: "" };
  return {
    before: text.slice(0, i),
    after: text.slice(i + CLOZE_GAP.length),
  };
}

/**
 * Normalisering före jämförelse. Tar bort allt som inte är stavning:
 * omgivande blanksteg, dubbla mellanslag, versaler och typografiska
 * apostrofer/citattecken. Bokstäverna själva rörs inte - "recieve" blir
 * aldrig "receive".
 */
export function normalizeCloze(value: string): string {
  return value
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * Levenshtein-avstånd. Används bara för att avgöra om ett fel svar var
 * nära - aldrig för att godkänna det.
 */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(row[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    prev = row;
  }
  return prev[b.length];
}

/**
 * Hur nära ett fel svar får ligga för att kallas "nästan". Ett kort ord som
 * "cost" har inte råd med två fel - då är det ett annat ord. Tröskeln följer
 * därför ordlängden.
 */
function nearMissThreshold(answer: string): number {
  if (answer.length <= 4) return 1;
  if (answer.length <= 8) return 2;
  return 3;
}

export interface ClozeVerdict {
  /** Exakt rätt, efter normalisering, mot facit eller en accepterad variant. */
  isCorrect: boolean;
  /** Fel, men bara några bokstäver bort - eleven kan ordet men inte stavningen. */
  nearMiss: boolean;
  /** Facit att visa i återkopplingen. */
  answer: string;
}

/**
 * Rättar ett inskrivet svar.
 *
 * Tomt svar är fel utan att vara nära-miss: eleven skrev ingenting, och
 * "nästan" om ingenting är missvisande återkoppling.
 */
export function gradeCloze(value: string, config: ClozeConfig): ClozeVerdict {
  const given = normalizeCloze(value);
  const answer = config.answer;
  const candidates = [answer, ...(config.accept ?? [])].map(normalizeCloze);

  if (given.length === 0) {
    return { isCorrect: false, nearMiss: false, answer };
  }
  if (candidates.includes(given)) {
    return { isCorrect: true, nearMiss: false, answer };
  }

  const closest = Math.min(
    ...candidates.map((c) => editDistance(given, c))
  );
  return {
    isCorrect: false,
    nearMiss: closest <= nearMissThreshold(normalizeCloze(answer)),
    answer,
  };
}

/**
 * Configen som får skickas till klienten före svaret: ledtråden, aldrig
 * facit. Motsvarar ClientSortingConfig för sorteringsfrågor. Returnerar null
 * för allt som inte är en giltig luckfråga, så anroparen kan skicka fältet
 * rakt av utan att först kontrollera typen.
 */
export function toClientClozeConfig(
  type: string,
  config: unknown
): ClientClozeConfig | null {
  if (type !== "CLOZE") return null;
  const parsed = parseClozeConfig(config);
  if (!parsed) return null;
  return parsed.hint === undefined ? {} : { hint: parsed.hint };
}

/**
 * Läser en config ur databasens Json-kolumn. Returnerar null om den saknas
 * eller är trasig, så anropare kan behandla frågan som orättad i stället för
 * att krascha inlämningen för hela klassen.
 */
export function parseClozeConfig(config: unknown): ClozeConfig | null {
  const parsed = clozeConfigSchema.safeParse(config);
  return parsed.success ? parsed.data : null;
}
