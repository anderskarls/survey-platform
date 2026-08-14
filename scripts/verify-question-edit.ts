/**
 * Skarp verifiering av redigeringsläget mot prod-databasen.
 *
 * Kör appens riktiga applyQuestionUpdate genom att lägga en Neon-backad
 * PrismaClient i singletonen innan src/lib/prisma laddas - TCP 5432 är blockerat
 * härifrån, så WebSocket-drivrutinen är enda vägen in (samma som mcp-server).
 *
 * Skapar sitt eget ämne, sin egen fråga och sin egen enkät, och river allt igen.
 * Rör aldrig befintlig elevdata.
 *
 *   npx tsx scripts/verify-question-edit.ts
 */
import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";

config({ path: "mcp-server/.env" });
neonConfig.webSocketConstructor = ws;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL saknas (mcp-server/.env)");
}

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });
(globalThis as unknown as { prisma: PrismaClient }).prisma = prisma;

const MARKER = "__verify-question-edit";
let failures = 0;

function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    console.log(`  PASS  ${name}`);
  } else {
    failures++;
    console.log(`  FAIL  ${name}${detail ? ` - ${detail}` : ""}`);
  }
}

async function load(questionId: number) {
  return prisma.question.findUniqueOrThrow({
    where: { id: questionId },
    include: {
      options: { orderBy: { id: "asc" } },
      topic: true,
      _count: { select: { answers: true, practiceAttempts: true } },
    },
  });
}

async function answers(questionId: number) {
  return prisma.answer.findMany({
    where: { questionId },
    orderBy: { id: "asc" },
    select: { value: true, isCorrect: true },
  });
}

