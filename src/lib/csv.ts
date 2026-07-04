import Papa from "papaparse";

export interface CsvQuestionRow {
  topic: string;
  type: string;
  text: string;
  options: string[];
  correctAnswer?: string;
}

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
    const type =
      rawType === "FREE_TEXT"
        ? "FREE_TEXT"
        : rawType === "REFLECTION"
          ? "REFLECTION"
          : "MULTIPLE_CHOICE";

    return {
      topic: row.topic?.trim() || "Övrigt",
      type,
      text: row.text?.trim() || "",
      options,
      correctAnswer: row.correctAnswer?.trim() || undefined,
    };
  }).filter((row) => row.text.length > 0);
}
