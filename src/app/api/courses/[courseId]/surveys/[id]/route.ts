import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCourseAccess } from "@/lib/require-auth";
import { handleApiError } from "@/lib/api-helpers";
import { updateSurveySchema } from "@/lib/validators";
import {
  applySurveyUpdate,
  assertQuestionsInCourse,
  assertUnitInCourse,
  loadSurveyForEdit,
  SurveyEditError,
} from "@/lib/survey-edit";

/** Enkäten med sina frågor - underlaget för redigeringsvyn. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ courseId: string; id: string }> }
) {
  const authError = await requireCourseAccess(params);
  if (authError) return authError;

  const { courseId, id } = await params;
  const cId = Number(courseId);
  const surveyId = Number(id);
  if (isNaN(cId) || isNaN(surveyId)) {
    return NextResponse.json({ error: "Ogiltigt ID" }, { status: 400 });
  }

  const survey = await prisma.survey.findUnique({
    where: { id: surveyId },
    include: {
      questions: {
        include: { question: { include: { options: true, topic: true } } },
        orderBy: { order: "asc" },
      },
      _count: { select: { responses: true } },
    },
  });

  if (!survey) {
    return NextResponse.json({ error: "Enkät hittades inte" }, { status: 404 });
  }
  if (survey.courseId !== cId) {
    return NextResponse.json(
      { error: "Enkäten tillhör inte denna kurs" },
      { status: 403 }
    );
  }

  return NextResponse.json(survey);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ courseId: string; id: string }> }
) {
  const authError = await requireCourseAccess(params);
  if (authError) return authError;

  try {
    const { courseId, id } = await params;
    const cId = Number(courseId);
    const surveyId = Number(id);
    if (isNaN(cId) || isNaN(surveyId)) {
      return NextResponse.json({ error: "Ogiltigt ID" }, { status: 400 });
    }

    const loaded = await loadSurveyForEdit(surveyId);
    if (!loaded) {
      return NextResponse.json({ error: "Enkät hittades inte" }, { status: 404 });
    }
    if (loaded.survey.courseId !== cId) {
      return NextResponse.json(
        { error: "Enkäten tillhör inte denna kurs" },
        { status: 403 }
      );
    }

    const input = updateSurveySchema.parse(await request.json());
    if (input.questionIds) await assertQuestionsInCourse(input.questionIds, cId);
    if (input.unitId != null) await assertUnitInCourse(input.unitId, cId);

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
  { params }: { params: Promise<{ courseId: string; id: string }> }
) {
  const authError = await requireCourseAccess(params);
  if (authError) return authError;

  const { courseId, id } = await params;
  const cId = Number(courseId);
  const surveyId = Number(id);
  if (isNaN(cId) || isNaN(surveyId)) {
    return NextResponse.json({ error: "Ogiltigt ID" }, { status: 400 });
  }

  const survey = await prisma.survey.findUnique({ where: { id: surveyId } });
  if (!survey) {
    return NextResponse.json({ error: "Enkät hittades inte" }, { status: 404 });
  }

  if (survey.courseId !== cId) {
    return NextResponse.json(
      { error: "Enkäten tillhör inte denna kurs" },
      { status: 403 }
    );
  }

  await prisma.survey.delete({ where: { id: surveyId } });

  return NextResponse.json({ success: true });
}
