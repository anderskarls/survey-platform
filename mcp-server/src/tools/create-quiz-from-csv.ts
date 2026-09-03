import { prisma } from "../prisma.js";
import { nanoid } from "nanoid";
import Papa from "papaparse";
import { optionCreateData, parseQuestionRow } from "../lib/csv-question.js";

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
 * Luckfragor (type=CLOZE) anvander i stallet kolumnen config, med markoren
 * ___ i texten dar ordet ska sta:
 *   topic,type,text,config
 *   "Vecka 01",CLOZE,"Her ___ on me was huge.","{""answer"":""influence""}"
 *
 * Luckmeningskort (type=CLOZE_CARD) har samma format men vands i stallet for
 * att skrivas: framsidan ar meningen med luckan, baksidan samma mening med
 * ordet ifyllt, och eleven skattar sig sjalv.
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
        const parsed = parseQuestionRow(row);
        if (!parsed) continue;

        const topic = await tx.topic.upsert({
          where: { courseId_name: { courseId, name: parsed.topicName } },
          update: {},
          create: { name: parsed.topicName, courseId },
        });

        const question = await tx.question.create({
          data: {
            text: parsed.text,
            type: parsed.type,
            topicId: topic.id,
            config:
              parsed.config === undefined ? undefined : (parsed.config as never),
            subskill: parsed.subskill,
            exemplars:
              parsed.exemplars === undefined
                ? undefined
                : (parsed.exemplars as never),
            options: optionCreateData(parsed),
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
