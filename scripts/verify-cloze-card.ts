/**
 * Skarp verifiering av luckmeningskortet genom det DEPLOYADE HTTP-lagret.
 *
 * Går vägen eleven går: egen kurs UTAN flashcardläge (kortet ska vara ett
 * kort i kraft av sin typ, inte i kraft av kursen), egen elev med känt
 * lösenord, riktig inloggning mot prod. Prövar de fyra påståenden funktionen
 * står på:
 *
 *   1. Kortet kommer in i övningen och luckfrågan i samma ämne gör det inte -
 *      gränsen mellan träning och mätning.
 *   2. Framsidan i övningen läcker inte baksidan; den kommer i svaret på
 *      vändningen.
 *   3. Självskattningen skrivs till försökshistoriken med rätt FSRS-betyg.
 *   4. I en enkät renderas kortet som kort, och skattningen rättas som en
 *      skattning i stället för att jämföras med ett alternativ.
 *
 * Självstädande - kursen med allt under sig rivs i finally. Rör aldrig
 * befintlig elevdata.
 *
 *   npx tsx scripts/verify-cloze-card.ts
 */
import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import bcrypt from "bcryptjs";

config({ path: "mcp-server/.env" });
neonConfig.webSocketConstructor = ws;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL saknas (mcp-server/.env)");
}

const BASE =
  process.env.SURVEY_BASE_URL ?? "https://survey-platform-blush.vercel.app";
const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const MARKER = "__verify-kort";
const STAMP = Date.now() % 1000000;
const PASSWORD = `vrf-${STAMP}-x`;
const FACIT = "influence";
const MENING = "Her ___ on the whole group was obvious.";
let failures = 0;

function check(name: string, ok: boolean, detail = "") {
  if (ok) console.log(`  PASS  ${name}`);
  else {
    failures++;
    console.log(`  FAIL  ${name}${detail ? ` - ${detail}` : ""}`);
  }
}

/** Sessionskakan ur student-login, i det format fetch vill ha tillbaka den. */
function cookieFrom(res: Response): string | null {
  const raw = res.headers.get("set-cookie");
  if (!raw) return null;
  const parts = raw.split(/,(?=[^;]+=)/);
  const first = parts.find((c) => c.includes("student")) ?? parts[0];
  return first.split(";")[0];
}

