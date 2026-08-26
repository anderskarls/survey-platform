/**
 * Skarp verifiering av veckoövningen, mot prod-databasen. LÄSER BARA.
 *
 * Tre saker ska hålla:
 *
 * 1. Spärren. En vecka går att öva först när dess veckotest släppts. Idag
 *    (före första släppet) ska listan vara tom - det är rätt, inte en bugg.
 * 2. Släppet. Med klockan framflyttad ska exakt de veckor vars openAt
 *    passerat dyka upp, i mänsklig ordning.
 * 3. Innehållet. Bara flervalsfrågor (korten) hamnar i drillen; luckfrågorna
 *    i veckotestet ska aldrig följa med, och kurser utan kortform får inget.
 *
 *   npx tsx scripts/verify-week-practice.ts
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

/** Engelska 5 - kursen med kortform och schemalagda veckotest */
const ENG5 = 13;

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) console.log(`  PASS  ${name}`);
  else {
    failures++;
    console.log(`  FAIL  ${name}${detail ? ` - ${detail}` : ""}`);
  }
}

async function main() {
  const { loadWeekPracticeTopics } = await import("../src/lib/week-practice-data");
  const { summarizeWeekTopics } = await import("../src/lib/week-practice");

  const course = await prisma.course.findUnique({
    where: { id: ENG5 },
    select: { name: true, flashcardMode: true },
  });
  if (!course) throw new Error(`Kurs ${ENG5} finns inte`);
  console.log(`\nKurs ${ENG5}: ${course.name} (kortform: ${course.flashcardMode})`);
  check("kursen är i kortform", course.flashcardMode);

  // Släppschemat som det faktiskt ligger i prod
  const surveys = await prisma.survey.findMany({
    where: { courseId: ENG5 },
    select: { id: true, title: true, openAt: true },
    orderBy: { openAt: "asc" },
  });
  const now = new Date();
  const släppta = surveys.filter(
    (s) => s.openAt === null || s.openAt.getTime() <= now.getTime()
  );
  console.log(
    `Veckotest: ${surveys.length} st, varav ${släppta.length} släppta just nu`
  );

  console.log("\n1. Spärren - läget just nu");
  const idag = await loadWeekPracticeTopics(ENG5, now);
  check(
    `antal övningsbara veckor matchar antalet släppta test (${idag.length} = ${släppta.length})`,
    idag.length === släppta.length,
    `veckor: ${idag.map((t) => t.name).join(", ") || "inga"}`
  );

  console.log("\n2. Släppet - klockan framflyttad");
  // Efter Veckotest 03 (mån 14 sep 08:00) men före 04
  const senare = new Date("2026-09-15T12:00:00+02:00");
  const framme = await loadWeekPracticeTopics(ENG5, senare);
  const väntade = surveys
    .filter((s) => s.openAt === null || s.openAt.getTime() <= senare.getTime())
    .map((s) => s.title);
  check(
    `15 sep ger ${väntade.length} veckor`,
    framme.length === väntade.length,
    `fick ${framme.length}: ${framme.map((t) => t.name).join(", ")}`
  );
  const ordning = summarizeWeekTopics(framme, new Map()).map((t) => t.name);
  check(
    "veckorna ligger i mänsklig ordning",
    JSON.stringify(ordning) === JSON.stringify([...ordning].sort((a, b) => a.localeCompare(b, "sv", { numeric: true }))),
    ordning.join(", ")
  );
  console.log(`   Släppta test 15 sep: ${väntade.join(", ")}`);
  console.log(`   Övningsbara veckor:  ${ordning.join(", ")}`);

  console.log("\n3. Innehållet");
  const allaIds = framme.flatMap((t) => t.questionIds);
  const typer = await prisma.question.groupBy({
    by: ["type"],
    where: { id: { in: allaIds } },
    _count: { _all: true },
  });
  check(
    "bara flervalsfrågor i drillen",
    typer.length === 1 && typer[0].type === "MULTIPLE_CHOICE",
    typer.map((t) => `${t.type}:${t._count._all}`).join(", ")
  );
  for (const v of framme) {
    check(
      `${v.name} har kort att öva (${v.questionIds.length})`,
      v.questionIds.length > 0
    );
  }
  // Luckfrågorna ligger i SAMMA ämne som korten - de ska inte ha följt med
  const luckorIÄmnena = await prisma.question.count({
    where: { topicId: { in: framme.map((t) => t.id) }, type: "CLOZE" },
  });
  const luckorIDrillen = await prisma.question.count({
    where: { id: { in: allaIds }, type: "CLOZE" },
  });
  check(
    `veckotestets luckfrågor hålls utanför (${luckorIÄmnena} i ämnena, ${luckorIDrillen} i drillen)`,
    luckorIÄmnena > 0 && luckorIDrillen === 0
  );

  console.log("\n4. Andra kurser rörs inte");
  const andra = await prisma.course.findMany({
    where: { flashcardMode: false },
    select: { id: true, name: true },
    take: 3,
  });
  for (const k of andra) {
    const lista = await loadWeekPracticeTopics(k.id, senare);
    check(`kurs ${k.id} (${k.name}) får ingen veckolista`, lista.length === 0);
  }

  console.log(
    failures === 0
      ? `\nAllt grönt.`
      : `\n${failures} kontroller föll.`
  );
  process.exitCode = failures === 0 ? 0 : 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
