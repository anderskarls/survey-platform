import { prisma } from "../prisma.js";
import { senasteSvarPerElev } from "../svarsurval.js";
import { raknaSvarsalternativ } from "../svarsvarden.js";

export async function getResults(surveyId: number): Promise<string> {
  const survey = await prisma.survey.findUnique({
    where: { id: surveyId },
    include: {
      questions: {
        include: { question: { include: { options: true } } },
        orderBy: { order: "asc" },
      },
      // Lärarens provkonto räknas inte i klassens siffror (isTest)
      responses: {
        where: { student: { isTest: false } },
        include: { student: true, answers: true },
      },
    },
  });

  if (!survey) return JSON.stringify({ error: "Enkät hittades inte" });

  const isQuiz = survey.mode === "QUIZ";
  // Omtag: varje elev väger en gång, precis som i webbappens resultatvyer
  const responses = senasteSvarPerElev(survey.responses);

  const questions = survey.questions.map((sq) => {
    const q = sq.question;
    const correctOption = q.options.find((o) => o.isCorrect);
    const answersWithStudent = responses.flatMap((r) =>
      r.answers
        .filter((a) => a.questionId === q.id)
        .map((a) => ({ value: a.value, studentNumber: r.student.number, isCorrect: a.isCorrect }))
    );

    if (q.type === "MULTIPLE_CHOICE") {
      const { optionCounts, osakra } = raknaSvarsalternativ(
        q.options.map((o) => o.text),
        answersWithStudent.map((a) => a.value)
      );
      return {
        id: q.id, text: q.text, type: q.type, optionCounts, osakra,
        correctAnswer: isQuiz ? correctOption?.text || null : null,
        studentAnswers: answersWithStudent.map((a) => ({
          studentNumber: a.studentNumber, value: a.value, isCorrect: a.isCorrect,
        })),
      };
    }

    return {
      id: q.id,
      text: q.text,
      type: q.type,
      textResponses: answersWithStudent.map((a) => a.value),
      studentAnswers: answersWithStudent.map((a) => ({
        studentNumber: a.studentNumber, value: a.value,
      })),
    };
  });

  return JSON.stringify({
    survey: {
      id: survey.id,
      title: survey.title,
      mode: survey.mode,
      responseCount: responses.length,
    },
    questions,
  }, null, 2);
}
