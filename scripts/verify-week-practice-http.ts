/**
 * Skarp verifiering av veckoövningen genom det DEPLOYADE HTTP-lagret.
 *
 * Systerskript till verify-week-practice.ts, som bara prövar biblioteket mot
 * prod-rader. Det här går vägen eleven går: egen kurs i kortform, en släppt
 * och en osläppt vecka, egen elev med känt lösenord, riktig inloggning mot
 * prod, och sedan de tre påståenden som funktionen står på.
 *
 *   1. Veckolistan visar den släppta veckan och inte den osläppta.
 *   2. Drillen öppnar för en släppt vecka, ger 404 för en osläppt, och ger
 *      404 för ett ämne i en annan kurs. Länken är inte spärren.
 *   3. Ett vänt kort i drillen skrivs till försökshistoriken som övning -
 *      det var hela poängen med att inte bygga en egen route.
 *
 * Självstädande - kursen med allt under sig rivs i finally. Rör aldrig
 * befintlig elevdata.
 *
 *   npx tsx scripts/verify-week-practice-http.ts
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
(globalThis as unknown as { prisma: PrismaClient }).prisma = prisma;

const MARKER = "__verify-vecka";
const STAMP = Date.now() % 1000000;
const PASSWORD = `vrf-${STAMP}-x`;
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
      code: `VW${STAMP}`,
      flashcardMode: true,
    },
  });

  try {
    // Två veckor. Korten (flerval) och veckotestet (luckfråga) delar ämne,
    // precis som i Engelska 5.
    async function vecka(namn: string, kort: number) {
      const topic = await prisma.topic.create({
        data: { name: `${MARKER} ${namn}`, courseId: course.id },
      });
      const kortIds: number[] = [];
      for (let i = 1; i <= kort; i++) {
        const q = await prisma.question.create({
          data: {
            text: `${namn} ord ${i}`,
            type: "MULTIPLE_CHOICE",
            topicId: topic.id,
            options: {
              create: [
                { text: `ratt-${i}`, isCorrect: true },
                { text: `fel-${i}`, isCorrect: false },
              ],
            },
          },
        });
        kortIds.push(q.id);
      }
      const lucka = await prisma.question.create({
        data: {
          text: `${namn}: the ___ is here.`,
          type: "CLOZE",
          topicId: topic.id,
          config: { answer: "word", accept: [], hint: "ordet" },
        },
      });
      return { topic, kortIds, lucka };
    }

    const v1 = await vecka("Vecka 01", 3);
    const v2 = await vecka("Vecka 02", 3);

    const hour = 60 * 60 * 1000;
    await prisma.survey.create({
      data: {
        title: `${MARKER} Veckotest 01`,
        shareCode: `WA${STAMP}`,
        mode: "QUIZ",
        courseId: course.id,
        openAt: new Date(Date.now() - hour), // släppt
        questions: { create: [{ questionId: v1.lucka.id, order: 1 }] },
      },
    });
    await prisma.survey.create({
      data: {
        title: `${MARKER} Veckotest 02`,
        shareCode: `WB${STAMP}`,
        mode: "QUIZ",
        courseId: course.id,
        openAt: new Date(Date.now() + 24 * hour), // osläppt
        questions: { create: [{ questionId: v2.lucka.id, order: 1 }] },
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
      const html = res.status === 200 ? await res.text() : "";
      return { status: res.status, html };
    };

    console.log("\n1. Veckolistan");
    const lista = await getPage("/student/practice");
    check("sidan Att ova pa svarar", lista.status === 200, `status ${lista.status}`);
    check("rubriken Ova en vecka finns", lista.html.includes("Öva en vecka"));
    check(
      "den slappta veckan syns",
      lista.html.includes(`${MARKER} Vecka 01`)
    );
    check(
      "den oslappta veckan syns INTE",
      !lista.html.includes(`${MARKER} Vecka 02`)
    );
    check(
      "kortantalet stammer (3 kort, 3 nya)",
      lista.html.includes("3 kort") && lista.html.includes("3 nya"),
      "hittade inte etiketten"
    );

    console.log("\n2. Drillen och spärren");
    const drill = await getPage(`/student/practice/${v1.topic.id}`);
    check("slappt vecka gar att oppna", drill.status === 200, `status ${drill.status}`);
    check(
      "drillen visar veckans namn",
      drill.html.includes(`${MARKER} Vecka 01`)
    );
    check(
      "drillen sager att den raknas som ovning",
      drill.html.includes("räknas som övning")
    );
    check(
      "facit foljer inte med till klienten",
      !drill.html.includes("ratt-1"),
      "alternativtexten lackte ut i kortform"
    );

    const stangd = await getPage(`/student/practice/${v2.topic.id}`);
    check("oslappt vecka ger 404", stangd.status === 404, `status ${stangd.status}`);

    // Ett ämne i en annan kurs - länken får inte vara vägen runt kursgränsen
    const främmande = await prisma.topic.findFirst({
      where: { courseId: { not: course.id } },
      select: { id: true },
    });
    if (främmande) {
      const annan = await getPage(`/student/practice/${främmande.id}`);
      check(
        "amne i annan kurs ger 404",
        annan.status === 404,
        `status ${annan.status}`
      );
    }

    console.log("\n3. Drillen matar FSRS");
    const kortId = v1.kortIds[0];
    const vand = await fetch(`${BASE}/api/student/practice`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ questionId: kortId, value: FLASHCARD_REVEAL }),
    });
    const vandJson = (await vand.json()) as {
      attemptId?: number;
      selfAssess?: boolean;
      correctAnswer?: string;
    };
    check("vant kort tas emot", vand.status === 201, `status ${vand.status}`);
    check("kortet ska sjalvskattas", vandJson.selfAssess === true);
    check(
      "baksidan kommer forst efter vandningen",
      vandJson.correctAnswer === "ratt-1",
      String(vandJson.correctAnswer)
    );

    const skattning = await fetch(`${BASE}/api/student/practice`, {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ attemptId: vandJson.attemptId, grade: 4 }),
    });
    check("skattningen sparas", skattning.status === 200, `status ${skattning.status}`);

    const rader = await prisma.practiceAttempt.findMany({
      where: { studentId: student.id, questionId: kortId },
      select: { grade: true, isCorrect: true },
    });
    check(
      "forsoket ligger i historiken som ovning med betyg 4",
      rader.length === 1 && rader[0].grade === 4 && rader[0].isCorrect === true,
      JSON.stringify(rader)
    );

    console.log("
4. Avbryt och fortsatt senare");
    const efter = await getPage("/student/practice");
    check(
      "veckolistan raknar bort kortet (2 kvar idag)",
      efter.html.includes("2 kvar idag"),
      "etiketten uppdaterades inte"
    );

    const forts = await getPage(`/student/practice/${v1.topic.id}`);
    check(
      "drillen fortsatter dar eleven slutade",
      forts.html.includes("2 kort kvar av veckans 3") &&
        forts.html.includes("du gjorde 1 tidigare idag"),
      "sammanfattningen sag inte att veckan var pabörjad"
    );
    check(
      "knappen Fortsatt senare finns",
      forts.html.includes("Fortsätt senare")
    );

    // Ta resten av veckan
    for (const id of v1.kortIds.slice(1)) {
      const r = await fetch(`${BASE}/api/student/practice`, {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({ questionId: id, value: FLASHCARD_REVEAL }),
      });
      const j = (await r.json()) as { attemptId?: number };
      await fetch(`${BASE}/api/student/practice`, {
        method: "PATCH",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({ attemptId: j.attemptId, grade: 3 }),
      });
    }

    const klar = await getPage(`/student/practice/${v1.topic.id}`);
    check(
      "hela veckan gjord idag ger klarlage, inte en tom drill",
      klar.status === 200 && klar.html.includes("Klar med veckan för idag"),
      `status ${klar.status}`
    );
    check(
      "listan sager klar for idag",
      (await getPage("/student/practice")).html.includes("klar för idag")
    );

    const igen = await getPage(`/student/practice/${v1.topic.id}?igen=1`);
    check(
      "vagen att kora igenom anda finns",
      igen.status === 200 && igen.html.includes("3 kort, hela veckan"),
      `status ${igen.status}`
    );
  } finally {
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
