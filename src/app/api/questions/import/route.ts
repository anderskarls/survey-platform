import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseCsvContent, validateCsvRows } from "@/lib/csv";
import { importQuestionRows } from "@/lib/import-questions";
import { handleApiError } from "@/lib/api-helpers";
import { requireAdmin } from "@/lib/require-auth";
import { z } from "zod";

const importSchema = z.object({
  csvContent: z.string().min(1, "CSV-innehåll krävs").max(1_000_000, "CSV-filen är för stor"),
  courseId: z.number().int().positive("Kurs-ID krävs"),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { csvContent, courseId } = importSchema.parse(body);

    const authError = await requireAdmin(courseId);
    if (authError) return authError;

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

    const result = await prisma.$transaction(
      (tx) => importQuestionRows(tx, courseId, rows),
      { timeout: 30_000 }
    );

    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
