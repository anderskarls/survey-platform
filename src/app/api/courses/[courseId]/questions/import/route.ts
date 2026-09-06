import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseCsvContent, validateCsvRows } from "@/lib/csv";
import { importQuestionRows } from "@/lib/import-questions";
import { importCsvSchema } from "@/lib/validators";
import { handleApiError } from "@/lib/api-helpers";
import { requireCourseAccess } from "@/lib/require-auth";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ courseId: string }> }
) {
  const authError = await requireCourseAccess(params);
  if (authError) return authError;

  try {
    const { courseId } = await params;
    const cId = Number(courseId);
    if (isNaN(cId)) {
      return NextResponse.json({ error: "Ogiltigt kurs-ID" }, { status: 400 });
    }

    const body = await request.json();
    const { csvContent } = importCsvSchema.parse(body);

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
      (tx) => importQuestionRows(tx, cId, rows),
      { timeout: 30_000 }
    );

    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
