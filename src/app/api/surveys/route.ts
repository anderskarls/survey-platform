import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateShareCode } from "@/lib/share-code";
import { handleApiError } from "@/lib/api-helpers";
import { requireAdmin, requireAdminScope } from "@/lib/require-auth";
import { courseScopeWhere } from "@/lib/authz";
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
      _count: { select: { questions: true, responses: true } },
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

    // SurveyQuestion hindrar inte i sig att en fråga ur en annan kurs hamnar
    // i enkäten. Utan den här kontrollen vore enkäten en väg att läsa frågor
    // ur kurser man inte når - behörigheten på enkäten skulle inte hjälpa.
    const frammande = await prisma.question.count({
      where: { id: { in: questionIds }, topic: { courseId: { not: courseId } } },
    });
    if (frammande > 0) {
      return NextResponse.json(
        { error: "Enkäten innehåller frågor som inte tillhör kursen" },
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
