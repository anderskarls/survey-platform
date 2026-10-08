import { lasbartSvar } from "../tabellsvar.js";
import { prisma } from "../prisma.js";

// Fetches free-text answers without feedback and returns them for Claude to review.
// Claude Desktop generates the feedback — no API calls needed.
export async function getFreeTextAnswers(
  surveyId: number,
  studentNumber?: number
): Promise<string> {
  const survey = await prisma.survey.findUnique({
    where: { id: surveyId },
    include: { course: true },
  });

  if (!survey) {
    throw new Error(`Enkät med ID ${surveyId} hittades inte`);
  }

  const whereClause: Record<string, unknown> = {
    response: { surveyId },
    question: { type: { in: ["FREE_TEXT", "TABLE"] } },
    feedback: null,
  };

  if (studentNumber) {
    whereClause.response = {
      ...whereClause.response as object,
      student: { number: studentNumber, courseId: survey.courseId },
    };
  }

  const answers = await prisma.answer.findMany({
    where: whereClause,
    include: {
      question: { include: { topic: true } },
      response: { include: { student: true } },
    },
  });

  if (answers.length === 0) {
    return studentNumber
      ? `Inga fritextsvar utan feedback hittades för elev ${studentNumber} i enkät "${survey.title}".`
      : `Inga fritextsvar utan feedback hittades i enkät "${survey.title}".`;
  }

  const lines = answers.map(
    (a) =>
      `[answer_id: ${a.id}] Elev ${a.response.student.number}\n` +
      `  Ämne: ${a.question.topic.name}\n` +
      `  Fråga: ${a.question.text}\n` +
      `  Svar: ${lasbartSvar(a.value)}`
  );

  return (
    `Enkät: "${survey.title}" (${survey.course.name})\n` +
    `${answers.length} fritextsvar utan feedback:\n\n` +
    lines.join("\n\n") +
    `\n\n---\nGenerera kort, konstruktiv feedback på svenska för varje svar (max 3-4 meningar per svar). ` +
    `Var uppmuntrande men ärlig. Bekräfta det som är bra, peka på brister, ge ett konkret förbättringstips.\n` +
    `Använd sedan save_feedback för att spara feedbacken med rätt answer_id.`
  );
}

// Saves feedback for a single answer (called by Claude after generating feedback)
export async function saveFeedback(
  answerId: number,
  feedback: string
): Promise<string> {
  const answer = await prisma.answer.findUnique({
    where: { id: answerId },
    include: {
      question: true,
      response: { include: { student: true } },
    },
  });

  if (!answer) {
    throw new Error(`Svar med ID ${answerId} hittades inte`);
  }

  if (answer.question.type !== "FREE_TEXT" && answer.question.type !== "TABLE") {
    throw new Error("Feedback kan bara ges på fritextsvar");
  }

  await prisma.answer.update({
    where: { id: answerId },
    data: { feedback },
  });

  return `Feedback sparad för elev ${answer.response.student.number}, fråga "${answer.question.text}"`;
}
