import { lasbartSvar } from "../tabellsvar.js";
import { prisma } from "../prisma.js";

export async function getStudentProgress(courseId: number, studentNumber: number): Promise<string> {
  const student = await prisma.student.findUnique({
    where: { courseId_number: { courseId, number: studentNumber } },
  });

  if (!student) {
    return JSON.stringify({
      error: `Elev #${studentNumber} finns inte i kurs ${courseId}`,
    });
  }

  const responses = await prisma.response.findMany({
    where: { studentId: student.id },
    include: {
      survey: true,
      answers: {
        include: { question: true },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  if (responses.length === 0) {
    return JSON.stringify({
      error: `Inga svar hittades för elev #${studentNumber} i kurs ${courseId}`,
    });
  }

  const surveys = responses.map((r) => {
    const correct = r.answers.filter((a) => a.isCorrect === true).length;
    const total = r.answers.filter((a) => a.isCorrect !== null).length;
    return {
      surveyId: r.survey.id,
      surveyTitle: r.survey.title,
      mode: r.survey.mode,
      answeredAt: r.createdAt.toISOString(),
      score: r.survey.mode === "QUIZ" ? { correct, total, percentage: total > 0 ? Math.round((correct / total) * 100) : 0 } : null,
      answers: r.answers.map((a) => ({
        questionId: a.questionId,
        questionText: a.question.text,
        questionType: a.question.type,
        value: lasbartSvar(a.value),
        isCorrect: a.isCorrect,
      })),
    };
  });

  return JSON.stringify(
    {
      studentNumber,
      courseId,
      totalSurveys: surveys.length,
      surveys,
    },
    null,
    2
  );
}
