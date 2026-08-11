import Papa from "papaparse";
import { Prisma } from "@prisma/client";
import { SUBSKILLS, exemplarsSchema, sortingConfigSchema } from "@/lib/formaga";
import { CLOZE_GAP, clozeConfigSchema, hasGap, isClozeType } from "@/lib/cloze";
import { timelineConfigSchema } from "@/lib/tidslinje";

export interface CsvQuestionRow {
  topic: string;
  type: string;
  text: string;
  options: string[];
  correctAnswer?: string;
  /** Förmågeträning: delfärdighet (kategorisera | kedjor | forgrena | vikta | kritisera) */
  subskill?: string;
  /** SORTING: JSON-kolumn "config" med { categories, items: [{ text, category }] }. TIMELINE: se tidslinje.ts */
  config?: unknown;
  /** JSON-kolumn "exemplars" med [{ level: E|C|A, text, kommentar }] */
  exemplars?: unknown;
  /** JSON-syntaxfel i config/exemplars - raden ska avvisas, inte tappas tyst */
  jsonError?: string;
  /** Värdet i type-kolumnen när det inte är en typ appen känner igen */
  unknownType?: string;
}

const KNOWN_TYPES = [
  "FREE_TEXT",
  "REFLECTION",
  "SORTING",
  "TIMELINE",
  "CLOZE",
  "CLOZE_CARD",
] as const;
/**
 * Tillåtna värden i type-kolumnen. MULTIPLE_CHOICE är default när kolumnen
 * saknas eller är tom, men måste också gå att skriva ut.
 */
const TILLATNA_TYPER = [...KNOWN_TYPES, "MULTIPLE_CHOICE"] as const;

export function parseCsvContent(csvContent: string): CsvQuestionRow[] {
  const result = Papa.parse(csvContent, {
    header: true,
    skipEmptyLines: true,
  });

  return (result.data as Record<string, string>[]).map((row) => {
    const options: string[] = [];
    for (let i = 1; i <= 10; i++) {
      const key = `option${i}`;
      if (row[key]?.trim()) {
        options.push(row[key].trim());
      }
    }

    // Tom type-kolumn betyder MULTIPLE_CHOICE. Ett OKÄNT värde är däremot ett
    // fel och ska rapporteras: läraren som skrev ESSAY eller Free_text fick
    // förut {"imported": 1} och en fråga vars enda svarsalternativ för eleven
    // var "Jag är inte säker".
    const rawType = row.type?.trim().toUpperCase() || "";
    const kandType = (TILLATNA_TYPER as readonly string[]).includes(rawType);
    const type = rawType === "" || !kandType ? "MULTIPLE_CHOICE" : rawType;
    const unknownType = rawType !== "" && !kandType ? rawType : undefined;

    let config: unknown;
    let exemplars: unknown;
    let jsonError: string | undefined;
    if (row.config?.trim()) {
      try {
        config = JSON.parse(row.config);
      } catch {
        jsonError = `Ogiltig JSON i config-kolumnen för "${row.text?.trim()}"`;
      }
    }
    if (row.exemplars?.trim()) {
      try {
        exemplars = JSON.parse(row.exemplars);
      } catch {
        jsonError = `Ogiltig JSON i exemplars-kolumnen för "${row.text?.trim()}"`;
      }
    }

    return {
      topic: row.topic?.trim() || "Övrigt",
      type,
      text: row.text?.trim() || "",
      options,
      correctAnswer: row.correctAnswer?.trim() || undefined,
      subskill: row.subskill?.trim().toLowerCase() || undefined,
      unknownType,
      config,
      exemplars,
      jsonError,
    };
  }).filter((row) => row.text.length > 0);
}

/**
 * Validerar förmågefälten (subskill/config/exemplars) på parsade rader.
 * Returnerar alla fel så importen kan avvisas i sin helhet med tydlig
 * felrapport i stället för att tappa rader tyst.
 */
