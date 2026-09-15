/**
 * Skarp verifiering av begreppskorten mot den riktiga databasen.
 *
 * Två delar, eftersom appen inte når databasen lokalt (TCP 5432 är blockerat
 * på skolnätet - skripten går via Neons websocket):
 *
 *   A. Rutans logik, direkt mot databasen via begreppskort-db - samma kod
 *      som routen kör. Körs alltid.
 *        1. Otolkbara rader rapporteras; ord med bindestreck delas inte.
 *        2. Begreppsämnet kopplas till momentet och öppnas för övning.
 *        3. Samma begrepp igen byter förklaring i stället för att dubbleras.
 *        6. Ett övat kort kan inte tas bort; ett oövat kan.
 *
 *   B. Elevens väg genom det DEPLOYADE HTTP-lagret. Körs bara med --prod,
 *      alltså efter att grenen gått ut. Kursen saknar flashcardläge, som
 *      historie- och samhällskurserna.
 *        4. Korten kommer in i passet, och framsidan läcker inte förklaringen.
 *        5. Vändning och självskattning skrivs till försökshistoriken.
 *
 * Självstädande - kursen med allt under sig rivs i finally. Rör aldrig
 * befintlig elevdata.
 *
 *   npx tsx scripts/verify-begreppskort.ts          # del A
 *   npx tsx scripts/verify-begreppskort.ts --prod   # del A + B
 */
import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import bcrypt from "bcryptjs";

config({ path: "mcp-server/.env", quiet: true });
neonConfig.webSocketConstructor = ws;

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL saknas (mcp-server/.env)");

const PROD = process.argv.includes("--prod");
const BASE = process.env.SURVEY_BASE_URL ?? "https://survey-platform-blush.vercel.app";
const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const MARKER = "__verify-begrepp";
const STAMP = Date.now() % 1000000;
const PASSWORD = `vrf-${STAMP}-x`;
const FORKLARING = "folkets acceptans av makten";
const NY_FORKLARING = `${FORKLARING}, uttryckt i val`;
let failures = 0;

function check(name: string, ok: boolean, detail = "") {
  if (ok) console.log(`  PASS  ${name}`);
  else {
    failures++;
    console.log(`  FAIL  ${name}${detail ? ` - ${detail}` : ""}`);
  }
}

function cookieFrom(res: Response): string | null {
  const raw = res.headers.get("set-cookie");
  if (!raw) return null;
  const parts = raw.split(/,(?=[^;]+=)/);
  const first = parts.find((c) => c.includes("student")) ?? parts[0];
  return first.split(";")[0];
}

