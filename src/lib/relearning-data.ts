import { prisma } from "@/lib/prisma";
import {
  AttemptRecord,
  PracticeCandidate,
  QuestionRelearningState,
  buildRelearningStates,
} from "@/lib/relearning";

export interface RelearningData {
  states: Map<number, QuestionRelearningState>;
  candidates: PracticeCandidate[];
}

/**
 * Laddar elevens samlade försökshistorik (skarpa quiz-svar + övningsförsök)
 * för flervalsfrågor och beräknar ominlärningsstatus. Poolen = frågor eleven
 * någon gång missat (fel eller "Jag är inte säker").
 */
export async function loadRelearningData(
  studentId: number,
  now: Date = new Date()
): Promise<RelearningData> {
  const [answers, practice] = await Promise.all([
    prisma.answer.findMany({
      where: {
        response: { studentId },
        question: { type: "MULTIPLE_CHOICE" },
      },
      select: {
        questionId: true,
        isCorrect: true,
        response: { select: { createdAt: true } },
        question: { select: { topicId: true } },
      },
    }),
    prisma.practiceAttempt.findMany({
      where: { studentId },
      select: {
        questionId: true,
        isCorrect: true,
        createdAt: true,
        question: { select: { topicId: true } },
      },
    }),
  ]);

  const attempts: AttemptRecord[] = [
    ...answers.map((a) => ({
      questionId: a.questionId,
      isCorrect: a.isCorrect,
      createdAt: a.response.createdAt,
    })),
    ...practice.map((p) => ({
      questionId: p.questionId,
      isCorrect: p.isCorrect,
      createdAt: p.createdAt,
    })),
  ];

  const topicByQuestion = new Map<number, number>();
  for (const a of answers) topicByQuestion.set(a.questionId, a.question.topicId);
  for (const p of practice) topicByQuestion.set(p.questionId, p.question.topicId);

  const states = buildRelearningStates(attempts, now);
  const candidates: PracticeCandidate[] = Array.from(states.keys()).map(
    (questionId) => ({
      questionId,
      topicId: topicByQuestion.get(questionId) ?? 0,
    })
  );

  return { states, candidates };
}
