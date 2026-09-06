import { prisma } from "../prisma.js";
import Papa from "papaparse";
import { optionCreateData, parseQuestionRow } from "../lib/csv-question.js";

/**
 * Samma dubblettregel som webbappens src/lib/import-questions.ts: en fråga
 * är (topic, text) inom kursen, och en rad som matchar en befintlig fråga
 * uppdaterar den i stället för att skapa en till. Id:t består, så
 * övningshistoriken följer med. Exemplars skrivs bara över när raden har
 * några. Regeln finns på två ställen för att paketen inte delar kod - ändras
 * den ska båda följa med.
 */
export async function importQuestions(courseId: number, csvContent: string): Promise<string> {
  const result = Papa.parse(csvContent, { header: true, skipEmptyLines: true });

  const rows = result.data as Record<string, string>[];
  let imported = 0;
  let updated = 0;

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

        const config =
          parsed.config === undefined ? undefined : (parsed.config as never);
        const exemplars =
          parsed.exemplars === undefined ? undefined : (parsed.exemplars as never);
        const options = optionCreateData(parsed);

        const existing = await tx.question.findFirst({
          where: { topicId: topic.id, text: parsed.text },
          include: { options: { orderBy: { id: "asc" } } },
        });

        if (!existing) {
          await tx.question.create({
            data: {
              text: parsed.text,
              type: parsed.type,
              topicId: topic.id,
              config,
              subskill: parsed.subskill,
              exemplars,
              options,
            },
          });
          imported++;
          continue;
        }

        const nya = options?.create ?? [];
        const alternativLika =
          JSON.stringify(existing.options.map((o) => [o.text, o.isCorrect])) ===
          JSON.stringify(nya.map((o) => [o.text, o.isCorrect]));

        await tx.question.update({
          where: { id: existing.id },
          data: {
            type: parsed.type,
            subskill: parsed.subskill ?? null,
            config,
            exemplars,
            options: alternativLika ? undefined : { deleteMany: {}, create: nya },
          },
        });
        updated++;
      }
    },
    { timeout: 30_000, maxWait: 5_000 }
  );

  return updated
    ? `Importerade ${imported} nya frågor och uppdaterade ${updated} befintliga i kurs ${courseId}.`
    : `Importerade ${imported} frågor till kurs ${courseId}.`;
}
