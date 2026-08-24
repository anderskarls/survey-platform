import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCourseAccess } from "@/lib/require-auth";

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
