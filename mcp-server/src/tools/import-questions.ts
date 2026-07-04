import { prisma } from "../prisma.js";
import Papa from "papaparse";

export async function importQuestions(courseId: number, csvContent: string): Promise<string> {
  const result = Papa.parse(csvContent, { header: true, skipEmptyLines: true });

  const rows = result.data as Record<string, string>[];
  let imported = 0;

  await prisma.$transaction(
    async (tx) => {
      for (const row of rows) {
        const topicName = row.topic?.trim() || "Övrigt";
        const text = row.text?.trim();
        if (!text) continue;

        const rawType = row.type?.trim().toUpperCase();
        const type =
          rawType === "FREE_TEXT"
            ? "FREE_TEXT"
            : rawType === "REFLECTION"
              ? "REFLECTION"
              : "MULTIPLE_CHOICE";

        const options: string[] = [];
        for (let i = 1; i <= 10; i++) {
          const val = row[`option${i}`]?.trim();
          if (val) options.push(val);
        }
        const correctAnswer = row.correctAnswer?.trim();

        const topic = await tx.topic.upsert({
          where: { courseId_name: { courseId, name: topicName } },
          update: {},
          create: { name: topicName, courseId },
        });

        await tx.question.create({
          data: {
            text,
            type,
            topicId: topic.id,
            options: type === "MULTIPLE_CHOICE" && options.length > 0
              ? {
                  create: options.map((o) => ({
                    text: o,
                    isCorrect: correctAnswer ? o === correctAnswer : false,
                  })),
                }
              : undefined,
          },
        });
        imported++;
      }
    },
    { timeout: 30_000, maxWait: 5_000 }
  );

  return `Importerade ${imported} frågor till kurs ${courseId}.`;
}