async function main() {
  const { applyQuestionUpdate, QuestionEditError } = await import(
    "../src/lib/question-edit"
  );
  const { updateQuestionSchema } = await import("../src/lib/validators");
  const input = (raw: Record<string, unknown>) => updateQuestionSchema.parse(raw);

  let topicId = 0;
  let questionId = 0;
  let surveyId = 0;

  try {
    const course = await prisma.course.findFirstOrThrow({ orderBy: { id: "asc" } });
    const student = await prisma.student.findFirstOrThrow({
      where: { courseId: course.id, isTest: true },
    });
    console.log(`Kurs ${course.id} (${course.name}), provkonto ${student.id}\n`);

    // --- uppsättning ---------------------------------------------------------
    const topic = await prisma.topic.create({
      data: { name: `${MARKER}-${Date.now()}`, courseId: course.id },
    });
    topicId = topic.id;

    const question = await prisma.question.create({
      data: {
        text: `${MARKER} Vilket fredsavtal avslutade första världskriget?`,
        type: "MULTIPLE_CHOICE",
        topicId,
        options: {
          create: [
            { text: "Versaillesfreden", isCorrect: true },
            { text: "Wienkongressen", isCorrect: false },
            { text: "Westfaliska freden", isCorrect: false },
          ],
        },
      },
      include: { options: { orderBy: { id: "asc" } } },
    });
    questionId = question.id;
    const [optA, optB, optC] = question.options;

    const survey = await prisma.survey.create({
      data: {
        title: MARKER,
        shareCode: `VQE${Date.now().toString(36).toUpperCase()}`,
        mode: "QUIZ",
        courseId: course.id,
        questions: { create: [{ questionId, order: 0 }] },
      },
    });
    surveyId = survey.id;

    // Tre svar: rätt, fel och osäker - de tre fall rättningen skiljer på.
    for (const [value, isCorrect] of [
      ["Versaillesfreden", true],
      ["Wienkongressen", false],
      ["__UNSURE__", null],
    ] as const) {
      await prisma.response.create({
        data: {
          surveyId,
          studentId: student.id,
          answers: { create: [{ questionId, value, isCorrect }] },
        },
      });
    }
    await prisma.practiceAttempt.createMany({
      data: [
        { studentId: student.id, questionId, value: "Versaillesfreden", isCorrect: true, grade: 3 },
        { studentId: student.id, questionId, value: "__UNSURE__", isCorrect: null, grade: 1 },
      ],
    });

    console.log("A. Rent stavfel i alternativtexten");
    {
      const res = await applyQuestionUpdate(
        await load(questionId),
        input({
          options: [
            { id: optA.id, text: "Versaillesfördraget", isCorrect: true },
            { id: optB.id, text: "Wienkongressen", isCorrect: false },
            { id: optC.id, text: "Westfaliska freden", isCorrect: false },
          ],
        })
      );
      const rows = await answers(questionId);
      check("ingen kvittering krävdes", res.impact.renamedOptions === 1);
      check("elevsvaret följde med textbytet", res.impact.migratedAnswers === 1, JSON.stringify(rows));
      check("övningsförsöket följde med", res.impact.migratedAttempts === 1);
      check(
        "svaret pekar på den nya texten och är fortfarande rätt",
        rows.some((r) => r.value === "Versaillesfördraget" && r.isCorrect === true)
      );
      check(
        "inget svar ligger kvar på den gamla texten",
        !rows.some((r) => r.value === "Versaillesfreden")
      );
      check(
        "osäkert svar förblir obedömt",
        rows.some((r) => r.value === "__UNSURE__" && r.isCorrect === null)
      );
    }

    console.log("\nB. Två alternativ byter text med varandra");
    {
      const res = await applyQuestionUpdate(
        await load(questionId),
        input({
          options: [
            { id: optA.id, text: "Wienkongressen", isCorrect: true },
            { id: optB.id, text: "Versaillesfördraget", isCorrect: false },
            { id: optC.id, text: "Westfaliska freden", isCorrect: false },
          ],
        })
      );
      const rows = await answers(questionId);
      check("båda textbytena migrerades", res.impact.migratedAnswers === 2, JSON.stringify(rows));
      check(
        "svaren slogs inte ihop - ett på varje text",
        rows.filter((r) => r.value === "Wienkongressen").length === 1 &&
          rows.filter((r) => r.value === "Versaillesfördraget").length === 1
      );
    }

    console.log("\nC. Flyttat facit");
    {
      let blocked = false;
      let message = "";
      try {
        await applyQuestionUpdate(
          await load(questionId),
          input({
            options: [
              { id: optA.id, text: "Wienkongressen", isCorrect: false },
              { id: optB.id, text: "Versaillesfördraget", isCorrect: true },
              { id: optC.id, text: "Westfaliska freden", isCorrect: false },
            ],
          })
        );
      } catch (e) {
        blocked = e instanceof QuestionEditError && e.status === 409;
        message = e instanceof Error ? e.message : String(e);
      }
      check("stoppas utan kvittering (409)", blocked, message);
      check(
        "meddelandet räknar upp historiken",
        /3 elevsvar och 2 övningsförsök/.test(message),
        message
      );

      const res = await applyQuestionUpdate(
        await load(questionId),
        input({
          options: [
            { id: optA.id, text: "Wienkongressen", isCorrect: false },
            { id: optB.id, text: "Versaillesfördraget", isCorrect: true },
            { id: optC.id, text: "Westfaliska freden", isCorrect: false },
          ],
          confirmRegrade: true,
        })
      );
      const rows = await answers(questionId);
      check("tidigare svar rättades om", res.impact.regradedAnswers === 2, JSON.stringify(res.impact));
      check(
        "gamla rätt-svaret är nu fel",
        rows.some((r) => r.value === "Wienkongressen" && r.isCorrect === false)
      );
      check(
        "nya rätt-svaret är nu rätt",
        rows.some((r) => r.value === "Versaillesfördraget" && r.isCorrect === true)
      );
      check(
        "osäkert svar är fortfarande obedömt",
        rows.some((r) => r.value === "__UNSURE__" && r.isCorrect === null)
      );
      const grades = await prisma.practiceAttempt.findMany({
        where: { questionId },
        select: { grade: true },
        orderBy: { id: "asc" },
      });
      check(
        "FSRS-betygen är orörda",
        grades.map((g) => g.grade).join(",") === "3,1",
        grades.map((g) => g.grade).join(",")
      );
    }

    console.log("\nD. Borttaget alternativ");
    {
      const res = await applyQuestionUpdate(
        await load(questionId),
        input({
          options: [
            { id: optA.id, text: "Wienkongressen", isCorrect: false },
            { id: optB.id, text: "Versaillesfördraget", isCorrect: true },
          ],
          confirmRegrade: true,
        })
      );
      const after = await load(questionId);
      check("alternativet är borta", after.options.length === 2);
      check("svaren finns kvar", after._count.answers === 3, String(after._count.answers));
      check("inga svar låg på det borttagna alternativet", res.impact.orphanedAnswers === 0);
    }

    console.log("\nE. Siffrorna som raderingsdialogen visar");
    {
      const q = await load(questionId);
      check(
        "3 elevsvar och 2 övningsförsök räknas",
        q._count.answers === 3 && q._count.practiceAttempts === 2,
        `${q._count.answers}/${q._count.practiceAttempts}`
      );
    }

    console.log("\nF. Radering tar med sig historiken");
    {
      await prisma.question.delete({ where: { id: questionId } });
      const kvar = await prisma.answer.count({ where: { questionId } });
      const forsok = await prisma.practiceAttempt.count({ where: { questionId } });
      check("svar och försök raderades med frågan", kvar === 0 && forsok === 0);
      questionId = 0;
    }
  } finally {
    console.log("\nStädar...");
    if (questionId) await prisma.question.delete({ where: { id: questionId } }).catch(() => {});
    if (surveyId) await prisma.survey.delete({ where: { id: surveyId } }).catch(() => {});
    if (topicId) await prisma.topic.delete({ where: { id: topicId } }).catch(() => {});
    const rester = await prisma.topic.count({ where: { name: { startsWith: MARKER } } });
    console.log(rester === 0 ? "Inget kvar efter testet." : `VARNING: ${rester} testämnen kvar!`);
    await prisma.$disconnect();
  }

  console.log(failures === 0 ? "\nAllt grönt." : `\n${failures} kontroller misslyckades.`);
  return failures;
}

main()
  .then((f) => process.exit(f === 0 ? 0 : 1))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
