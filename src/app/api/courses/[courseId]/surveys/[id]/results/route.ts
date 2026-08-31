import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { answerLabel } from "@/lib/blank-answer";
import { requireCourseAccess } from "@/lib/require-auth";

export async function GET(
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

  const survey = await prisma.survey.findUnique({
    where: { id: surveyId },
    include: {
      questions: {
        include: {
          question: { include: { options: true } },
        },
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

  // Verify survey belongs to this course
  if (survey.courseId !== cId) {
    return NextResponse.json({ error: "Enkäten tillhör inte denna kurs" }, { status: 403 });
  }

  const isQuiz = survey.mode === "QUIZ";

  const questions = survey.questions.map((sq) => {
    const q = sq.question;
    const correctOption = q.options.find((o) => o.isCorrect);

    const answersWithStudent = survey.responses.flatMap((r) =>
      r.answers
        .filter((a) => a.questionId === q.id)
        .map((a) => ({
          studentNumber: r.student.number,
          // Tom rad = obesvarad fråga. Se blank-answer.ts.
          value: answerLabel(a.value),
          isCorrect: a.isCorrect,
        }))
    );

    const answeredBy = answersWithStudent.length;

    if (q.type === "MULTIPLE_CHOICE") {
      const optionCounts: Record<string, number> = {};
      q.options.forEach((o) => (optionCounts[o.text] = 0));
      answersWithStudent.forEach((a) => {
        optionCounts[a.value] = (optionCounts[a.value] || 0) + 1;
      });
      return {
        id: q.id,
        text: q.text,
        type: q.type,
        optionCounts,
        correctAnswer: isQuiz ? correctOption?.text || null : null,
        studentAnswers: answersWithStudent,
        answeredBy,
      };
    }

    return {
      id: q.id,
      text: q.text,
      type: q.type,
      textResponses: answersWithStudent.map((a) => a.value),
      studentAnswers: answersWithStudent,
      answeredBy,
    };
  });

  // Per-student stats: completion för alla lägen, score endast för quiz
  const studentStats = survey.responses
    .map((r) => {
      const base = {
        studentNumber: r.student.number,
        answered: r.answers.length,
      };
      if (!isQuiz) return base;
      const correct = r.answers.filter((a) => a.isCorrect === true).length;
      const total = r.answers.filter((a) => a.isCorrect !== null).length;
      return {
        ...base,
        correct,
        total,
        percentage: total > 0 ? Math.round((correct / total) * 100) : 0,
      };
    })
    .sort((a, b) => a.studentNumber - b.studentNumber);

  return NextResponse.json({
    survey: {
      id: survey.id,
      title: survey.title,
      mode: survey.mode,
      responseCount: survey.responses.length,
      totalQuestions: survey.questions.length,
    },
    questions,
    studentStats,
  });
}
