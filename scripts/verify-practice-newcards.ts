/**
 * Skarp verifiering av nya-kort-inflödet mot prod-databasen.
 *
 * Kör appens riktiga loadRelearningData + selectPracticeSet genom att lägga
 * en Neon-backad PrismaClient i singletonen innan src/lib/prisma laddas -
 * TCP 5432 är blockerat härifrån, så WebSocket är enda vägen in.
 *
 * Skapar sin egen kurs, sitt eget topic, sina egna frågor och sin egen elev,
 * och river allt igen. Rör aldrig befintlig elevdata.
 *
 *   npx tsx scripts/verify-practice-newcards.ts
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

const MARKER = "__verify-newcards";
let failures = 0;

function check(name: string, ok: boolean, detail = "") {
  if (ok) console.log(`  PASS  ${name}`);
  else {
    failures++;
    console.log(`  FAIL  ${name}${detail ? ` - ${detail}` : ""}`);
  }
}

async function main() {
  const { loadRelearningData } = await import("../src/lib/relearning-data");
  const { selectPracticeSet, PRACTICE_SET_CAP, DAILY_NEW_CARD_CAP } =
    await import("../src/lib/relearning");

  const course = await prisma.course.create({
    data: { name: `${MARKER} kurs`, code: `VNC${Date.now() % 100000}` },
  });
  // Allt nedan hänger på kursen, som rivs i finally även om uppsättningen
  // fallerar halvvägs - annars blir det skräp kvar i prod
  try {
  const topic = await prisma.topic.create({
    data: { name: `${MARKER} Vecka 01`, courseId: course.id },
  });
  // 25 kort - fler än både dagstaket och passets tak
  for (let i = 1; i <= 25; i++) {
    await prisma.question.create({
      data: {
        text: `${MARKER} ord ${String(i).padStart(2, "0")}`,
        type: "MULTIPLE_CHOICE",
        topicId: topic.id,
        options: {
          create: [
            { text: "rätt", isCorrect: true },
            { text: "fel", isCorrect: false },
          ],
        },
      },
    });
  }
  const student = await prisma.student.create({
    data: {
      courseId: course.id,
      number: 1,
      username: `${MARKER}-elev`,
      passwordHash: "x",
      isTest: true,
    },
  });

    // 1. Stängt topic = ingen väg in, precis som före ändringen
    let data = await loadRelearningData(student.id);
    check("stängt topic ger inga nya kandidater", data.newCandidates.length === 0);
    let set = selectPracticeSet(data.candidates, data.states, PRACTICE_SET_CAP, {
      candidates: data.newCandidates,
      introducedToday: data.introducedToday,
    });
    check("stängt topic ger tomt pass", set.length === 0, `fick ${set.length}`);

    // 2. Öppnat topic = korten flödar in, takade till dagens gräns
    await prisma.topic.update({
      where: { id: topic.id },
      data: { practiceOpen: true },
    });
    data = await loadRelearningData(student.id);
    check(
      "öppnat topic ger alla 25 som kandidater",
      data.newCandidates.length === 25,
      `fick ${data.newCandidates.length}`
    );
    set = selectPracticeSet(data.candidates, data.states, PRACTICE_SET_CAP, {
      candidates: data.newCandidates,
      introducedToday: data.introducedToday,
    });
    check(
      `passet takas till ${DAILY_NEW_CARD_CAP} nya`,
      set.length === DAILY_NEW_CARD_CAP,
      `fick ${set.length}`
    );
    check("introducedToday är 0 innan eleven övat", data.introducedToday === 0);

    // 3. Eleven övar dagens kort - taket ska hålla i nästa pass samma dag
    for (const questionId of set) {
      await prisma.practiceAttempt.create({
        // Som ett vänt kort med självskattningen "Bra"
        data: {
          studentId: student.id,
          questionId,
          value: "__FC_GOOD__",
          isCorrect: true,
          grade: 3,
        },
      });
    }
    data = await loadRelearningData(student.id);
    check(
      `introducedToday = ${DAILY_NEW_CARD_CAP} efter passet`,
      data.introducedToday === DAILY_NEW_CARD_CAP,
      `fick ${data.introducedToday}`
    );
    set = selectPracticeSet(data.candidates, data.states, PRACTICE_SET_CAP, {
      candidates: data.newCandidates,
      introducedToday: data.introducedToday,
    });
    check(
      "inga fler nya samma dag",
      set.length === 0,
      `fick ${set.length} (${set.join(",")})`
    );
    check(
      "de 10 övade ligger kvar i poolen",
      data.states.size === DAILY_NEW_CARD_CAP,
      `fick ${data.states.size}`
    );
    check(
      "resterande 15 står kvar som nya kandidater",
      data.newCandidates.length === 15,
      `fick ${data.newCandidates.length}`
    );

    // 4. Stängning stoppar bara inflödet - historiken är kvar
    await prisma.topic.update({
      where: { id: topic.id },
      data: { practiceOpen: false },
    });
    data = await loadRelearningData(student.id);
    check("stängning nollar nya kandidater", data.newCandidates.length === 0);
    check(
      "men de mötta orden finns kvar i poolen",
      data.states.size === DAILY_NEW_CARD_CAP,
      `fick ${data.states.size}`
    );
  } finally {
    // Städa nerifrån och upp: Question -> Topic saknar cascade, så kursen
    // går inte att radera medan frågorna står kvar
    await prisma.practiceAttempt.deleteMany({
      where: { student: { courseId: course.id } },
    });
    await prisma.question.deleteMany({
      where: { topic: { courseId: course.id } },
    });
    await prisma.student.deleteMany({ where: { courseId: course.id } });
    await prisma.course.delete({ where: { id: course.id } });
    console.log("  (testdata borttagen)");
  }

  console.log(failures === 0 ? "\nALLA PASS" : `\n${failures} FAIL`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  process.exit(1);
});