async function main() {
  const { FLASHCARD_REVEAL } = await import("../src/lib/flashcard");

  const course = await prisma.course.create({
    data: {
      name: `${MARKER} kurs ${STAMP}`,
      code: `VK${STAMP}`,
      // Avsiktligt AV: kortet ska vara ett kort ändå
      flashcardMode: false,
    },
  });

  try {
    const topic = await prisma.topic.create({
      data: {
        name: `${MARKER} Vecka 01`,
        courseId: course.id,
        practiceOpen: true,
      },
    });

    const kort = await prisma.question.create({
      data: {
        text: MENING,
        type: "CLOZE_CARD",
        topicId: topic.id,
        config: { answer: FACIT, accept: [], hint: "Inflytande" },
      },
    });
    // Samma mening som luckfråga i samma ämne - den ska INTE in i övningen
    const lucka = await prisma.question.create({
      data: {
        text: MENING,
        type: "CLOZE",
        topicId: topic.id,
        config: { answer: FACIT, accept: [], hint: "Inflytande" },
      },
    });

    const enkat = await prisma.survey.create({
      data: {
        title: `${MARKER} Kortenkat`,
        shareCode: `VK${STAMP}`,
        mode: "QUIZ",
        courseId: course.id,
        questions: { create: [{ questionId: kort.id, order: 1 }] },
      },
    });

    const student = await prisma.student.create({
      data: {
        number: 1,
        username: `${MARKER}-${STAMP}`,
        passwordHash: await bcrypt.hash(PASSWORD, 10),
        courseId: course.id,
        isTest: true,
      },
    });

    console.log("\nInloggning mot prod");
    const login = await fetch(`${BASE}/api/auth/student-login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: student.username, password: PASSWORD }),
    });
    const cookie = cookieFrom(login);
    check(
      "elevinloggning",
      login.status === 200 && !!cookie,
      `status ${login.status}`
    );
    if (!cookie) return;

    const getPage = async (path: string) => {
      const res = await fetch(`${BASE}${path}`, {
        headers: { cookie },
        redirect: "manual",
      });
      // React SSR strör <!-- --> mellan textnoder, så "0 av 1" i JSX blir
      // inte en sammanhängande sträng i markupen. Bort med dem före matchning.
      const raw = res.status === 200 ? await res.text() : "";
      const html = raw.replace(/<!--\s*-->/g, "");
      return { status: res.status, html };
    };

    console.log("\n1. Kortet i ovningen, luckfragan utanfor");
    const pass = await getPage("/student/practice");
    check("ovningssidan svarar", pass.status === 200, `status ${pass.status}`);
    check(
      "kortets mening finns i passet",
      pass.html.includes("on the whole group was obvious"),
      "kortet kom inte in i poolen"
    );
    check(
      "exakt ett kort i passet - luckfragan i samma amne foljde inte med",
      /Klara:\s*0 av 1/.test(pass.html),
      "raknaren sag inte ut som ett enda kort"
    );

    console.log("\n2. Framsidan lacker inte baksidan");
    check(
      "facit finns inte i sidan fore vandningen",
      !pass.html.includes(FACIT),
      "baksidan lag i klienten redan fore forsoket"
    );
    check("ledtraden syns", pass.html.includes("Inflytande"));

    console.log("\n3. Vandningen och skattningen");
    const vand = await fetch(`${BASE}/api/student/practice`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ questionId: kort.id, value: FLASHCARD_REVEAL }),
    });
    const vandJson = (await vand.json()) as {
      attemptId?: number;
      selfAssess?: boolean;
      correctAnswer?: string;
      isCorrect?: boolean | null;
    };
    check("vant kort tas emot", vand.status === 201, `status ${vand.status}`);
    check("kortet ska sjalvskattas", vandJson.selfAssess === true);
    check("servern rattar ingenting", vandJson.isCorrect === null);
    check(
      "baksidan kommer forst efter vandningen",
      vandJson.correctAnswer === FACIT,
      String(vandJson.correctAnswer)
    );

    const skattning = await fetch(`${BASE}/api/student/practice`, {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ attemptId: vandJson.attemptId, grade: 2 }),
    });
    check(
      "skattningen sparas",
      skattning.status === 200,
      `status ${skattning.status}`
    );

    const rader = await prisma.practiceAttempt.findMany({
      where: { studentId: student.id, questionId: kort.id },
      select: { grade: true, isCorrect: true, value: true },
    });
    check(
      "forsoket ligger i historiken med betyg 2 och elevens egen dom",
      rader.length === 1 &&
        rader[0].grade === 2 &&
        rader[0].isCorrect === true &&
        rader[0].value === "__FC_HARD__",
      JSON.stringify(rader)
    );

    const luckforsok = await fetch(`${BASE}/api/student/practice`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ questionId: lucka.id, value: FACIT }),
    });
    check(
      "luckfragan gar att ova om nagon anropar den direkt - men den kom aldrig med i passet",
      luckforsok.status === 201,
      `status ${luckforsok.status}`
    );

    console.log("\n4. Kortet i en enkat");
    const enkatsida = await getPage(`/s/${enkat.shareCode}`);
    check(
      "enkaten svarar",
      enkatsida.status === 200,
      `status ${enkatsida.status}`
    );
    check(
      "kortet renderas som kort trots att kursen saknar flashcardlage",
      enkatsida.html.includes("Visa svar"),
      "fick en alternativlista eller ett inmatningsfalt"
    );
    check(
      "baksidan foljer med enkaten - kortet ska kunna vandas utan natanrop",
      enkatsida.html.includes(FACIT)
    );

    const svar = await fetch(`${BASE}/api/surveys/${enkat.id}/respond`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({
        answers: [{ questionId: kort.id, value: "__FC_GOOD__" }],
      }),
    });
    const svarJson = (await svar.json()) as {
      quizResults?: { correctAnswer?: string | null }[];
    };
    check("inlamningen tas emot", svar.status === 201, `status ${svar.status}`);
    check(
      "resultatraden visar meningens facit, inte tomt",
      svarJson.quizResults?.[0]?.correctAnswer === FACIT,
      JSON.stringify(svarJson.quizResults)
    );

    const sparat = await prisma.answer.findMany({
      where: { questionId: kort.id, response: { studentId: student.id } },
      select: { value: true, isCorrect: true, grade: true },
    });
    check(
      "skattningen rattades som skattning, inte mot ett alternativ",
      sparat.length === 1 &&
        sparat[0].isCorrect === true &&
        sparat[0].grade === 3,
      JSON.stringify(sparat)
    );
  } finally {
    await prisma.answer.deleteMany({
      where: { response: { survey: { courseId: course.id } } },
    });
    await prisma.response.deleteMany({
      where: { survey: { courseId: course.id } },
    });
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
