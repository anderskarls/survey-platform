import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSurveyAccess } from "@/lib/require-auth";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const surveyId = Number(id);
  if (isNaN(surveyId)) {
    return NextResponse.json({ error: "Ogiltigt enkät-ID" }, { status: 400 });
  }

  const authError = await requireSurveyAccess(surveyId);
  if (authError) return authError;

  const detailed = request.nextUrl.searchParams.get("detailed") === "true";

  if (detailed) {
    return getDetailed(surveyId);
  }
  return getSummary(surveyId);
}

async function getSummary(surveyId: number) {
  const survey = await prisma.survey.findUnique({
    where: { id: surveyId },
    include: {
      questions: {
        include: { question: { include: { options: true } } },
        orderBy: { order: "asc" },
      },
      // Lärarens provkonto hör inte till klassens siffror
      responses: { where: { student: { isTest: false } }, include: { answers: true } },
    },
  });

  if (!survey) {
    return NextResponse.json({ error: "Enkät hittades inte" }, { status: 404 });
  }

  const questions = survey.questions.map((sq) => {
    const q = sq.question;
    const questionAnswers = survey.responses.flatMap((r) =>
      r.answers.filter((a) => a.questionId === q.id)
    );

    const answeredBy = questionAnswers.length;

    if (q.type === "MULTIPLE_CHOICE") {
      const optionCounts: Record<string, number> = {};
      q.options.forEach((o) => (optionCounts[o.text] = 0));
      questionAnswers.forEach((a) => {
        optionCounts[a.value] = (optionCounts[a.value] || 0) + 1;
      });
      return { id: q.id, text: q.text, type: q.type, optionCounts, answeredBy };
    }

    return {
      id: q.id,
      text: q.text,
      type: q.type,
      textResponses: questionAnswers.map((a) => a.value),
      answeredBy,
    };
  });

  return NextResponse.json({
    survey: {
      id: survey.id,
      title: survey.title,
      responseCount: survey.responses.length,
      totalQuestions: survey.questions.length,
    },
    questions,
  });
}

async function getDetailed(surveyId: number) {
  const survey = await prisma.survey.findUnique({
    where: { id: surveyId },
    include: {
      questions: {
        include: { question: { include: { options: true } } },
        orderBy: { order: "asc" },
      },
      responses: {
        where: { student: { isTest: false } },
        include: { student: true, answers: true },
      },
    },
  });

  if (!survey) {
    return NextResponse.json({ error: "Enkät hittades inte" }, { status: 404 });
  }

  const isQuiz = survey.mode === "QUIZ";

  const questions = survey.questions.map((sq) => {
    const q = sq.question;
    const correctOption = q.options.find((o) => o.isCorrect);

    const answersWithStudent = survey.responses.flatMap((r) =>
      r.answers
        .filter((a) => a.questionId === q.id)
        .map((a) => ({
          value: a.value,
          studentNumber: r.student.number,
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
        correctAnswer: isQuiz ? correctOption?.text ?? null : null,
        answeredBy,
        studentAnswers: answersWithStudent.map((a) => ({
          studentNumber: a.studentNumber,
          value: a.value,
          isCorrect: a.isCorrect,
        })),
      };
    }

    return {
      id: q.id,
      text: q.text,
      type: q.type,
      textResponses: answersWithStudent.map((a) => a.value),
      answeredBy,
      studentAnswers: answersWithStudent.map((a) => ({
        studentNumber: a.studentNumber,
        value: a.value,
      })),
    };
  });

  return NextResponse.json({
    survey: {
      id: survey.id,
      title: survey.title,
      mode: survey.mode,
      responseCount: survey.responses.length,
      totalQuestions: survey.questions.length,
    },
    questions,
  });
}
