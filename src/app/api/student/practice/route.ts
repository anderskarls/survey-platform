import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { practiceAttemptSchema } from "@/lib/validators";
import { handleApiError } from "@/lib/api-helpers";
import { getStudentSession } from "@/lib/student-session";
import { AttemptRecord, buildQuestionState } from "@/lib/relearning";

export async function POST(request: NextRequest) {
  try {
    const session = await getStudentSession();
    if (!session) {
      return NextResponse.json(
        { error: "Du måste vara inloggad för att öva." },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { questionId, value } = practiceAttemptSchema.parse(body);

    const question = await prisma.question.findUnique({
      where: { id: questionId },
      include: { options: true, topic: { select: { courseId: true } } },
    });
    if (!question || question.topic.courseId !== session.courseId) {
      return NextResponse.json(
        { error: "Frågan hittades inte" },
        { status: 404 }
      );
    }
    if (question.type !== "MULTIPLE_CHOICE") {
      return NextResponse.json(
        { error: "Bara flervalsfrågor kan övas" },
        { status: 400 }
      );
    }

    // Samma rättningslogik som /api/surveys/[id]/respond
    let isCorrect: boolean | null = null;
    const correctOption = question.options.find((o) => o.isCorrect);
    if (value !== "__UNSURE__") {
      isCorrect = correctOption ? value === correctOption.text : null;
    }

    await prisma.practiceAttempt.create({
      data: { studentId: session.studentId, questionId, value, isCorrect },
    });

    // Räkna om frågans status med hela historiken (quiz-svar + övningar)
    const [answers, practice] = await Promise.all([
      prisma.answer.findMany({
        where: { questionId, response: { studentId: session.studentId } },
        select: { isCorrect: true, response: { select: { createdAt: true } } },
      }),
      prisma.practiceAttempt.findMany({
        where: { questionId, studentId: session.studentId },
        select: { isCorrect: true, createdAt: true },
      }),
    ]);
    const attempts: AttemptRecord[] = [
      ...answers.map((a) => ({
        questionId,
        isCorrect: a.isCorrect,
        createdAt: a.response.createdAt,
      })),
      ...practice.map((p) => ({
        questionId,
        isCorrect: p.isCorrect,
        createdAt: p.createdAt,
      })),
    ];
    const state = buildQuestionState(attempts);

    return NextResponse.json(
      {
        isCorrect,
        correctAnswer: correctOption?.text ?? null,
        streakDays: state?.streakDays ?? 0,
        graduated: state?.status === "graduated",
        daysUntilDue: state?.daysUntilDue ?? null,
      },
      { status: 201 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
