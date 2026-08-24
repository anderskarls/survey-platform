import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCourseAccess } from "@/lib/require-auth";
import { createAssignmentFeedbackSchema } from "@/lib/validators";
import { handleApiError } from "@/lib/api-helpers";

export async function POST(
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

    const course = await prisma.course.findUnique({
      where: { id: cId },
      select: { id: true },
    });
    if (!course) {
      return NextResponse.json({ error: "Kurs hittades inte" }, { status: 404 });
    }

    const body = await request.json();
    const { feedbacks } = createAssignmentFeedbackSchema.parse(body);

    const requestedNumbers = Array.from(
      new Set(feedbacks.map((f) => f.student_number))
    );
    const students = await prisma.student.findMany({
      where: { courseId: cId, number: { in: requestedNumbers } },
      select: { id: true, number: true },
    });
    const numberToStudentId = new Map(students.map((s) => [s.number, s.id]));

    const toCreate: { studentId: number; title: string; content: string }[] = [];
    const skippedNumbers: number[] = [];
    for (const fb of feedbacks) {
      const studentId = numberToStudentId.get(fb.student_number);
      if (studentId === undefined) {
        skippedNumbers.push(fb.student_number);
        continue;
      }
      toCreate.push({
        studentId,
        title: fb.title,
        content: fb.content,
      });
    }

    let created = 0;
    if (toCreate.length > 0) {
      const result = await prisma.assignmentFeedback.createMany({
        data: toCreate,
      });
      created = result.count;
    }

    return NextResponse.json(
      {
        success: true,
        created,
        skipped: skippedNumbers.length,
        skipped_numbers: skippedNumbers,
        message: `Feedback skapad för ${created} elev${created === 1 ? "" : "er"}${
          skippedNumbers.length > 0
            ? `, ${skippedNumbers.length} hoppade över (elev ej i kursen)`
            : ""
        }`,
      },
      { status: 201 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
