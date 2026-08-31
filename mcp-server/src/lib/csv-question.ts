/**
 * CSV-raden till frågedata - delad av import_questions och
 * create_quiz_from_csv.
 *
 * Fanns tidigare bara i create_quiz_from_csv, vilket gjorde att en
 * luckfråga importerad via import_questions tyst blev en flervalsfråga utan
 * alternativ: fullt synlig för eleven, omöjlig att svara på. Typkännedomen
 * hör hemma på ett ställe.
 */

/** Markören i frågetexten där ordet ska stå. */
const GAP = "___";

/** Typer med lucka och facit i config-kolumnen. */
const CLOZE_TYPES = ["CLOZE", "CLOZE_CARD"];

const KNOWN_TYPES = [
  "FREE_TEXT",
  "REFLECTION",
  "CLOZE",
  "CLOZE_CARD",
  "MULTIPLE_CHOICE",
];

export interface ParsedQuestionRow {
  topicName: string;
  text: string;
  type: string;
  config?: unknown;
  options: string[];
  correctAnswer?: string;
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
