import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseCsvContent, questionCreateData, validateCsvRows } from "@/lib/csv";
import { handleApiError } from "@/lib/api-helpers";
import { requireAdmin } from "@/lib/require-auth";
import { z } from "zod";

const importSchema = z.object({
  csvContent: z.string().min(1, "CSV-innehåll krävs").max(1_000_000, "CSV-filen är för stor"),
  courseId: z.number().int().positive("Kurs-ID krävs"),
});

export async function POST(request: Request) {
  const authError = await requireAdmin();
  if (authError) return authError;

  try {
    const body = await request.json();
    const { csvContent, courseId } = importSchema.parse(body);

    const rows = parseCsvContent(csvContent);

    if (rows.length === 0) {
      return NextResponse.json(
        { error: "Inga giltiga rader hittades" },
        { status: 400 }
      );
    }
    const rowErrors = validateCsvRows(rows);
    if (rowErrors.length > 0) {
      return NextResponse.json(
        { error: `Importen avvisades:\n${rowErrors.join("\n")}` },
        { status: 400 }
      );
    }

    let imported = 0;

    await prisma.$transaction(async (tx) => {
      // Upsert all unique topics first
      const uniqueTopics = [...new Set(rows.map((r) => r.topic))];
      const topicMap = new Map<string, number>();
      for (const name of uniqueTopics) {
        const topic = await tx.topic.upsert({
          where: { courseId_name: { courseId, name } },
          update: {},
          create: { name, courseId },
        });
        topicMap.set(name, topic.id);
      }

      // Create all questions
      for (const row of rows) {
        await tx.question.create({
          data: {
            ...questionCreateData(row),
            topicId: topicMap.get(row.topic)!,
          },
        });
        imported++;
      }
    }, { timeout: 30_000 });

    return NextResponse.json({ imported });
  } catch (error) {
    return handleApiError(error);
  }
}
