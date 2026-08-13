import { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-auth";
import { CSV_BOM, toCsv } from "@/lib/csv-export";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireAdmin();
  if (authError) return authError;

  const { id } = await params;
  const surveyId = Number(id);
  if (isNaN(surveyId)) {
    return NextResponse.json({ error: "Ogiltigt enkät-ID" }, { status: 400 });
  }

  const survey = await prisma.survey.findUnique({
    where: { id: surveyId },
    include: {
      questions: {
        include: { question: true },
        orderBy: { order: "asc" },
      },
      responses: {
        include: { student: true, answers: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!survey) {
    return new Response("Enkät hittades inte", { status: 404 });
  }

  const questions = survey.questions.map((sq) => sq.question);

  // CSV header (Avvikelser-kolumnen endast för lockMode-quiz)
  const headers = [
    "Elevnummer",
    "Tidpunkt",
    ...(survey.lockMode ? ["Avvikelser"] : []),
    ...questions.map((q) => q.text),
  ];

  // CSV rows
  const rows = survey.responses.map((r) => {
    const answerMap = new Map(
      r.answers.map((a) => [a.questionId, a.value])
    );
    return [
      r.student.number,
      r.createdAt.toISOString(),
      ...(survey.lockMode ? [r.lockModeViolations] : []),
      ...questions.map((q) => answerMap.get(q.id) || ""),
    ];
  });

  // Elevsvaren kommer fran eleverna sjalva - toCsv neutraliserar formler
  const csvContent = toCsv([headers, ...rows]);

  return new Response(CSV_BOM + csvContent, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="enkat-${survey.id}-resultat.csv"`,
    },
  });
}
