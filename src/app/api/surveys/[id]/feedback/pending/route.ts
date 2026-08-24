import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSurveyAccess } from "@/lib/require-auth";

const TRIVIAL_VALUES = new Set(["?", ".", "!", "1", "-", ".."]);

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const surveyId = Number(id);
  if (isNaN(surveyId)) {
    return NextResponse.json({ error: "Ogiltigt enkät-ID" }, { status: 400 });
  }

  const authError = await requireSurveyAccess(surveyId);
  if (authError) return authError;

  const survey = await prisma.survey.findUnique({
    where: { id: surveyId },
    include: {
      questions: {
        include: { question: true },
        orderBy: { order: "asc" },
      },
      responses: {
        include: {
          student: true,
          answers: true,
        },
      },
    },
  });

  if (!survey) {
    return NextResponse.json({ error: "Enkät hittades inte" }, { status: 404 });
  }

  const pendingQuestions = survey.questions
    .filter((sq) => sq.question.type === "FREE_TEXT")
    .map((sq) => {
      const q = sq.question;
      const answersWithoutFeedback = survey.responses.flatMap((r) =>
        r.answers
          .filter(
            (a) =>
              a.questionId === q.id &&
              !a.feedback &&
              a.value.trim().length > 2 &&
              !TRIVIAL_VALUES.has(a.value.trim())
          )
          .map((a) => ({
            answer_id: a.id,
            student_number: r.student.number,
            value: a.value,
          }))
      );

      return {
        question_id: q.id,
        question_text: q.text,
        pending_count: answersWithoutFeedback.length,
        answers: answersWithoutFeedback,
      };
    })
    .filter((q) => q.pending_count > 0);

  return NextResponse.json({
    survey: { id: survey.id, title: survey.title },
    total_pending: pendingQuestions.reduce(
      (sum, q) => sum + q.pending_count,
      0
    ),
    questions: pendingQuestions,
  });
}
