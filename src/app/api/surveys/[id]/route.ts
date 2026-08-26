import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSurveyAccess } from "@/lib/require-auth";
import { handleApiError } from "@/lib/api-helpers";
import { updateSurveySchema } from "@/lib/validators";
import {
  applySurveyUpdate,
  assertQuestionsInCourse,
  assertUnitInCourse,
  loadSurveyForEdit,
  SurveyEditError,
} from "@/lib/survey-edit";

export async function GET(
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

  const survey = await prisma.survey.findUnique({
    where: { id: surveyId },
    include: {
      questions: {
        include: { question: { include: { options: true } } },
        orderBy: { order: "asc" },
      },
      _count: { select: { responses: true } },
    },
  });

  if (!survey) {
    return NextResponse.json({ error: "Enkät hittades inte" }, { status: 404 });
  }

  return NextResponse.json(survey);
}

/**
 * Redigerar enkäten. Kursen läses ur enkäten själv - den här routen används av
 * den kursövergripande adminvyn och av CLI:t, där kurs-id inte står i URL:en.
 */
export async function PATCH(
  request: NextRequest,
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
    const loaded = await loadSurveyForEdit(surveyId);
    if (!loaded) {
      return NextResponse.json({ error: "Enkät hittades inte" }, { status: 404 });
    }

    const courseId = loaded.survey.courseId;
    const input = updateSurveySchema.parse(await request.json());
    if (input.questionIds) await assertQuestionsInCourse(input.questionIds, courseId);
    if (input.unitId != null) await assertUnitInCourse(input.unitId, courseId);

    const { survey, impact } = await applySurveyUpdate(
      loaded.survey,
      loaded.plannable,
      input
    );
    return NextResponse.json({ survey, impact });
  } catch (error) {
    if (error instanceof SurveyEditError) {
      return NextResponse.json(
        { error: error.message, ...error.payload },
        { status: error.status }
      );
    }
    return handleApiError(error);
  }
}

export async function DELETE(
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

  const survey = await prisma.survey.findUnique({ where: { id: surveyId } });
  if (!survey) {
    return NextResponse.json({ error: "Enkät hittades inte" }, { status: 404 });
  }

  await prisma.survey.delete({ where: { id: surveyId } });

  return NextResponse.json({ success: true });
}
