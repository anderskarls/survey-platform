import { prisma } from "../prisma.js";
import { nanoid } from "nanoid";

export type SurveyMode = "SURVEY" | "QUIZ";

export async function createSurvey(
  courseId: number,
  title: string,
  questionIds: number[],
  description?: string,
  mode: SurveyMode = "SURVEY",
  lockMode: boolean = false
): Promise<string> {
  const shareCode = nanoid(8);

  const survey = await prisma.survey.create({
    data: {
      title,
      description: description || "",
      shareCode,
      mode,
      lockMode,
      courseId,
      questions: {
        create: questionIds.map((qId, index) => ({
          questionId: qId,
          order: index,
        })),
      },
    },
  });

  return JSON.stringify(
    {
      id: survey.id,
      title: survey.title,
      mode: survey.mode,
      lockMode: survey.lockMode,
      shareCode,
      questionCount: questionIds.length,
      url: `/s/${shareCode}`,
    },
    null,
    2
  );
}
