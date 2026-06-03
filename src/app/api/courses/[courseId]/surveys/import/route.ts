import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseCsvContent } from "@/lib/csv";
import { createQuizFromCsvSchema } from "@/lib/validators";
import { handleApiError } from "@/lib/api-helpers";
import { requireAdmin } from "@/lib/require-auth";
import { generateShareCode } from "@/lib/share-code";

// Create a survey/quiz directly from CSV in one call: parses the CSV, creates
// the questions, and attaches them to a new survey in CSV order. Mirrors the
// MCP create_quiz_from_csv tool. Static segment "import" takes precedence over
// the sibling [id] route, same as questions/import alongside questions/[id].
export async function POST(
  request: Request,
  { params }: { params: Promise<{ courseId: string }> }
) {
  const authError = await requireAdmin();
  if (authError) return authError;

  try {
    const { courseId } = await params;
    const cId = Number(courseId);
    if (isNaN(cId)) {
      return NextResponse.json({ error: "Ogiltigt kurs-ID" }, { status: 400 });
    }

    const body = await request.json();
    const { title, csvContent, description, mode, lockMode } =
      createQuizFromCsvSchema.parse(body);

    const rows = parseCsvContent(csvContent);
    if (rows.length === 0) {
      return NextResponse.json(
        { error: "CSV:n innehöll inga giltiga frågor (text saknas)." },
        { status: 400 }
      );
    }

    const shareCode = generateShareCode();

    const result = await prisma.$transaction(
      async (tx) => {
        const questionIds: number[] = [];

        for (const row of rows) {
          const topic = await tx.topic.upsert({
            where: { courseId_name: { courseId: cId, name: row.topic } },
            update: {},
            create: { name: row.topic, courseId: cId },
          });

          const question = await tx.question.create({
            data: {
              text: row.text,
              type: row.type,
              topicId: topic.id,
              options:
                row.type === "MULTIPLE_CHOICE" && row.options.length > 0
                  ? {
                      create: row.options.map((o) => ({
                        text: o,
                        isCorrect: row.correctAnswer ? o === row.correctAnswer : false,
                      })),
                    }
                  : undefined,
            },
          });
          questionIds.push(question.id);
        }

        const survey = await tx.survey.create({
          data: {
            title,
            description,
            shareCode,
            mode,
            lockMode,
            courseId: cId,
            questions: {
              create: questionIds.map((qId, index) => ({ questionId: qId, order: index })),
            },
          },
        });

        return { survey, questionCount: questionIds.length };
      },
      { timeout: 30_000, maxWait: 5_000 }
    );

    return NextResponse.json(
      {
        id: result.survey.id,
        title: result.survey.title,
        mode: result.survey.mode,
        lockMode: result.survey.lockMode,
        shareCode,
        questionCount: result.questionCount,
        url: `/s/${shareCode}`,
      },
      { status: 201 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
