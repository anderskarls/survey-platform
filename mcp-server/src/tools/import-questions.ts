import { prisma } from "../prisma.js";
import Papa from "papaparse";
import { optionCreateData, parseQuestionRow } from "../lib/csv-question.js";

export async function importQuestions(courseId: number, csvContent: string): Promise<string> {
  const result = Papa.parse(csvContent, { header: true, skipEmptyLines: true });

  const rows = result.data as Record<string, string>[];
  let imported = 0;

  await prisma.$transaction(
    async (tx) => {
      for (const row of rows) {
        const parsed = parseQuestionRow(row);
        if (!parsed) continue;

        const topic = await tx.topic.upsert({
          where: { courseId_name: { courseId, name: parsed.topicName } },
          update: {},
          create: { name: parsed.topicName, courseId },
        });

        await tx.question.create({
          data: {
            text: parsed.text,
            type: parsed.type,
            topicId: topic.id,
            config:
              parsed.config === undefined ? undefined : (parsed.config as never),
            subskill: parsed.subskill,
            exemplars:
              parsed.exemplars === undefined
                ? undefined
                : (parsed.exemplars as never),
            options: optionCreateData(parsed),
          },
        });
        imported++;
      }
    },
    { timeout: 30_000, maxWait: 5_000 }
  );

  return `Importerade ${imported} frågor till kurs ${courseId}.`;
}
