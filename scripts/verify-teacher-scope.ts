/**
 * Skarp verifiering av lärarrollen mot prod-databasen.
 *
 * Kör appens riktiga scope-filter (src/lib/authz) mot verklig data genom en
 * Neon-backad PrismaClient - TCP 5432 är blockerat härifrån, så WebSocket är
 * enda vägen in (samma som mcp-server).
 *
 * Skapar sitt eget lärarkonto, sina egna två kurser med varsitt ämne och
 * varsin fråga, och river allt igen. Rör aldrig befintlig elevdata och
 * ändrar aldrig ett befintligt konto.
 *
 * Kräver att migrationen 20260824120000_lararroller är applicerad.
 *
 *   npx tsx scripts/verify-teacher-scope.ts
 */
import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import {
  AdminScope,
  courseScopeWhere,
  ownCoursesWhere,
  questionScopeWhere,
  scopeAllowsCourse,
  scopeIsOwner,
} from "../src/lib/authz";

config({ path: "mcp-server/.env" });
neonConfig.webSocketConstructor = ws;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL saknas (mcp-server/.env)");
}

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const MARKER = "__verify-teacher-scope";
let failures = 0;

function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    console.log(`  PASS  ${name}`);
  } else {
    failures++;
    console.log(`  FAIL  ${name}${detail ? ` - ${detail}` : ""}`);
  }
}

/**
 * Bygger scopet på samma sätt som getAdminScope gör i appen. Den funktionen
 * går inte att anropa härifrån (den läser Next-headers och NextAuth-session),
 * så uppslaget speglas här - det är just den spegling som testet ska visa
 * ger samma resultat som databasen faktiskt innehåller.
 */
async function scopeForEmail(email: string): Promise<AdminScope | null> {
  const admin = await prisma.admin.findUnique({
    where: { email },
    select: {
      id: true,
      name: true,
      role: true,
      courses: { select: { courseId: true } },
    },
  });
  if (!admin) return null;
  if (admin.role === "OWNER") {
    return { adminId: admin.id, name: admin.name, isOwner: true, courseIds: null };
  }
  return {
    adminId: admin.id,
    name: admin.name,
    isOwner: false,
    courseIds: admin.courses.map((c) => c.courseId),
  };
}

/**
 * Städar i beroendeordning. Topic kaskaderar från Course, men
 * `Question.topicId` gör det INTE - en kurs går därför inte att radera
 * medan dess frågor finns kvar, och en städning som börjar med kursen
 * misslyckas och lämnar allt kvar i databasen.
 */
async function stad() {
  const egenKurs = { course: { name: { startsWith: MARKER } } };
  await prisma.question.deleteMany({ where: { topic: egenKurs } });
  await prisma.survey.deleteMany({ where: egenKurs });
  await prisma.topic.deleteMany({ where: egenKurs });
  await prisma.course.deleteMany({ where: { name: { startsWith: MARKER } } });
  await prisma.admin.deleteMany({ where: { email: { startsWith: MARKER } } });
}

