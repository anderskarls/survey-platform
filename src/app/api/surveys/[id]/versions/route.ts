import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireSurveyAccess } from "@/lib/require-auth";
import { handleApiError } from "@/lib/api-helpers";
import { generateShareCode } from "@/lib/share-code";
import { planVersion } from "@/lib/survey-version";

/**
 * Skickar ut nästa version av ett släppt test: samma ord, nya meningar, som
 * en egen enkät som öppnas för klassen direkt. Se survey-version.ts.
 *
 * Kursen läses ur enkäten, som i PATCH på /api/surveys/[id], så att vyn
 * Veckans test fungerar för både ägaren och ett lärarkonto.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const surveyId = Number(id);
  if (isNaN(surveyId)) {
    return NextResponse.json({ error: "Ogiltigt enkät-ID" }, { status: 400 });
  }

  const authError = await requireSurveyAccess(surveyId);
  if (authError) return authError;

  try {
    const source = await prisma.survey.findUnique({
      where: { id: surveyId },
      include: {
        questions: {
          orderBy: { order: "asc" },
          include: {
            question: {
              select: { type: true, text: true, config: true, topicId: true },
            },
          },
        },
        versions: { select: { versionNumber: true } },
      },
    });
    if (!source) {
      return NextResponse.json({ error: "Enkät hittades inte" }, { status: 404 });
    }

    const plan = planVersion(
      {
        title: source.title,
        openAt: source.openAt,
        versionOfId: source.versionOfId,
        questions: source.questions.map((sq) => sq.question),
      },
      source.versions.flatMap((v) => (v.versionNumber === null ? [] : [v.versionNumber]))
    );
    if (!plan.ok) {
      return NextResponse.json({ error: plan.error }, { status: plan.status });
    }

    const survey = await prisma.$transaction(async (tx) => {
      const created = await tx.survey.create({
        data: {
          title: plan.title,
          description: source.description,
          shareCode: generateShareCode(),
          mode: source.mode,
          lockMode: source.lockMode,
          courseId: source.courseId,
          unitId: source.unitId,
          lesson: source.lesson,
          // Öppen direkt: originalet är redan släppt, så veckans ord och
          // övning är redan elevernas. Ingenting nytt blir synligt.
          openAt: null,
          versionOfId: source.id,
          versionNumber: plan.versionNumber,
        },
      });
      const questions = await tx.question.createManyAndReturn({
        data: plan.questions,
        select: { id: true, text: true },
      });
      // RETURNING lovar ingen ordning - testets ordning hämtas ur planen.
      const idByText = new Map(questions.map((q) => [q.text, q.id]));
      await tx.surveyQuestion.createMany({
        data: plan.questions.map((q, order) => ({
          surveyId: created.id,
          questionId: idByText.get(q.text)!,
          order,
        })),
      });
      return created;
    }, { timeout: 30_000, maxWait: 5_000 });

    return NextResponse.json({ survey }, { status: 201 });
  } catch (error) {
    // Två klick samtidigt: den unika nyckeln (versionOfId, versionNumber)
    // släpper bara igenom det första.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "Versionen skapades just. Ladda om sidan." },
        { status: 409 }
      );
    }
    return handleApiError(error);
  }
}
