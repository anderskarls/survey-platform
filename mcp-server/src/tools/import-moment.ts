import { prisma } from "../prisma.js";
import { Prisma } from "@prisma/client";
import { nanoid } from "nanoid";
import Papa from "papaparse";

export type SurveyMode = "SURVEY" | "QUIZ";

interface AssignmentInput {
  title: string;
  csv_content: string;
  lesson?: number;
  mode?: SurveyMode;
  lock_mode?: boolean;
}

interface LessonOutline {
  n: number;
  title: string;
  note?: string;
  date?: string; // rekommenderat datum (ISO YYYY-MM-DD), självgående - inte ett lås
  week?: string; // valfri veckoetikett, t.ex. "v.17"
}

export async function importMoment(
  courseId: number,
  title: string,
  assignments: AssignmentInput[],
  lessons: LessonOutline[],
  description?: string,
  period?: string,
  goals?: string[]
): Promise<string> {
  const result = await prisma.$transaction(
    async (tx) => {
      const unit = await tx.unit.create({
        data: {
          title,
          description: description || "",
          lessons: lessons as unknown as Prisma.InputJsonValue,
          period: period ?? null,
          goals: goals ?? [],
          courseId,
        },
      });

      const created: {
        title: string;
        lesson: number | null;
        shareCode: string;
        url: string;
        questionCount: number;
      }[] = [];

      for (const a of assignments) {
        const parsed = Papa.parse(a.csv_content, { header: true, skipEmptyLines: true });
        const rows = parsed.data as Record<string, string>[];
        const shareCode = nanoid(8);
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
          throw new Error(`Uppgiften "${a.title}" innehöll inga giltiga frågor (text saknas).`);
        }

        const survey = await tx.survey.create({
          data: {
            title: a.title,
            description: "",
            shareCode,
            mode: a.mode ?? "QUIZ",
            lockMode: a.lock_mode ?? false,
            courseId,
            unitId: unit.id,
            lesson: a.lesson ?? null,
            questions: {
              create: questionIds.map((qId, index) => ({ questionId: qId, order: index })),
            },
          },
        });

        created.push({
          title: survey.title,
          lesson: a.lesson ?? null,
          shareCode,
          url: `/s/${shareCode}`,
          questionCount: questionIds.length,
        });
      }

      return { unit, created };
    },
    { timeout: 60_000, maxWait: 5_000 }
  );

  return JSON.stringify(
    { unitId: result.unit.id, title: result.unit.title, assignments: result.created },
    null,
    2
  );
}