async function main() {
  console.log("Städar eventuella rester från tidigare körning...");
  await stad();

  console.log("\n1. Migrationen");
  const roller = await prisma.admin.groupBy({ by: ["role"], _count: true });
  const antalAgare = roller.find((r) => r.role === "OWNER")?._count ?? 0;
  check(
    "minst ett ägarkonto finns efter migrationen",
    antalAgare >= 1,
    `hittade ${antalAgare} - befintliga konton skulle satts till OWNER`
  );
  const larareUtanKurs = await prisma.admin.count({
    where: { role: "TEACHER", courses: { none: {} }, email: { not: { startsWith: MARKER } } },
  });
  console.log(`  INFO  ${antalAgare} ägarkonto(n), ${larareUtanKurs} lärarkonto(n) utan kurs`);

  console.log("\n2. Riggar två kurser och ett lärarkonto");
  const kursA = await prisma.course.create({
    data: {
      name: `${MARKER}-kurs-A`,
      code: `VTA${Date.now().toString().slice(-5)}`,
      topics: { create: { name: `${MARKER}-amne-A` } },
    },
    include: { topics: true },
  });
  const kursB = await prisma.course.create({
    data: {
      name: `${MARKER}-kurs-B`,
      code: `VTB${Date.now().toString().slice(-5)}`,
      topics: { create: { name: `${MARKER}-amne-B` } },
    },
    include: { topics: true },
  });
  const fragaA = await prisma.question.create({
    data: { text: `${MARKER} fraga i A`, type: "FREE_TEXT", topicId: kursA.topics[0].id },
  });
  const fragaB = await prisma.question.create({
    data: { text: `${MARKER} fraga i B`, type: "FREE_TEXT", topicId: kursB.topics[0].id },
  });
  const enkatA = await prisma.survey.create({
    data: { title: `${MARKER}-enkat-A`, shareCode: `VS${Date.now().toString().slice(-6)}`, courseId: kursA.id },
  });
  await prisma.survey.create({
    data: { title: `${MARKER}-enkat-B`, shareCode: `VT${Date.now().toString().slice(-6)}`, courseId: kursB.id },
  });

  const larare = await prisma.admin.create({
    data: {
      email: `${MARKER}@example.invalid`,
      name: "Verifieringslarare",
      passwordHash: "x".repeat(60),
      role: "TEACHER",
      courses: { create: { courseId: kursA.id } },
    },
  });
  console.log(`  INFO  kurs A=${kursA.id}, kurs B=${kursB.id}, konto=${larare.id}`);

  console.log("\n3. Scopet läses tillbaka ur databasen");
  const scope = await scopeForEmail(larare.email);
  check("kontot hittas", scope !== null);
  if (!scope) throw new Error("avbryter");
  check("rollen är inte ägare", !scopeIsOwner(scope));
  check(
    "kurslistan är exakt kurs A",
    scope.courseIds?.length === 1 && scope.courseIds[0] === kursA.id,
    JSON.stringify(scope.courseIds)
  );
  check("scopeAllowsCourse släpper igenom kurs A", scopeAllowsCourse(scope, kursA.id));
  check("scopeAllowsCourse stoppar kurs B", !scopeAllowsCourse(scope, kursB.id));

  console.log("\n4. Filtren mot verklig data");
  const synligaKurser = await prisma.course.findMany({
    where: ownCoursesWhere(scope),
    select: { id: true },
  });
  check(
    "kurslistan visar bara kurs A",
    synligaKurser.length === 1 && synligaKurser[0].id === kursA.id,
    `${synligaKurser.length} kurser: ${synligaKurser.map((k) => k.id).join(",")}`
  );

  const synligaEnkater = await prisma.survey.findMany({
    where: { ...courseScopeWhere(scope), title: { startsWith: MARKER } },
    select: { id: true, courseId: true },
  });
  check(
    "enkätlistan visar bara kurs A:s enkät",
    synligaEnkater.length === 1 && synligaEnkater[0].id === enkatA.id,
    `${synligaEnkater.length} enkater`
  );

  const synligaFragor = await prisma.question.findMany({
    where: { ...questionScopeWhere(scope), text: { startsWith: MARKER } },
    select: { id: true },
  });
  check(
    "frågebanken visar bara kurs A:s fråga (via topic.courseId)",
    synligaFragor.length === 1 && synligaFragor[0].id === fragaA.id,
    `${synligaFragor.length} fragor`
  );
  check(
    "kurs B:s fråga är inte med",
    !synligaFragor.some((f) => f.id === fragaB.id)
  );

  console.log("\n5. Lärare utan tilldelad kurs ser ingenting");
  await prisma.adminCourse.deleteMany({ where: { adminId: larare.id } });
  const tomtScope = await scopeForEmail(larare.email);
  check("kurslistan är tom, inte null", tomtScope?.courseIds?.length === 0);
  if (tomtScope) {
    const inget = await prisma.course.findMany({
      where: ownCoursesWhere(tomtScope),
      select: { id: true },
    });
    // Den farliga felmoden: ett tomt filter matchar allt i Prisma.
    check(
      "tomt omfång ger noll kurser, inte alla",
      inget.length === 0,
      `fick ${inget.length} kurser`
    );
    const ingaFragor = await prisma.question.findMany({
      where: { ...questionScopeWhere(tomtScope), text: { startsWith: MARKER } },
      select: { id: true },
    });
    check("tomt omfång ger noll frågor, inte alla", ingaFragor.length === 0);
  }

  console.log("\n6. Ägaren når allt");
  const agare = await prisma.admin.findFirst({ where: { role: "OWNER" } });
  if (!agare) {
    check("ett ägarkonto att prova mot", false);
  } else {
    const agarScope = await scopeForEmail(agare.email);
    check("ägarens omfång är null (obegränsat)", agarScope?.courseIds === null);
    if (agarScope) {
      check("ägaren når kurs A", scopeAllowsCourse(agarScope, kursA.id));
      check("ägaren når kurs B", scopeAllowsCourse(agarScope, kursB.id));
      check("ägarens kursfilter är tomt", Object.keys(ownCoursesWhere(agarScope)).length === 0);
    }
  }

  console.log("\n7. Kaskadradering");
  // Steg 5 tog bort kopplingen. Utan att lägga tillbaka den skulle testet
  // nedan passera på tom hand och inte pröva kaskaden alls.
  await prisma.adminCourse.create({
    data: { adminId: larare.id, courseId: kursA.id },
  });
  check(
    "kopplingen finns innan kursen raderas",
    (await prisma.adminCourse.count({ where: { courseId: kursA.id } })) === 1
  );
  // Frågorna först: Question.topicId kaskaderar inte från Course.
  await prisma.question.deleteMany({ where: { topic: { courseId: kursA.id } } });
  await prisma.survey.deleteMany({ where: { courseId: kursA.id } });
  await prisma.course.delete({ where: { id: kursA.id } });
  const kvar = await prisma.adminCourse.count({ where: { courseId: kursA.id } });
  check("kopplingen försvinner när kursen raderas", kvar === 0);

  console.log("\nStädar...");
  await stad();
  const resterKonto = await prisma.admin.count({ where: { email: { startsWith: MARKER } } });
  const resterKurs = await prisma.course.count({ where: { name: { startsWith: MARKER } } });
  check("inga rester kvar", resterKonto === 0 && resterKurs === 0);

  console.log(
    failures === 0
      ? "\nAllt gick igenom."
      : `\n${failures} kontroll(er) misslyckades.`
  );
  if (failures > 0) process.exitCode = 1;
}

main()
  .catch(async (e) => {
    console.error(e);
    await stad().catch(() => {});
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
