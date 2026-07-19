import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { parseCsvContent, questionCreateData, validateCsvRows } from "@/lib/csv";
import { importMomentSchema } from "@/lib/validators";
import { handleApiError } from "@/lib/api-helpers";
import { requireAdmin } from "@/lib/require-auth";
import { generateShareCode } from "@/lib/share-code";

// Import a whole moment ("unit") in one call: creates the Unit plus one survey
// per assignment, with questions parsed from each assignment's CSV. Mirrors the
// MCP import_moment tool but goes through the app's Prisma client.
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
    const { title, description, period, goals, lessons, assignments } =
      importMomentSchema.parse(body);

    // Parse and validate every assignment's CSV up front so an empty one fails
    // with 400 before we open a write transaction.
    const prepared = assignments.map((a) => ({ ...a, rows: parseCsvContent(a.csvContent) }));
    const empty = prepared.find((p) => p.rows.length === 0);
    if (empty) {
      return NextResponse.json(
        { error: `Uppgiften "${empty.title}" innehöll inga giltiga frågor (text saknas).` },
        { status: 400 }
      );
    }
    const rowErrors = prepared.flatMap((p) =>
      validateCsvRows(p.rows).map((e) => `${p.title}: ${e}`)
    );
    if (rowErrors.length > 0) {
      return NextResponse.json(
        { error: `Importen avvisades:\n${rowErrors.join("\n")}` },
        { status: 400 }
      );
    }

    const result = await prisma.$transaction(
      async (tx) => {
        const unit = await tx.unit.create({
          data: {
            title,
            description,
            lessons: lessons as unknown as Prisma.InputJsonValue,
            period: period ?? null,
            goals,
            courseId: cId,
          },
        });

        const created: {
          title: string;
          lesson: number | null;
          shareCode: string;
          url: string;
          questionCount: number;
        }[] = [];

        for (const a of prepared) {
          const shareCode = generateShareCode();
          const questionIds: number[] = [];

          for (const row of a.rows) {
            const topic = await tx.topic.upsert({
              where: { courseId_name: { courseId: cId, name: row.topic } },
              update: {},
              create: { name: row.topic, courseId: cId },
            });

            const question = await tx.question.create({
              data: {
                ...questionCreateData(row),
                topicId: topic.id,
              },
            });
            questionIds.push(question.id);
          }

          const survey = await tx.survey.create({
            data: {
              title: a.title,
              description: "",
              shareCode,
              mode: a.mode,
              lockMode: a.lockMode,
              courseId: cId,
              unitId: unit.id,
              lesson: a.lesson ?? null,
              questions: {
                create: questionIds.map((qId, index) => ({ questionId: qId, order: index })),
              },
            },
          });

          created.push({
            title: survey.title,
            lesson: a.lesson ?? null,
            shareCode,
            url: `/s/${shareCode}`,
            questionCount: questionIds.length,
          });
        }

        return { unit, created };
      },
      { timeout: 60_000, maxWait: 5_000 }
    );

    return NextResponse.json(
      { unitId: result.unit.id, title: result.unit.title, assignments: result.created },
      { status: 201 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
