/**
 * Skarp verifiering av att övningspoolen är kursavgränsad, mot prod-databasen.
 *
 * Kör appens riktiga loadRelearningData genom att lägga en Neon-backad
 * PrismaClient i singletonen innan src/lib/prisma laddas - TCP 5432 är
 * blockerat härifrån, så WebSocket-drivrutinen är enda vägen in.
 *
 * Skapar sina egna kurser, elever, ämnen, frågor och övningsförsök - två
 * kurser vars elevkonton delar personKey, precis som lärarens provkonton gör -
 * och river allt igen. Rör aldrig befintlig elevdata.
 *
 *   npx tsx scripts/verify-practice-course-scope.ts
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

const MARKER = "__verify-practice-scope";
let failures = 0;

function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    console.log(`  PASS  ${name}`);
  } else {
    failures++;
    console.log(`  FAIL  ${name}${detail ? ` - ${detail}` : ""}`);
  }
}

async function main() {
  const { loadRelearningData, resolveLinkedAccounts } = await import(
    "../src/lib/relearning-data"
  );

  const personKey = `${MARKER}-key`;
  const created: { courseIds: number[] } = { courseIds: [] };

  try {
    // Två kurser, ett konto i varje, samma personKey - exakt provkontots form
    const kursA = await prisma.course.create({
      data: { name: `${MARKER} A`, code: `VPA${Date.now() % 1000}` },
    });
    const kursB = await prisma.course.create({
      data: { name: `${MARKER} B`, code: `VPB${Date.now() % 1000}` },
    });
    created.courseIds = [kursA.id, kursB.id];

    const elevA = await prisma.student.create({
      data: {
        number: 1,
        username: `${MARKER}-a`,
        passwordHash: "x",
        personKey,
        isTest: true,
        courseId: kursA.id,
      },
    });
    const elevB = await prisma.student.create({
      data: {
        number: 1,
        username: `${MARKER}-b`,
        passwordHash: "x",
        personKey,
        isTest: true,
        courseId: kursB.id,
      },
    });

    // Ett ämne per kurs. B:s ämne är dessutom öppnat för övning, så att även
    // vägen för aldrig mötta frågor prövas.
    const amneA = await prisma.topic.create({
      data: { name: `${MARKER} ämne A`, courseId: kursA.id },
    });
    const amneB = await prisma.topic.create({
      data: {
        name: `${MARKER} ämne B`,
        courseId: kursB.id,
        practiceOpen: true,
      },
    });

    const fragaA = await prisma.question.create({
      data: {
        text: `${MARKER} fråga A`,
        type: "MULTIPLE_CHOICE",
        topicId: amneA.id,
        options: {
          create: [
            { text: "rätt", isCorrect: true },
            { text: "fel", isCorrect: false },
          ],
        },
      },
    });
    const fragaB = await prisma.question.create({
      data: {
        text: `${MARKER} fråga B`,
        type: "MULTIPLE_CHOICE",
        topicId: amneB.id,
        options: {
          create: [
            { text: "rätt", isCorrect: true },
            { text: "fel", isCorrect: false },
          ],
        },
      },
    });
    const nyFragaB = await prisma.question.create({
      data: {
        text: `${MARKER} ny fråga B (aldrig mött)`,
        type: "MULTIPLE_CHOICE",
        topicId: amneB.id,
        options: {
          create: [
            { text: "rätt", isCorrect: true },
            { text: "fel", isCorrect: false },
          ],
        },
      },
    });

    // Båda kontona har övat i sin egen kurs
    const igar = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await prisma.practiceAttempt.create({
      data: {
        studentId: elevA.id,
        questionId: fragaA.id,
        value: "rätt",
        isCorrect: true,
        grade: 3,
        createdAt: igar,
      },
    });
    await prisma.practiceAttempt.create({
      data: {
        studentId: elevB.id,
        questionId: fragaB.id,
        value: "rätt",
        isCorrect: true,
        grade: 3,
        createdAt: igar,
      },
    });

    console.log("\n== Kursavgränsad övningspool ==");

    const dataA = await loadRelearningData(elevA.id);
    check(
      "A:s pool innehåller A:s egen fråga",
      dataA.states.has(fragaA.id),
      `states=${[...dataA.states.keys()].join(",")}`
    );
    check(
      "A:s pool innehåller INTE B:s fråga",
      !dataA.states.has(fragaB.id),
      `states=${[...dataA.states.keys()].join(",")}`
    );
    check(
      "A:s kandidater är bara A:s",
      dataA.candidates.every((c) => c.questionId === fragaA.id),
      JSON.stringify(dataA.candidates)
    );
    check(
      "A:s nya kort läcker inte in från B:s öppnade ämne",
      dataA.newCandidates.length === 0,
      JSON.stringify(dataA.newCandidates)
    );
    check(
      "A:s frågeinfo pekar bara på kurs A",
      [...dataA.questionInfo.values()].every((i) => i.courseId === kursA.id),
      JSON.stringify([...dataA.questionInfo.values()])
    );
    check(
      "A:s försök bokförs på A:s eget konto",
      [...dataA.questionInfo.values()].every(
        (i) => i.ownerStudentId === elevA.id
      )
    );

    const dataB = await loadRelearningData(elevB.id);
    check(
      "B:s pool innehåller B:s egen fråga",
      dataB.states.has(fragaB.id),
      `states=${[...dataB.states.keys()].join(",")}`
    );
    check(
      "B:s pool innehåller INTE A:s fråga",
      !dataB.states.has(fragaA.id),
      `states=${[...dataB.states.keys()].join(",")}`
    );
    check(
      "B:s öppnade ämne ger B den aldrig mötta frågan",
      dataB.newCandidates.some((c) => c.questionId === nyFragaB.id),
      JSON.stringify(dataB.newCandidates)
    );

    console.log("\n== Kursväxlaren är orörd ==");
    const accounts = await resolveLinkedAccounts(elevA.id);
    check(
      "resolveLinkedAccounts ger fortfarande båda kurserna",
      accounts.length === 2 &&
        accounts.some((a) => a.courseId === kursA.id) &&
        accounts.some((a) => a.courseId === kursB.id),
      JSON.stringify(accounts)
    );
    check(
      "loadRelearningData bär med båda kontona till växlaren",
      dataA.accounts.length === 2,
      JSON.stringify(dataA.accounts)
    );

    console.log("\n== Konto utan personKey ==");
    const ensam = await prisma.student.create({
      data: {
        number: 2,
        username: `${MARKER}-ensam`,
        passwordHash: "x",
        isTest: true,
        courseId: kursA.id,
      },
    });
    await prisma.practiceAttempt.create({
      data: {
        studentId: ensam.id,
        questionId: fragaA.id,
        value: "fel",
        isCorrect: false,
        grade: 1,
        createdAt: igar,
      },
    });
    const dataEnsam = await loadRelearningData(ensam.id);
    check(
      "olänkat konto får sin egen kurs som förut",
      dataEnsam.states.has(fragaA.id) && dataEnsam.accounts.length === 1,
      `states=${[...dataEnsam.states.keys()].join(",")} accounts=${dataEnsam.accounts.length}`
    );
  } finally {
    // Städning: kurserna kaskaderar elever och ämnen; frågor och försök tas
    // först, eftersom Question inte kaskaderar från Topic.
    for (const courseId of created.courseIds) {
      const topics = await prisma.topic.findMany({
        where: { courseId },
        select: { id: true },
      });
      const topicIds = topics.map((t) => t.id);
      if (topicIds.length > 0) {
        const questions = await prisma.question.findMany({
          where: { topicId: { in: topicIds } },
          select: { id: true },
        });
        const questionIds = questions.map((q) => q.id);
        if (questionIds.length > 0) {
          await prisma.practiceAttempt.deleteMany({
            where: { questionId: { in: questionIds } },
          });
          await prisma.questionOption.deleteMany({
            where: { questionId: { in: questionIds } },
          });
          await prisma.question.deleteMany({
            where: { id: { in: questionIds } },
          });
        }
      }
      await prisma.course.delete({ where: { id: courseId } });
    }
    const kvar = await prisma.student.count({
      where: { username: { startsWith: MARKER } },
    });
    console.log(`\nStädning: ${kvar === 0 ? "ok" : `${kvar} konton kvar!`}`);
    await prisma.$disconnect();
  }

  console.log(failures === 0 ? "\nALLA PASS" : `\n${failures} FAIL`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
