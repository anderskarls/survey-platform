/**
 * Skarp verifiering av de två signalerna kring övningen, mot prod-databasen.
 *
 * 1. Eleven vars lärare just öppnat en vecka har ingen försökshistorik alls.
 *    Badgen och startsidan räknade förr bara due-frågor och stod därför tomma
 *    medan tio nya ord låg och väntade. summarizePracticeReady ska se dem, och
 *    dess siffra ska stämma med hur många frågor passet faktiskt innehåller.
 *
 * 2. Lärarens "Klassens luckor" hämtade frågetexten enbart från quizsvar. Ett
 *    ord som bara mötts i övningen stod som "Fråga 4711" utan topic - i en
 *    kurs där veckotesten är luckfrågor gällde det varje rad.
 *
 * Skapar egen kurs, eget topic, egna frågor och egen elev, och river allt
 * igen. Rör aldrig befintlig elevdata.
 *
 *   npx tsx scripts/verify-practice-signals.ts
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

const MARKER = "__verify-signals";
const STAMP = Date.now() % 1000000;
let failures = 0;

function check(name: string, ok: boolean, detail = "") {
  if (ok) console.log(`  PASS  ${name}`);
  else {
    failures++;
    console.log(`  FAIL  ${name}${detail ? ` - ${detail}` : ""}`);
  }
}

async function main() {
  const { loadRelearningData, loadCourseRelearningOverview } = await import(
    "../src/lib/relearning-data"
  );
  const {
    summarizePracticeReady,
    selectPracticeSet,
    PRACTICE_SET_CAP,
    DAILY_NEW_CARD_CAP,
  } = await import("../src/lib/relearning");

  const course = await prisma.course.create({
    data: { name: `${MARKER} kurs ${STAMP}`, code: `VPS${STAMP}` },
  });

  try {
    // Öppnad vecka - vägen in för ord eleven aldrig mött i ett quiz
    const topicName = `${MARKER} Vecka 01`;
    const topic = await prisma.topic.create({
      data: { name: topicName, courseId: course.id, practiceOpen: true },
    });
    const questionIds: number[] = [];
    for (let i = 1; i <= 25; i++) {
      const q = await prisma.question.create({
        data: {
          text: `${MARKER} ord ${String(i).padStart(2, "0")}`,
          type: "MULTIPLE_CHOICE",
          topicId: topic.id,
          options: {
            create: [
              { text: `ratt ${i}`, isCorrect: true },
              { text: `fel ${i}`, isCorrect: false },
            ],
          },
        },
      });
      questionIds.push(q.id);
    }

    const student = await prisma.student.create({
      data: {
        number: 1,
        username: `${MARKER}-${STAMP}`,
        passwordHash: "x",
        courseId: course.id,
        isTest: false, // lärarvyn räknar bort provkonton
      },
    });

    // --- 1. Signalen till eleven -----------------------------------------
    console.log("\nElevens signal (badge och startsida)");
    const data = await loadRelearningData(student.id);
    const ready = summarizePracticeReady(data.states, {
      candidates: data.newCandidates,
      introducedToday: data.introducedToday,
    });
    check(
      "eleven utan historik har inga repetitioner",
      ready.due === 0,
      `due ${ready.due}`
    );
    check(
      "men dagens tak nya ord syns anda",
      ready.newToday === DAILY_NEW_CARD_CAP,
      `newToday ${ready.newToday}`
    );
    check("badgen skulle visa nagot", ready.total > 0, `total ${ready.total}`);

    const set = selectPracticeSet(
      data.candidates,
      data.states,
      PRACTICE_SET_CAP,
      { candidates: data.newCandidates, introducedToday: data.introducedToday }
    );
    check(
      "siffran stammer med passets faktiska innehall",
      ready.total === set.length,
      `badge ${ready.total}, pass ${set.length}`
    );

    // --- 2. Lärarens luck-lista ------------------------------------------
    console.log("\nLararens luck-lista");
    // Ett ord möts BARA i övningen: inget quizsvar existerar för det
    const ovat = questionIds[0];
    await prisma.practiceAttempt.create({
      data: {
        studentId: student.id,
        questionId: ovat,
        value: "__FC_GOOD__",
        isCorrect: false, // missat kort blir en lucka läraren ska se
        grade: 1,
      },
    });

    const overview = await loadCourseRelearningOverview(course.id);
    const gap = overview.questionGaps.find((g) => g.questionId === ovat);
    check("ordet dyker upp som en lucka", gap !== undefined);
    check(
      "med sin riktiga fragetext, inte 'Fraga <id>'",
      gap?.text.startsWith(`${MARKER} ord`) === true,
      JSON.stringify(gap?.text)
    );
    check(
      "och med sitt topic",
      gap?.topicName === topicName,
      JSON.stringify(gap?.topicName)
    );

    // Övningsförsöket ska räknas som dagens introduktion, så taket håller
    const efter = await loadRelearningData(student.id);
    const readyEfter = summarizePracticeReady(efter.states, {
      candidates: efter.newCandidates,
      introducedToday: efter.introducedToday,
    });
    check(
      "ett introducerat ord dras av fran dagens tak",
      readyEfter.newToday === DAILY_NEW_CARD_CAP - 1,
      `newToday ${readyEfter.newToday}, introducerade ${efter.introducedToday}`
    );
  } finally {
    // Nerifrån och upp: Question -> Topic saknar cascade
    await prisma.survey.deleteMany({ where: { courseId: course.id } });
    const topics = await prisma.topic.findMany({
      where: { courseId: course.id },
      select: { id: true },
    });
    const topicIds = topics.map((t) => t.id);
    await prisma.practiceAttempt.deleteMany({
      where: { question: { topicId: { in: topicIds } } },
    });
    await prisma.question.deleteMany({ where: { topicId: { in: topicIds } } });
    await prisma.topic.deleteMany({ where: { courseId: course.id } });
    await prisma.student.deleteMany({ where: { courseId: course.id } });
    await prisma.course.delete({ where: { id: course.id } });
    console.log(`\nStadat: kurs ${course.id} borttagen.`);
  }

  console.log(failures === 0 ? "\nALLT GRONT" : `\n${failures} FEL`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main().finally(() => prisma.$disconnect());
