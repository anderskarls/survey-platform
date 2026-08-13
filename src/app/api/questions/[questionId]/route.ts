import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-auth";
import { handleApiError } from "@/lib/api-helpers";
import { updateQuestionSchema } from "@/lib/validators";
import {
  applyQuestionUpdate,
  assertTopicInSameCourse,
  QuestionEditError,
  questionListInclude,
} from "@/lib/question-edit";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ questionId: string }> }
) {
  const authError = await requireAdmin();
  if (authError) return authError;

  try {
    const { questionId } = await params;
    const qId = Number(questionId);
    if (isNaN(qId)) {
      return NextResponse.json({ error: "Ogiltigt fråge-ID" }, { status: 400 });
    }

    const question = await prisma.question.findUnique({
      where: { id: qId },
      include: questionListInclude,
    });

    if (!question) {
      return NextResponse.json({ error: "Fråga hittades inte" }, { status: 404 });
    }

    const input = updateQuestionSchema.parse(await request.json());
    if (input.topicId !== undefined && input.topicId !== question.topicId) {
      await assertTopicInSameCourse(input.topicId, question.topic.courseId);
    }

    const result = await applyQuestionUpdate(question, input);
    return NextResponse.json({ question: result.question, impact: result.impact });
  } catch (error) {
    if (error instanceof QuestionEditError) {
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
  { params }: { params: Promise<{ questionId: string }> }
) {
  const authError = await requireAdmin();
  if (authError) return authError;

  try {
    const { questionId } = await params;
    const qId = Number(questionId);
    if (isNaN(qId)) {
      return NextResponse.json({ error: "Ogiltigt fråge-ID" }, { status: 400 });
    }

    const question = await prisma.question.findUnique({
      where: { id: qId },
      select: { id: true, _count: { select: { answers: true, practiceAttempts: true } } },
    });

    if (!question) {
      return NextResponse.json(
        { error: "Fråga hittades inte" },
        { status: 404 }
      );
    }

    await prisma.question.delete({ where: { id: qId } });

    return NextResponse.json({
      success: true,
      deletedAnswers: question._count.answers,
      deletedPracticeAttempts: question._count.practiceAttempts,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
