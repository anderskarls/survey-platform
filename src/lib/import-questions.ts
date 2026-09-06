import { Prisma } from "@prisma/client";
import { questionCreateData, type CsvQuestionRow } from "@/lib/csv";

/**
 * Importen av frågerader - delad av /api/questions/import och
 * /api/courses/[courseId]/questions/import.
 *
 * En fråga identifieras av (topic, text) inom kursen. Finns den redan
 * uppdateras den i stället för att skapas en gång till, så att ett
 * genererat CSV (tidslinjens quiz.py, veckotesten) kan köras om utan att
 * banken fylls med dubbletter. Att uppdatera i stället för att ta bort och
 * skapa nytt bevarar frågans id, och därmed elevernas övningshistorik
 * (PracticeAttempt, FSRS-schemat) och gamla svar.
 *
 * Vad CSV-raden säger gäller: typ, delfärdighet, config och alternativen
 * skrivs över. Exemplars skrivs bara över när raden har några - de kan ha
 * lagts till för hand i admin och ska inte försvinna för att kolumnen saknas
 * i filen. Config nollas när frågan byter typ, annars lämnas den.
 */

export interface ImportResult {
  /** Nya frågor */
  imported: number;
  /** Befintliga frågor som fick sitt innehåll uppdaterat */
  updated: number;
}

/** Delmängden av transaktionsklienten importen använder - gör den testbar utan databas. */
export type ImportTx = Pick<Prisma.TransactionClient, "topic" | "question">;

export async function importQuestionRows(
  tx: ImportTx,
  courseId: number,
  rows: CsvQuestionRow[]
): Promise<ImportResult> {
  const result: ImportResult = { imported: 0, updated: 0 };

  const uniqueTopics = [...new Set(rows.map((r) => r.topic))];
  const topicMap = new Map<string, number>();
  for (const name of uniqueTopics) {
    const topic = await tx.topic.upsert({
      where: { courseId_name: { courseId, name } },
      update: {},
      create: { name, courseId },
    });
    topicMap.set(name, topic.id);
  }

  for (const row of rows) {
    const topicId = topicMap.get(row.topic)!;
    const data = questionCreateData(row);

    const existing = await tx.question.findFirst({
      where: { topicId, text: row.text },
      include: { options: { orderBy: { id: "asc" } } },
    });

    if (!existing) {
      await tx.question.create({ data: { ...data, topicId } });
      result.imported++;
      continue;
    }

    const nyaAlternativ = data.options?.create ?? [];
    const alternativLika =
      nyckel(existing.options) === nyckel(nyaAlternativ as OptionLik[]);
    const typbyte = existing.type !== data.type;

    await tx.question.update({
      where: { id: existing.id },
      data: {
        type: data.type,
        subskill: data.subskill ?? null,
        config: data.config ?? (typbyte ? Prisma.DbNull : undefined),
        exemplars: data.exemplars ?? undefined,
        options: alternativLika
          ? undefined
          : { deleteMany: {}, create: nyaAlternativ },
      },
    });
    result.updated++;
  }

  return result;
}

interface OptionLik {
  text: string;
  isCorrect: boolean;
}

/** Alternativen som jämförbar sträng: ordning, text och vilket som är rätt. */
function nyckel(options: OptionLik[]): string {
  return JSON.stringify(options.map((o) => [o.text, o.isCorrect]));
}
