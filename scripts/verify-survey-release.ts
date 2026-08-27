/**
 * Skarp verifiering av släppspärren (Survey.openAt) mot prod.
 *
 * Går hela vägen genom det deployade HTTP-lagret, inte bara genom
 * biblioteksfunktionerna: skriptet skapar sin egen kurs, sin egen elev med
 * känt lösenord, loggar in mot prod som den eleven och försöker svara på ett
 * test som inte har släppts. Det är den vägen en delad länk tar, och det är
 * den som spärren måste hålla.
 *
 * Fyra enkäter täcker de fyra lägena: osläppt (openAt i framtiden), släppt
 * (openAt passerad), otidsatt (openAt = null, som allt fungerade förut) och
 * manuell (läraren öppnar själv - sentineltidpunkten).
 *
 * Självstädande - kursen med allt under sig rivs i finally. Rör aldrig
 * befintlig elevdata.
 *
 *   npx tsx scripts/verify-survey-release.ts
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

const MARKER = "__verify-openat";
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
  const {
    isReleased,
    releasedWhere,
    nextRelease,
    isManualRelease,
    releaseNotice,
    MANUAL_RELEASE_AT,
  } = await import("../src/lib/survey-release");

  const course = await prisma.course.create({
    data: { name: `${MARKER} kurs ${STAMP}`, code: `VOA${STAMP}` },
  });

  try {
    const topic = await prisma.topic.create({
      data: { name: `${MARKER} topic`, courseId: course.id },
    });
    const question = await prisma.question.create({
      data: {
        text: `${MARKER} fråga`,
        type: "MULTIPLE_CHOICE",
        topicId: topic.id,
        options: {
          create: [
            { text: "ratt", isCorrect: true },
            { text: "fel", isCorrect: false },
          ],
        },
      },
    });

    const hour = 60 * 60 * 1000;
    const mkSurvey = (title: string, openAt: Date | null, code: string) =>
      prisma.survey.create({
        data: {
          title: `${MARKER} ${title}`,
          shareCode: code,
          mode: "QUIZ",
          courseId: course.id,
          openAt,
          questions: { create: [{ questionId: question.id, order: 1 }] },
        },
      });

    const framtid = await mkSurvey(
      "oslappt",
      new Date(Date.now() + 24 * hour),
      `VA${STAMP}`
    );
    const datid = await mkSurvey(
      "slappt",
      new Date(Date.now() - hour),
      `VB${STAMP}`
    );
    const otidsatt = await mkSurvey("otidsatt", null, `VC${STAMP}`);
    const manuell = await mkSurvey("manuellt", MANUAL_RELEASE_AT, `VD${STAMP}`);

    const student = await prisma.student.create({
      data: {
        number: 1,
        username: `${MARKER}-${STAMP}`,
        passwordHash: await bcrypt.hash(PASSWORD, 10),
        courseId: course.id,
        isTest: true,
      },
    });

    // --- biblioteket mot riktiga rader ------------------------------------
    console.log("\nBiblioteket mot prod-rader");
    check("isReleased: framtida openAt = ej slappt", !isReleased(framtid));
    check("isReleased: passerad openAt = slappt", isReleased(datid));
    check("isReleased: null = slappt", isReleased(otidsatt));

    const synliga = await prisma.survey.findMany({
      where: { courseId: course.id, ...releasedWhere() },
      select: { id: true },
    });
    const synligaIds = new Set(synliga.map((s) => s.id));
    check(
      "releasedWhere filtrerar bort det oslappta i en riktig query",
      synligaIds.size === 2 && !synligaIds.has(framtid.id),
      `fick ${[...synligaIds].join(",")}`
    );

    const next = nextRelease([framtid, datid, otidsatt]);
    check("nextRelease pekar ut det oslappta", next?.id === framtid.id);

    check("isManualRelease kanner igen sentineln", isManualRelease(manuell));
    check("isManualRelease sager nej om ett riktigt schema", !isManualRelease(framtid));
    check("isReleased: manuellt test ar stangt", !isReleased(manuell));
    check(
      "nextRelease hoppar over det manuella",
      nextRelease([manuell, framtid])?.id === framtid.id
    );
    check(
      "releaseNotice ger beskedet, inte sentineldatumet",
      releaseNotice(manuell) === "Öppnas när läraren släpper den",
      releaseNotice(manuell)
    );

    const synligaMedManuell = await prisma.survey.findMany({
      where: { courseId: course.id, ...releasedWhere() },
      select: { id: true },
    });
    check(
      "releasedWhere filtrerar bort aven det manuella",
      !synligaMedManuell.some((s) => s.id === manuell.id)
    );

    // --- HTTP-lagret på prod ----------------------------------------------
    console.log("\nHTTP-lagret pa prod");
    const login = await fetch(`${BASE}/api/auth/student-login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: student.username, password: PASSWORD }),
    });
    const cookie = cookieFrom(login);
    check(
      "elevinloggning mot prod",
      login.status === 200 && !!cookie,
      `status ${login.status}`
    );
    if (!cookie) return;

    const send = async (method: string, path: string, body: unknown) => {
      const res = await fetch(`${BASE}${path}`, {
        method,
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify(body),
      });
      let json: { error?: string } = {};
      try {
        json = (await res.json()) as { error?: string };
      } catch {
        // tom kropp räknas som tomt felmeddelande
      }
      return { status: res.status, error: json.error ?? "" };
    };
    const post = (path: string, body: unknown) => send("POST", path, body);
    // Utkastet sparas med PUT - draft-routen har ingen POST alls
    const put = (path: string, body: unknown) => send("PUT", path, body);

    const svar = { answers: [{ questionId: question.id, value: "ratt" }] };
    const utkast = { answers: { [question.id]: "ratt" } };

    const r1 = await post(`/api/surveys/${framtid.id}/respond`, svar);
    check("respond avvisar oslappt test", r1.status === 403, `status ${r1.status}`);
    check(
      "felmeddelandet sager nar det oppnar",
      /öppnar/.test(r1.error),
      JSON.stringify(r1.error)
    );

    const r2 = await put(`/api/surveys/${framtid.id}/draft`, utkast);
    check("draft avvisar oslappt test", r2.status === 403, `status ${r2.status}`);

    const r3 = await post(`/api/surveys/${datid.id}/respond`, svar);
    check(
      "respond slapper igenom slappt test",
      r3.status === 201,
      `status ${r3.status} ${r3.error}`
    );

    const r4 = await post(`/api/surveys/${otidsatt.id}/respond`, svar);
    check(
      "respond slapper igenom otidsatt test",
      r4.status === 201,
      `status ${r4.status} ${r4.error}`
    );

    const r5 = await put(`/api/surveys/${datid.id}/draft`, utkast);
    check(
      "draft fungerar pa slappt test",
      r5.status === 200,
      `status ${r5.status} ${r5.error}`
    );

    const r6 = await post(`/api/surveys/${manuell.id}/respond`, svar);
    check("respond avvisar manuellt test", r6.status === 403, `status ${r6.status}`);
    check(
      "felmeddelandet talar om lararen, aldrig sentineldatumet",
      /släpper/.test(r6.error) && !/2099/.test(r6.error),
      JSON.stringify(r6.error)
    );

    const r7 = await put(`/api/surveys/${manuell.id}/draft`, utkast);
    check("draft avvisar manuellt test", r7.status === 403, `status ${r7.status}`);

    // Inget svar ska ha letat sig in på det osläppta testet
    const spar = await prisma.response.count({ where: { surveyId: framtid.id } });
    const sparUtkast = await prisma.draftResponse.count({
      where: { surveyId: framtid.id },
    });
    check(
      "inga rader skapade pa det oslappta testet",
      spar === 0 && sparUtkast === 0,
      `${spar} svar, ${sparUtkast} utkast`
    );
  } finally {
    // Nerifrån och upp: Question -> Topic saknar cascade, och Response.student
    // hindrar att eleven raderas medan svaren står kvar.
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
