import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateShareCode } from "@/lib/share-code";
import { handleApiError } from "@/lib/api-helpers";
import { requireAdmin, requireAdminScope } from "@/lib/require-auth";
import { courseScopeWhere } from "@/lib/authz";
import { fragorUtanforKursen } from "@/lib/kursgrans";
import { z } from "zod";

const createSurveyWithCourseSchema = z.object({
  title: z.string().min(1, "Titel krävs").max(200).transform((s) => s.trim()),
  description: z.string().max(1000).optional().default("").transform((s) => s.trim()),
  courseId: z.number().int().positive("Kurs-ID krävs"),
  questionIds: z.array(z.number().int().positive()).min(1, "Välj minst en fråga"),
});

export async function GET() {
  const scope = await requireAdminScope();
  if (scope instanceof NextResponse) return scope;

  const surveys = await prisma.survey.findMany({
    where: courseScopeWhere(scope),
    include: {
      // Lärarens provkonto räknas inte i klassens siffror (isTest)
      _count: {
        select: {
          questions: true,
          responses: { where: { student: { isTest: false } } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(surveys);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { title, description, courseId, questionIds } =
      createSurveyWithCourseSchema.parse(body);

    const authError = await requireAdmin(courseId);
    if (authError) return authError;

    // Samma kursgräns som kursvägen redan hade - se src/lib/kursgrans.ts
    const invalidIds = await fragorUtanforKursen(prisma, courseId, questionIds);
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
        shareCode: generateShareCode(),
        courseId,
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
