/**
 * CSV-raden till frågedata - delad av import_questions och
 * create_quiz_from_csv.
 *
 * Fanns tidigare bara i create_quiz_from_csv, vilket gjorde att en
 * luckfråga importerad via import_questions tyst blev en flervalsfråga utan
 * alternativ: fullt synlig för eleven, omöjlig att svara på. Typkännedomen
 * hör hemma på ett ställe.
 */

import { z } from "zod";

/** Markören i frågetexten där ordet ska stå. */
const GAP = "___";

/** Typer med lucka och facit i config-kolumnen. */
const CLOZE_TYPES = ["CLOZE", "CLOZE_CARD"];

const KNOWN_TYPES = [
  "FREE_TEXT",
  "REFLECTION",
  "SORTING",
  "CLOZE",
  "CLOZE_CARD",
  "MULTIPLE_CHOICE",
];

/**
 * Sorteringsfrågans facit ligger i config-kolumnen, som luckformernas.
 * Schemat speglar sortingConfigSchema i webbappens src/lib/formaga.ts -
 * den är kanonisk; ändras den ska den här följa med.
 */
const sortingConfigSchema = z
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
  .superRefine((cfg, ctx) => {
    for (const item of cfg.items) {
      if (!cfg.categories.includes(item.category)) {
        ctx.addIssue({
          code: "custom",
          message: `Objektet "${item.text}" har kategorin "${item.category}" som inte finns i categories`,
        });
      }
    }
  });

/** Exempelsvar i nivåer - speglar exemplarsSchema i webbappens formaga.ts. */
const exemplarsSchema = z
  .array(
    z.object({
      level: z.enum(["E", "C", "A"]),
      text: z.string().min(1).max(5000),
      kommentar: z.string().max(2000).optional().default(""),
    })
  )
  .min(1)
  .max(3);

/** Delfärdigheterna i förmågeträningen - speglar SUBSKILLS i formaga.ts. */
const SUBSKILLS = ["kategorisera", "kedjor", "forgrena", "vikta", "kritisera"];

export interface ParsedQuestionRow {
  topicName: string;
  text: string;
  type: string;
  config?: unknown;
  options: string[];
  correctAnswer?: string;
  /** Förmågeträning: delfärdighet. SORTING utan angiven subskill blir "kategorisera". */
  subskill?: string;
  /** Exempelsvar i nivåer, visas för eleven efter försöket. */
  exemplars?: unknown;
}

/**
 * Läser en rad. Returnerar null för rader utan frågetext (tomma rader i
 * slutet av filen), och kastar för luckformer som saknar facit eller
 * markör - en orättbar luckfråga ska aldrig nå databasen.
 */
export function parseQuestionRow(
  row: Record<string, string>
): ParsedQuestionRow | null {
  const text = row.text?.trim();
  if (!text) return null;

  const rawType = row.type?.trim().toUpperCase() ?? "";
  const type = KNOWN_TYPES.includes(rawType) ? rawType : "MULTIPLE_CHOICE";

  // Luckformerna bär facit i config-kolumnen: {"answer","accept","hint"}.
  // Raden avvisas hellre än importeras orättbar - en luckfråga utan facit
  // ser normal ut för eleven men kan aldrig rättas, och ett luckmeningskort
  // utan facit har ingen baksida att vända till.
  let config: unknown;
  if (CLOZE_TYPES.includes(type)) {
    if (!row.config?.trim()) {
      throw new Error(`Luckfrågan "${text}" saknar config med facit (answer).`);
    }
    try {
      config = JSON.parse(row.config);
    } catch {
      throw new Error(`Ogiltig JSON i config för luckfrågan "${text}".`);
    }
    const answer = (config as { answer?: unknown })?.answer;
    if (typeof answer !== "string" || answer.trim() === "") {
      throw new Error(`Luckfrågan "${text}" saknar facit (answer).`);
    }
    if (!text.includes(GAP)) {
      throw new Error(
        `Luckfrågan "${text}" saknar markören ${GAP} där ordet ska stå.`
      );
    }
  }

  // Sorteringsfrågan bär sitt facit i config, som luckformerna. Utan giltig
  // config är den orättbar och ska aldrig nå databasen - och utan den här
  // grenen föll den dessutom igenom till MULTIPLE_CHOICE utan alternativ.
  if (type === "SORTING") {
    if (!row.config?.trim()) {
      throw new Error(
        `Sorteringsfrågan "${text}" saknar config med kategorier och facit.`
      );
    }
    try {
      config = JSON.parse(row.config);
    } catch {
      throw new Error(`Ogiltig JSON i config för sorteringsfrågan "${text}".`);
    }
    const check = sortingConfigSchema.safeParse(config);
    if (!check.success) {
      throw new Error(
        `Ogiltig config för sorteringsfrågan "${text}": ` +
          check.error.issues.map((i) => i.message).join("; ")
      );
    }
  }

  let exemplars: unknown;
  if (row.exemplars?.trim()) {
    try {
      exemplars = JSON.parse(row.exemplars);
    } catch {
      throw new Error(`Ogiltig JSON i exemplars för frågan "${text}".`);
    }
    const check = exemplarsSchema.safeParse(exemplars);
    if (!check.success) {
      throw new Error(
        `Ogiltiga exemplars för frågan "${text}": ` +
          check.error.issues.map((i) => i.message).join("; ")
      );
    }
  }

  const rawSubskill = row.subskill?.trim().toLowerCase();
  if (rawSubskill && !SUBSKILLS.includes(rawSubskill)) {
    throw new Error(`Okänd subskill "${rawSubskill}" för frågan "${text}".`);
  }
  const subskill =
    rawSubskill || (type === "SORTING" ? "kategorisera" : undefined);

  const options: string[] = [];
  for (let i = 1; i <= 10; i++) {
    const val = row[`option${i}`]?.trim();
    if (val) options.push(val);
  }

  return {
    topicName: row.topic?.trim() || "Övrigt",
    text,
    type,
    config,
    options,
    correctAnswer: row.correctAnswer?.trim() || undefined,
    subskill,
    exemplars,
  };
}

/** Alternativen att skapa - bara flervalsfrågor har några. */
export function optionCreateData(parsed: ParsedQuestionRow) {
  if (parsed.type !== "MULTIPLE_CHOICE" || parsed.options.length === 0) {
    return undefined;
  }
  return {
    create: parsed.options.map((o) => ({
      text: o,
      isCorrect: parsed.correctAnswer ? o === parsed.correctAnswer : false,
    })),
  };
}
