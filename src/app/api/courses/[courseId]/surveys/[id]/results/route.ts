import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { answerLabel } from "@/lib/blank-answer";
import { requireCourseAccess } from "@/lib/require-auth";
import { senasteSvarPerElev } from "@/lib/svarsurval";
import { raknaSvarsalternativ } from "@/lib/svarsvarden";
import { formateraSorteringssvar } from "@/lib/formaga";
import { beskrivTimelineFacit, formateraTidslinjesvar } from "@/lib/tidslinje";

// Ett sorterings- eller tidslinjesvar är JSON i databasen. Läraren ska läsa
// "Ångmaskinen: Teknik" respektive "3000 f.Kr.", inte datastrukturen.
function lasbart(value: string): string {
  return formateraSorteringssvar(value) ?? formateraTidslinjesvar(value) ?? value;
}


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
      // Lärarens provkonto hör inte till klassens siffror
      responses: {
        where: { student: { isTest: false } },
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

  // Omtag: en elev väger en gång, senaste inlämningen gäller
  survey.responses = senasteSvarPerElev(survey.responses);

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
      const { optionCounts, osakra } = raknaSvarsalternativ(
        q.options.map((o) => o.text),
        answersWithStudent.map((a) => a.value)
      );
      return {
        id: q.id,
        text: q.text,
        type: q.type,
        optionCounts,
        osakra,
        correctAnswer: isQuiz ? correctOption?.text || null : null,
        studentAnswers: answersWithStudent,
        answeredBy,
      };
    }

    // Tidslinjefrågan rättas mot facit precis som flervalsfrågan, men har inga
    // alternativ att fördela svaren över. Läraren får antalet rätt och facit i
    // klartext i stället för ett stapeldiagram.
    if (q.type === "TIMELINE") {
      return {
        id: q.id,
        text: q.text,
        type: q.type,
        ratt: answersWithStudent.filter((a) => a.isCorrect === true).length,
        correctAnswer: beskrivTimelineFacit(q.config),
        answeredBy,
        studentAnswers: answersWithStudent.map((a) => ({
          studentNumber: a.studentNumber,
          value: lasbart(a.value),
          isCorrect: a.isCorrect,
        })),
      };
    }

    return {
      id: q.id,
      text: q.text,
      type: q.type,
      textResponses: answersWithStudent.map((a) => lasbart(a.value)),
      studentAnswers: answersWithStudent.map((a) => ({
        ...a,
        value: lasbart(a.value),
      })),
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
