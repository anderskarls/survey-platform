import { describe, it, expect } from "vitest";
import { importQuestionRows, type ImportTx } from "./import-questions";
import { parseCsvContent } from "./csv";

/**
 * En minimal minnesdatabas med just de anrop importen gör. Poängen med
 * testerna är dubblettregeln - att samma fil två gånger ger samma bank -
 * inte Prisma, så Prisma är utbytt.
 */
interface Q {
  id: number;
  topicId: number;
  text: string;
  type: string;
  subskill: string | null;
  config: unknown;
  exemplars: unknown;
  options: { id: number; text: string; isCorrect: boolean }[];
}

type Alternativ = { text: string; isCorrect: boolean };
type Skapa = {
  topicId: number;
  text: string;
  type: string;
  subskill?: string | null;
  config?: unknown;
  exemplars?: unknown;
  options?: { create: Alternativ[] };
};
type Uppdatera = Partial<Omit<Skapa, "options">> & {
  options?: { deleteMany: object; create: Alternativ[] };
};

function minnesDb() {
  const topics: { id: number; courseId: number; name: string }[] = [];
  const questions: Q[] = [];
  let nastaId = 1;

  const tx = {
    topic: {
      upsert: async ({
        where,
        create,
      }: {
        where: { courseId_name: { courseId: number; name: string } };
        create: { courseId: number; name: string };
      }) => {
        const { courseId, name } = where.courseId_name;
        const finns = topics.find((x) => x.courseId === courseId && x.name === name);
        if (finns) return finns;
        const t = { id: nastaId++, ...create };
        topics.push(t);
        return t;
      },
    },
    question: {
      findFirst: async ({ where }: { where: { topicId: number; text: string } }) =>
        questions.find((q) => q.topicId === where.topicId && q.text === where.text) ?? null,
      create: async ({ data }: { data: Skapa }) => {
        const q: Q = {
          id: nastaId++,
          topicId: data.topicId,
          text: data.text,
          type: data.type,
          subskill: data.subskill ?? null,
          config: data.config,
          exemplars: data.exemplars,
          options: (data.options?.create ?? []).map((o) => ({ id: nastaId++, ...o })),
        };
        questions.push(q);
        return q;
      },
      update: async ({ where, data }: { where: { id: number }; data: Uppdatera }) => {
        const q = questions.find((x) => x.id === where.id)!;
        if (data.type !== undefined) q.type = data.type;
        if (data.subskill !== undefined) q.subskill = data.subskill;
        if (data.config !== undefined) q.config = data.config;
        if (data.exemplars !== undefined) q.exemplars = data.exemplars;
        if (data.options) {
          q.options = data.options.create.map((o) => ({ id: nastaId++, ...o }));
        }
        return q;
      },
    },
  };
  return { tx: tx as unknown as ImportTx, topics, questions };
}

const CSV = `topic,type,text,option1,option2,correctAnswer,subskill,config
Rom,MULTIPLE_CHOICE,Vilken kom först?,Caesar mördas,Augustus ensam,Caesar mördas,,
Rom,SORTING,Placera i rätt epok (1),,,,,"{""categories"":[""Antiken"",""Medeltiden""],""items"":[{""text"":""Caesar mördas"",""category"":""Antiken""}]}"
`;

describe("importQuestionRows", () => {
  it("skapar frågor och topics första gången", async () => {
    const db = minnesDb();
    const r = await importQuestionRows(db.tx, 7, parseCsvContent(CSV));
    expect(r).toEqual({ imported: 2, updated: 0 });
    expect(db.topics).toHaveLength(1);
    expect(db.questions).toHaveLength(2);
  });

  it("samma fil två gånger ger samma bank - och samma id:n", async () => {
    // Fyndet: importen skapade alltid nya frågor, så en omkörd generator
    // dubblerade banken och elevernas övningshistorik satt kvar på de gamla.
    const db = minnesDb();
    await importQuestionRows(db.tx, 7, parseCsvContent(CSV));
    const idn = db.questions.map((q) => q.id);
    const r = await importQuestionRows(db.tx, 7, parseCsvContent(CSV));
    expect(r).toEqual({ imported: 0, updated: 2 });
    expect(db.questions).toHaveLength(2);
    expect(db.questions.map((q) => q.id)).toEqual(idn);
  });

  it("uppdaterar innehållet men behåller id:t när raden ändrats", async () => {
    const db = minnesDb();
    await importQuestionRows(db.tx, 7, parseCsvContent(CSV));
    const fore = db.questions[0];
    const andrad = CSV.replace("Caesar mördas,Augustus ensam,Caesar mördas", "Caesar mördas,Augustus ensam,Augustus ensam");
    await importQuestionRows(db.tx, 7, parseCsvContent(andrad));
    const efter = db.questions[0];
    expect(efter.id).toBe(fore.id);
    expect(efter.options.find((o) => o.isCorrect)?.text).toBe("Augustus ensam");
  });

  it("samma text i ett annat topic är en annan fråga", async () => {
    const db = minnesDb();
    await importQuestionRows(db.tx, 7, parseCsvContent(CSV));
    const annat = CSV.replace(/^Rom,/gm, "Hela kursen,");
    const r = await importQuestionRows(db.tx, 7, parseCsvContent(annat));
    expect(r).toEqual({ imported: 2, updated: 0 });
    expect(db.questions).toHaveLength(4);
  });

  it("behåller exemplars som lagts till för hand när filen saknar dem", async () => {
    const db = minnesDb();
    await importQuestionRows(db.tx, 7, parseCsvContent(CSV));
    db.questions[0].exemplars = [{ level: "E", text: "Caesar först", kommentar: "" }];
    await importQuestionRows(db.tx, 7, parseCsvContent(CSV));
    expect(db.questions[0].exemplars).toEqual([{ level: "E", text: "Caesar först", kommentar: "" }]);
  });
});
