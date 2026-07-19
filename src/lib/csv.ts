import Papa from "papaparse";
import { Prisma } from "@prisma/client";
import { SUBSKILLS, exemplarsSchema, sortingConfigSchema } from "@/lib/formaga";

export interface CsvQuestionRow {
  topic: string;
  type: string;
  text: string;
  options: string[];
  correctAnswer?: string;
  /** Förmågeträning: delfärdighet (kategorisera | kedjor | forgrena | vikta | kritisera) */
  subskill?: string;
  /** SORTING: JSON-kolumn "config" med { categories, items: [{ text, category }] } */
  config?: unknown;
  /** JSON-kolumn "exemplars" med [{ level: E|C|A, text, kommentar }] */
  exemplars?: unknown;
  /** JSON-syntaxfel i config/exemplars - raden ska avvisas, inte tappas tyst */
  jsonError?: string;
}

const KNOWN_TYPES = ["FREE_TEXT", "REFLECTION", "SORTING"] as const;

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

    const rawType = row.type?.trim().toUpperCase();
    const type = (KNOWN_TYPES as readonly string[]).includes(rawType)
      ? rawType
      : "MULTIPLE_CHOICE";

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
      row.type === "SORTING"
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