async function main() {
  const { FLASHCARD_REVEAL } = await import("../src/lib/flashcard");
  const { conceptTopicName, parseBegreppsrader } = await import("../src/lib/begreppskort");
  const { sparaBegrepp, taBortBegrepp } = await import("../src/lib/begreppskort-db");

  const course = await prisma.course.create({
    data: { name: `${MARKER} kurs ${STAMP}`, code: `VB${STAMP}`, flashcardMode: false },
  });

  try {
    const unit = await prisma.unit.create({
      data: { title: `${MARKER} Antiken`, courseId: course.id },
    });

    console.log("\n1. Rutan");
    const forstaRutan = parseBegreppsrader(
      `Legitimitet - ${FORKLARING}\nVästromerska riket - rikets västra halva\nDemos folket`
    );
    check(
      "raden utan skiljetecken rapporteras med radnummer",
      forstaRutan.fel.length === 1 && forstaRutan.fel[0].rad === 3,
      JSON.stringify(forstaRutan.fel)
    );
    const forsta = await sparaBegrepp(prisma, unit, forstaRutan.rader);
    check("två kort skapade", forsta.skapade === 2, JSON.stringify(forsta));
    const kort = await prisma.question.findMany({
      where: { topic: { courseId: course.id } },
      orderBy: { id: "asc" },
      select: { id: true, text: true, type: true },
    });
    check(
      "bindestrecket i Västromerska riket delade inte ordet",
      kort.some((k) => k.text === "Västromerska riket"),
      JSON.stringify(kort.map((k) => k.text))
    );
    check("korten har typen CONCEPT_CARD", kort.length === 2 && kort.every((k) => k.type === "CONCEPT_CARD"));

    console.log("\n2. Begreppsämnet");
    const topic = await prisma.topic.findFirst({ where: { courseId: course.id } });
    check("ämnet heter efter momentet", topic?.name === conceptTopicName(unit.title), topic?.name);
    check("ämnet är kopplat till momentet", topic?.unitId === unit.id);
    check("ämnet är öppet för övning", topic?.practiceOpen === true);

    console.log("\n3. Samma begrepp igen");
    const andra = await sparaBegrepp(
      prisma,
      unit,
      parseBegreppsrader(`legitimitet  - ${NY_FORKLARING}\nVästromerska riket - rikets västra halva`).rader
    );
    check(
      "en ny förklaring, en oförändrad, inga dubbletter",
      andra.skapade === 0 && andra.uppdaterade === 1 && andra.oforandrade === 1 && andra.topicId === topic?.id,
      JSON.stringify(andra)
    );
    const legitimitet = await prisma.question.findFirstOrThrow({
      where: { topic: { courseId: course.id }, text: "Legitimitet" },
    });
    check(
      "förklaringen är utbytt, stavningen från första gången kvar",
      (legitimitet.config as { explanation?: string }).explanation === NY_FORKLARING
    );

    const student = await prisma.student.create({
      data: {
        number: 1,
        username: `${MARKER}-${STAMP}`,
        passwordHash: await bcrypt.hash(PASSWORD, 10),
        courseId: course.id,
        isTest: true,
      },
    });

    if (PROD) {
      console.log(`\n4. Elevens pass (${BASE})`);
      const login = await fetch(`${BASE}/api/auth/student-login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: student.username, password: PASSWORD }),
      });
      const cookie = cookieFrom(login);
      check("elevinloggning", login.status === 200 && !!cookie, `status ${login.status}`);
      if (cookie) {
        const passRes = await fetch(`${BASE}/student/practice`, { headers: { cookie }, redirect: "manual" });
        const pass = passRes.status === 200 ? (await passRes.text()).replace(/<!--\s*-->/g, "") : "";
        check("övningssidan svarar", passRes.status === 200, `status ${passRes.status}`);
        check("begreppet finns i passet", pass.includes("Legitimitet"));
        check("båda korten i passet", /Klara:\s*0 av 2/.test(pass), "räknaren visade inte 0 av 2");
        check("förklaringen läcker inte före vändningen", !pass.includes(FORKLARING));

        console.log("\n5. Vändning och skattning");
        const vand = await fetch(`${BASE}/api/student/practice`, {
          method: "POST",
          headers: { "content-type": "application/json", cookie },
          body: JSON.stringify({ questionId: legitimitet.id, value: FLASHCARD_REVEAL }),
        });
        const vandJson = (await vand.json()) as {
          attemptId?: number;
          selfAssess?: boolean;
          correctAnswer?: string;
          isCorrect?: boolean | null;
        };
        check("vänt kort tas emot", vand.status === 201, `status ${vand.status} ${JSON.stringify(vandJson)}`);
        check("kortet ska självskattas och rättas inte", vandJson.selfAssess === true && vandJson.isCorrect === null);
        check("förklaringen kommer i svaret på vändningen", vandJson.correctAnswer === NY_FORKLARING, String(vandJson.correctAnswer));
        const skattning = await fetch(`${BASE}/api/student/practice`, {
          method: "PATCH",
          headers: { "content-type": "application/json", cookie },
          body: JSON.stringify({ attemptId: vandJson.attemptId, grade: 3 }),
        });
        check("skattningen sparas", skattning.status === 200, `status ${skattning.status}`);
        const rader = await prisma.practiceAttempt.findMany({
          where: { studentId: student.id, questionId: legitimitet.id },
          select: { grade: true, isCorrect: true, value: true },
        });
        check(
          "försöket ligger i historiken som Bra",
          rader.length === 1 && rader[0].grade === 3 && rader[0].isCorrect === true && rader[0].value === "__FC_GOOD__",
          JSON.stringify(rader)
        );
      }
    } else {
      console.log("\n4-5. Elevens väg hoppas över - kör med --prod när grenen är deployad");
      // Ett övningsförsök direkt i databasen, så borttagningsskyddet kan provas
      await prisma.practiceAttempt.create({
        data: { studentId: student.id, questionId: legitimitet.id, value: "__FC_GOOD__", isCorrect: true, grade: 3 },
      });
    }

    console.log("\n6. Borttagning");
    const skyddad = await taBortBegrepp(prisma, unit, legitimitet.id);
    check("övat kort vägras", !skyddad.ok && skyddad.status === 409, JSON.stringify(skyddad));
    const romerska = kort.find((k) => k.text === "Västromerska riket")!;
    const borta = await taBortBegrepp(prisma, unit, romerska.id);
    check("oövat kort tas bort", borta.ok, JSON.stringify(borta));
    check("och är borta ur databasen", (await prisma.question.findUnique({ where: { id: romerska.id } })) === null);
    const annatMoment = await taBortBegrepp(prisma, { ...unit, id: unit.id + 100000 }, legitimitet.id);
    check("ett annat moments kort nås inte", !annatMoment.ok && annatMoment.status === 404);
  } finally {
    const topics = await prisma.topic.findMany({ where: { courseId: course.id }, select: { id: true } });
    const topicIds = topics.map((t) => t.id);
    await prisma.practiceAttempt.deleteMany({ where: { question: { topicId: { in: topicIds } } } });
    await prisma.question.deleteMany({ where: { topicId: { in: topicIds } } });
    await prisma.topic.deleteMany({ where: { courseId: course.id } });
    await prisma.unit.deleteMany({ where: { courseId: course.id } });
    await prisma.student.deleteMany({ where: { courseId: course.id } });
    await prisma.course.delete({ where: { id: course.id } });
    console.log(`\nStädat: kurs ${course.id} borttagen.`);
  }

  console.log(failures === 0 ? "\nALLT GRÖNT" : `\n${failures} FEL`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main().finally(() => prisma.$disconnect());
