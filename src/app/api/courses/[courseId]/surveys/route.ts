import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateShareCode } from "@/lib/share-code";
import { createSurveySchema } from "@/lib/validators";
import { handleApiError } from "@/lib/api-helpers";
import { requireCourseAccess } from "@/lib/require-auth";
import { z } from "zod";

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

/**
 * Schemalägger släpp för en eller flera av kursens enkäter.
 *
 * Tar hela schemat i ett anrop i stället för ett anrop per enkät: ett
 * veckoschema för en hel termin är 27 rader, och halva vägen genom 27
 * separata anrop är ett trasigt tillstånd som ingen bett om. Antingen
 * ligger hela schemat, eller inget.
 *
 * openAt: null nollställer och gör enkäten öppen direkt.
 */
const scheduleSchema = z.object({
  schedule: z
    .array(
      z.object({
        id: z.number().int().positive(),
        openAt: z.string().datetime().nullable(),
      })
    )
    .min(1)
    .max(200),
});

export async function PATCH(
  request: NextRequest,
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
    const { schedule } = scheduleSchema.parse(body);

    // Enkäterna måste höra till kursen i URL:en - annars vore kursbehörigheten
    // ovan verkningslös och en lärare kunde schemalägga i andras kurser.
    const ids = schedule.map((s) => s.id);
    const owned = await prisma.survey.findMany({
      where: { id: { in: ids }, courseId: cId },
      select: { id: true },
    });
    if (owned.length !== new Set(ids).size) {
      return NextResponse.json(
        { error: "Någon enkät tillhör inte denna kurs" },
        { status: 403 }
      );
    }

    await prisma.$transaction(
      schedule.map((s) =>
        prisma.survey.update({
          where: { id: s.id },
          data: { openAt: s.openAt === null ? null : new Date(s.openAt) },
        })
      )
    );

    return NextResponse.json({ updated: schedule.length });
  } catch (error) {
    return handleApiError(error);
  }
}
