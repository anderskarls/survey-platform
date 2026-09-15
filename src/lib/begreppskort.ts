import { z } from "zod";

/**
 * Begreppskort - begrepp som tas upp i klassrummet utan att stå i
 * momentplaneringen.
 *
 * Framsidan är begreppet (Question.text), baksidan lärarens förklaring
 * (Question.config.explanation). Eleven försöker minnas vad begreppet
 * betyder, vänder kortet och skattar sig själv - samma Anki-modell som
 * glosekorten och luckmeningskorten, se `docs/ovning/05-kortformer.md`.
 *
 * Kortet är kort i kraft av sin typ, som luckmeningskortet: det ska kunna
 * övas i historie- och samhällskurser som inte kör flashcardläge. En
 * flervalsfråga med förklaringen som enda alternativ hade i de kurserna
 * visats som en alternativlista med ett enda val.
 */
export const CONCEPT_CARD = "CONCEPT_CARD";

export const MAX_TERM = 200;
export const MAX_EXPLANATION = 500;

export const conceptConfigSchema = z.object({
  /** Kortets baksida: vad begreppet betyder, som läraren förklarade det. */
  explanation: z
    .string()
    .transform((s) => s.trim())
    .pipe(z.string().min(1, "Förklaring krävs").max(MAX_EXPLANATION)),
});

export type ConceptConfig = z.infer<typeof conceptConfigSchema>;

/** Läser configen ur databasens Json-kolumn; null om den saknas eller är trasig. */
export function parseConceptConfig(config: unknown): ConceptConfig | null {
  const parsed = conceptConfigSchema.safeParse(config);
  return parsed.success ? parsed.data : null;
}

/**
 * Momentets begrepp samlas i ett eget ämne. Momentens övriga ämnen är
 * uppdelade per lektion och per uppgift, och inget av dem är öppnat för
 * övning - ett eget ämne kan öppnas utan att dra med sig exit tickets.
 */
export function conceptTopicName(unitTitle: string): string {
  return `${unitTitle.trim()} - Begrepp`;
}

export interface Begreppsrad {
  term: string;
  explanation: string;
}

export interface Radfel {
  /** Radnummer i rutan, 1-baserat, så läraren hittar raden. */
  rad: number;
  text: string;
  orsak: string;
}

/**
 * Skiljetecken mellan begrepp och förklaring. Bindestreck med mellanslag
 * runt är lärarens eget skrivsätt ("Polis - grekisk stadsstat"); tankstrecken
 * följer med när texten klistras in från Word eller en webbsida, och kolon är
 * det andra naturliga sättet att skriva en ordlista.
 *
 * Mellanslagen runt strecket är avsiktliga: "Västromerska riket" eller
 * "1900-talet" får inte delas mitt i ordet.
 */
const SKILJETECKEN = /\s+[-–—]\s+|:\s+/;

/**
 * Tolkar rutans innehåll, en rad per begrepp.
 *
 * Tomma rader hoppas över. Rader som inte går att tolka returneras som fel i
 * stället för att tappas - läraren ska se att "Demos folket" saknar
 * skiljetecken, inte undra varför det blev två kort av tre. Samma begrepp två
 * gånger i rutan blir ett kort, med den sista förklaringen.
 */
export function parseBegreppsrader(input: string): {
  rader: Begreppsrad[];
  fel: Radfel[];
} {
  const byTerm = new Map<string, Begreppsrad>();
  const fel: Radfel[] = [];

  input.split(/\r?\n/).forEach((raw, i) => {
    const text = raw.trim();
    if (!text) return;
    const rad = i + 1;

    const match = SKILJETECKEN.exec(text);
    if (!match) {
      fel.push({ rad, text, orsak: 'Skriv begrepp och förklaring med " - " emellan' });
      return;
    }
    const term = text.slice(0, match.index).trim();
    const explanation = text.slice(match.index + match[0].length).trim();

    if (!term || !explanation) {
      fel.push({ rad, text, orsak: "Begrepp eller förklaring saknas" });
      return;
    }
    if (term.length > MAX_TERM) {
      fel.push({ rad, text, orsak: `Begreppet är längre än ${MAX_TERM} tecken` });
      return;
    }
    if (explanation.length > MAX_EXPLANATION) {
      fel.push({ rad, text, orsak: `Förklaringen är längre än ${MAX_EXPLANATION} tecken` });
      return;
    }

    // Första förekomsten bestämmer stavningen och ordningen, den sista
    // förklaringen vinner - den är lärarens senaste formulering.
    const key = normalizeTerm(term);
    byTerm.set(key, { term: byTerm.get(key)?.term ?? term, explanation });
  });

  return { rader: Array.from(byTerm.values()), fel };
}

/**
 * Nyckeln som avgör om två begrepp är samma kort. Versaler och blanksteg
 * skiljer inte två begrepp åt - "polis" och "Polis " är samma kort, och en ny
 * förklaring till det ersätter den gamla i stället för att skapa en dubblett.
 */
export function normalizeTerm(term: string): string {
  return term.trim().replace(/\s+/g, " ").toLowerCase();
}