export function validateCsvRows(rows: CsvQuestionRow[]): string[] {
  const errors: string[] = [];
  for (const row of rows) {
    if (row.jsonError) {
      errors.push(row.jsonError);
      continue;
    }
    if (row.unknownType) {
      errors.push(
        `Okänd frågetyp "${row.unknownType}" för "${row.text}" ` +
          `(tillåtna: ${TILLATNA_TYPER.join(", ")})`
      );
      continue;
    }
    if (row.type === "MULTIPLE_CHOICE" && row.options.length === 0) {
      errors.push(
        `Flervalsfrågan "${row.text}" saknar svarsalternativ ` +
          `(fyll i option1, option2, ... eller ange type=FREE_TEXT)`
      );
    }
    if (row.subskill && !(SUBSKILLS as readonly string[]).includes(row.subskill)) {
      errors.push(
        `Okänd delfärdighet "${row.subskill}" för "${row.text}" (tillåtna: ${SUBSKILLS.join(", ")})`
      );
    }
    if (row.type === "SORTING") {
      const parsed = sortingConfigSchema.safeParse(row.config);
      if (!parsed.success) {
        errors.push(
          `Ogiltig sorteringskonfiguration för "${row.text}": ${parsed.error.issues[0]?.message ?? "okänt fel"}`
        );
      }
    }
    if (row.type === "TIMELINE") {
      const parsed = timelineConfigSchema.safeParse(row.config);
      if (!parsed.success) {
        errors.push(
          `Ogiltig tidslinjekonfiguration för "${row.text}": ${parsed.error.issues[0]?.message ?? "okänt fel"}`
        );
      }
    }
    if (isClozeType(row.type)) {
      const parsed = clozeConfigSchema.safeParse(row.config);
      if (!parsed.success) {
        errors.push(
          `Ogiltig luckkonfiguration för "${row.text}": ${parsed.error.issues[0]?.message ?? "okänt fel"}`
        );
      }
      if (!hasGap(row.text)) {
        errors.push(
          `Luckfrågan "${row.text}" saknar markören ${CLOZE_GAP} där ordet ska stå`
        );
      }
    }
    if (row.exemplars !== undefined) {
      const parsed = exemplarsSchema.safeParse(row.exemplars);
      if (!parsed.success) {
        errors.push(
          `Ogiltiga exempelsvar för "${row.text}": ${parsed.error.issues[0]?.message ?? "okänt fel"}`
        );
      }
    }
  }
  return errors;
}

/**
 * Prisma-create-data för en validerad CSV-rad (utan topic-koppling - den
 * sätts av respektive route). Sorteringsfrågor utan angiven delfärdighet
 * får "kategorisera" som default.
 */
export function questionCreateData(
  row: CsvQuestionRow
): Omit<Prisma.QuestionUncheckedCreateInput, "topicId"> {
  const subskill =
    row.subskill ?? (row.type === "SORTING" ? "kategorisera" : undefined);
  return {
    text: row.text,
    type: row.type,
    subskill,
    config:
      row.type === "SORTING" || row.type === "TIMELINE" || isClozeType(row.type)
        ? (row.config as Prisma.InputJsonValue)
        : undefined,
    exemplars:
      row.exemplars !== undefined
        ? (row.exemplars as Prisma.InputJsonValue)
        : undefined,
    options:
      row.type === "MULTIPLE_CHOICE" && row.options.length > 0
        ? {
            create: row.options.map((o) => ({
              text: o,
              isCorrect: row.correctAnswer ? o === row.correctAnswer : false,
            })),
          }
        : undefined,
  };
}

// --- CSV-export ---

/**
 * Tecken som gör att Excel och Google Kalkylark tolkar cellen som en formel.
 * `+` och `-` täcker även telefonnummerlika svar; `\t` och `\r` är med för att
 * de kan smyga in i början av ett inklistrat elevsvar.
 */
const FORMELSTART = /^[=+\-@\t\r]/;

export function escCsv(val: unknown): string {
  let s = String(val ?? "");
  // Fritextsvar är elevtext, aldrig formler. Exporten öppnas i kalkylark -
  // det är hela poängen med BOM:en - så ett svar som börjar med "=" kördes
  // förut som formel när läraren öppnade filen. Ett inledande apostrof-tecken
  // är kalkylarkens egen konvention för "det här är text".
  if (FORMELSTART.test(s)) s = `'${s}`;
  return s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")
    ? `"${s.replace(/"/g, '""')}"`
    : s;
}
