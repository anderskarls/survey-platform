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
  type QuestionForEdit,
} from "@/lib/question-edit";

type LoadResult =
  | { error: NextResponse; question?: undefined; courseId?: undefined }
  | { error?: undefined; question: QuestionForEdit; courseId: number };

async function loadQuestionForCourse(
  courseId: string,
  questionId: string
): Promise<LoadResult> {
  const cId = Number(courseId);
  const qId = Number(questionId);
  if (isNaN(cId) || isNaN(qId)) {
    return { error: NextResponse.json({ error: "Ogiltigt ID" }, { status: 400 }) };
  }

  const question = await prisma.question.findUnique({
    where: { id: qId },
    include: questionListInclude,
  });

  if (!question) {
    return {
      error: NextResponse.json({ error: "Fråga hittades inte" }, { status: 404 }),
    };
  }

  if (question.topic.courseId !== cId) {
    return {
      error: NextResponse.json(
        { error: "Frågan tillhör inte denna kurs" },
        { status: 403 }
      ),
    };
  }

  return { question, courseId: cId };
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ courseId: string; questionId: string }> }
) {
  const authError = await requireAdmin();
  if (authError) return authError;

  try {
    const { courseId, questionId } = await params;
    const loaded = await loadQuestionForCourse(courseId, questionId);
    if (loaded.error) return loaded.error;

    const input = updateQuestionSchema.parse(await request.json());
    if (input.topicId !== undefined && input.topicId !== loaded.question.topicId) {
      await assertTopicInSameCourse(input.topicId, loaded.courseId);
    }

    const { question, impact } = await applyQuestionUpdate(loaded.question, input);
    return NextResponse.json({ question, impact });
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
  { params }: { params: Promise<{ courseId: string; questionId: string }> }
) {
  const authError = await requireAdmin();
  if (authError) return authError;

  try {
    const { courseId, questionId } = await params;
    const loaded = await loadQuestionForCourse(courseId, questionId);
    if (loaded.error) return loaded.error;

    await prisma.question.delete({ where: { id: loaded.question.id } });

    return NextResponse.json({
      success: true,
      deletedAnswers: loaded.question._count.answers,
      deletedPracticeAttempts: loaded.question._count.practiceAttempts,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
