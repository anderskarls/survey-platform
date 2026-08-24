import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createQuestionSchema } from "@/lib/validators";
import { handleApiError } from "@/lib/api-helpers";
import { requireAdminScope, requireTopicAccess } from "@/lib/require-auth";
import { questionScopeWhere } from "@/lib/authz";
import { questionListInclude } from "@/lib/question-edit";

export async function GET(request: NextRequest) {
  const scope = await requireAdminScope();
  if (scope instanceof NextResponse) return scope;

  const { searchParams } = request.nextUrl;
  const topicId = searchParams.get("topicId");
  const type = searchParams.get("type");

  // Den globala frågebanken visar bara frågor ur kurser anroparen når.
  // Utan det här filtret läcker vyn hela plattformens frågor.
  const where: Record<string, unknown> = { ...questionScopeWhere(scope) };
  if (topicId) {
    const tid = Number(topicId);
    if (isNaN(tid)) {
      return NextResponse.json({ error: "Ogiltigt ämnes-ID" }, { status: 400 });
    }
    where.topicId = tid;
  }
  if (type) where.type = type;

  const questions = await prisma.question.findMany({
    where,
    include: questionListInclude,
    orderBy: { id: "desc" },
  });
  return NextResponse.json(questions);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { text, type, topicId, options, correctOptionIndex, subskill, config, exemplars } =
      createQuestionSchema.parse(body);

    // Kursen kommer ur ämnet frågan läggs i - annars kunde en lärare skapa
    // frågor i en kurs hen inte når genom att skicka ett främmande topicId.
    const authError = await requireTopicAccess(topicId);
    if (authError) return authError;
    if (type === "SORTING" && !config) {
      return NextResponse.json(
        { error: "Sorteringsfrågor kräver config med categories och items" },
        { status: 400 }
      );
    }

    const question = await prisma.question.create({
      data: {
        text,
        type,
        topicId,
        subskill: subskill ?? (type === "SORTING" ? "kategorisera" : undefined),
        config: config ?? undefined,
        exemplars: exemplars ?? undefined,
        options:
          type === "MULTIPLE_CHOICE" && options?.length
            ? {
                create: options.map((o, i) => ({
                  text: o.trim(),
                  isCorrect: i === correctOptionIndex,
                })),
              }
            : undefined,
      },
      include: { options: true, topic: true },
    });
    return NextResponse.json(question, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
