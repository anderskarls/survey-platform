import { prisma } from "../prisma.js";
import { nanoid } from "nanoid";
import Papa from "papaparse";

export type SurveyMode = "SURVEY" | "QUIZ";

/**
 * Importerar fragor fran CSV OCH skapar en enkat/quiz av exakt de
 * importerade fragorna i ett enda anrop. Loser problemet att man annars
 * maste kanna till de nyskapade fraga-ID:na for att kunna anropa
 * create_survey separat.
 *
 * CSV-format (samma som import_questions):
 *   topic,type,text,option1,option2,option3,option4,correctAnswer
 *
 * Fragornas ordning i enkaten foljer raderna i CSV:n.
 */
export async function createQuizFromCsv(
  courseId: number,
  title: string,
  csvContent: string,
  description?: string,
  mode: SurveyMode = "QUIZ",
  lockMode: boolean = false
): Promise<string> {
  const parsed = Papa.parse(csvContent, { header: true, skipEmptyLines: true });
  const rows = parsed.data as Record<string, string>[];

  const shareCode = nanoid(8);

  const result = await prisma.$transaction(
    async (tx) => {
      const questionIds: number[] = [];

      for (const row of rows) {
        const topicName = row.topic?.trim() || "Övrigt";
        const text = row.text?.trim();
        if (!text) continue;

        const rawType = row.type?.trim().toUpperCase();
        const type =
          rawType === "FREE_TEXT"
            ? "FREE_TEXT"
            : rawType === "REFLECTION"
              ? "REFLECTION"
              : "MULTIPLE_CHOICE";

        const options: string[] = [];
        for (let i = 1; i <= 10; i++) {
          const val = row[`option${i}`]?.trim();
          if (val) options.push(val);
        }
        const correctAnswer = row.correctAnswer?.trim();

        const topic = await tx.topic.upsert({
          where: { courseId_name: { courseId, name: topicName } },
          update: {},
          create: { name: topicName, courseId },
        });

        const question = await tx.question.create({
          data: {
            text,
            type,
            topicId: topic.id,
            options:
              type === "MULTIPLE_CHOICE" && options.length > 0
                ? {
                    create: options.map((o) => ({
                      text: o,
                      isCorrect: correctAnswer ? o === correctAnswer : false,
                    })),
                  }
                : undefined,
          },
        });

        questionIds.push(question.id);
      }

      if (questionIds.length === 0) {
        throw new Error("CSV:n innehöll inga giltiga frågor (text saknas).");
      }

      const survey = await tx.survey.create({
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

      return { survey, questionCount: questionIds.length };
    },
    { timeout: 30_000, maxWait: 5_000 }
  );

  return JSON.stringify(
    {
      id: result.survey.id,
      title: result.survey.title,
      mode: result.survey.mode,
      lockMode: result.survey.lockMode,
      shareCode,
      questionCount: result.questionCount,
      url: `/s/${shareCode}`,
    },
    null,
    2
  );
}
