import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateShareCode } from "@/lib/share-code";
import { createSurveySchema } from "@/lib/validators";
import { handleApiError } from "@/lib/api-helpers";
import { requireCourseAccess } from "@/lib/require-auth";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ courseId: string }> }
) {
  const authError = await requireCourseAccess(params);
  if (authError) return authError;

  const { courseId } = await params;
  const cId = Number(courseId);
  if (isNaN(cId)) {
    return NextResponse.json({ error: "Ogiltigt kurs-ID" }, { status: 400 });
  }

  const surveys = await prisma.survey.findMany({
    where: { courseId: cId },
    include: {
      _count: { select: { questions: true, responses: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(surveys);
}

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
    const { title, description, mode, lockMode, questionIds } =
      createSurveySchema.parse(body);

    // Validate that all questionIds belong to this course
    const validQuestions = await prisma.question.findMany({
      where: {
        id: { in: questionIds },
        topic: { courseId: cId },
      },
      select: { id: true },
    });
    const validIds = new Set(validQuestions.map((q) => q.id));
    const invalidIds = questionIds.filter((id) => !validIds.has(id));
    if (invalidIds.length > 0) {
      return NextResponse.json(
        { error: "Vissa frågor tillhör inte denna kurs", invalidIds },
        { status: 400 }
      );
    }

    const survey = await prisma.survey.create({
      data: {
        title,
        description,
        mode,
        lockMode,
        shareCode: generateShareCode(),
        courseId: cId,
        questions: {
          create: questionIds.map((qId, index) => ({
            questionId: qId,
            order: index,
          })),
        },
      },
      include: {
        questions: {
          include: { question: { include: { options: true } } },
          orderBy: { order: "asc" },
        },
      },
    });

    return NextResponse.json(survey, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
