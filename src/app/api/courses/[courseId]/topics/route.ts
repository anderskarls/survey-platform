import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createTopicSchema } from "@/lib/validators";
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

  const topics = await prisma.topic.findMany({
    where: { courseId: cId },
    include: { _count: { select: { questions: true } } },
    orderBy: { name: "asc" },
  });
  return NextResponse.json(topics);
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
    const { name } = createTopicSchema.parse(body);
    const topic = await prisma.topic.create({
      data: { name, courseId: cId },
    });
    return NextResponse.json(topic, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
