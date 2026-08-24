import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCourseAccess } from "@/lib/require-auth";
import { handleApiError } from "@/lib/api-helpers";
import { courseSettingsSchema } from "@/lib/validators";

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

  const course = await prisma.course.findUnique({
    where: { id: cId },
    include: {
      _count: { select: { topics: true, surveys: true } },
    },
  });
  if (!course) {
    return NextResponse.json({ error: "Kurs hittades inte" }, { status: 404 });
  }
  return NextResponse.json(course);
}

/** Kursinställningar. Just nu bara flashcardläget. */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ courseId: string }> }
) {
  const authError = await requireCourseAccess(params);
  if (authError) return authError;

  const { courseId } = await params;
  const cId = Number(courseId);
  if (isNaN(cId)) {
    return NextResponse.json({ error: "Ogiltigt kurs-ID" }, { status: 400 });
  }

  try {
    const body = await request.json();
    const parsed = courseSettingsSchema.parse(body);
    const course = await prisma.course.update({
      where: { id: cId },
      data: parsed,
    });
    return NextResponse.json({
      id: course.id,
      flashcardMode: course.flashcardMode,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
