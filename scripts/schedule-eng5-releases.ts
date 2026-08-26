/**
 * Lägger veckoschemat över Engelska 5:s veckotest (kurs 13).
 *
 * Samma räkning som lärardashboardens schemaläggare: datumen räknas mot
 * numret i titeln, inte mot ordningen i listan, så att numreringens luckor
 * (05, 10, 15, 20, 25, 30) blir tomma veckor i stället för att glida ur läge.
 * Funktionerna importeras från src/lib/survey-release - skriptet ska inte ha
 * en egen kopia av regeln.
 *
 * Utan --apply skrivs ingenting, bara förhandsvisningen.
 *
 *   npx tsx scripts/schedule-eng5-releases.ts            # visa
 *   npx tsx scripts/schedule-eng5-releases.ts --apply    # skriv
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

const COURSE_ID = 13;
/** Startpunkt i lokal väggklocka - måndag 31 augusti 2026, 08:00. */
const START = new Date(2026, 7, 31, 8, 0, 0, 0);
const APPLY = process.argv.includes("--apply");

async function main() {
  const { compareTitles, numberedReleaseDates, formatRelease } = await import(
    "../src/lib/survey-release"
  );

  const surveys = await prisma.survey.findMany({
    where: { courseId: COURSE_ID },
    select: { id: true, title: true, openAt: true },
  });
  const ordered = [...surveys].sort((a, b) => compareTitles(a.title, b.title));
  const dates = numberedReleaseDates(
    START,
    ordered.map((s) => s.title)
  );
  if (!dates) {
    throw new Error(
      "Titlarna bär ingen entydig veckonumrering - schemat kan inte räknas mot numret"
    );
  }

  console.log(`Kurs ${COURSE_ID}: ${ordered.length} enkäter, start ${formatRelease(START)}\n`);
  ordered.forEach((s, i) => {
    const fore = s.openAt ? formatRelease(s.openAt) : "oppen direkt";
    console.log(
      `  ${String(s.id).padEnd(4)} ${s.title.padEnd(14)} ${fore.padEnd(18)} ->  ${formatRelease(dates[i])}`
    );
  });

  if (!APPLY) {
    console.log("\nTorrkorning - inget skrivet. Kor om med --apply.");
    return;
  }

  // Hela schemat eller inget, precis som PATCH-routen: halvvägs genom en
  // termin är ett tillstånd ingen bett om.
  await prisma.$transaction(
    ordered.map((s, i) =>
      prisma.survey.update({ where: { id: s.id }, data: { openAt: dates[i] } })
    )
  );
  console.log(`\nSkrivet: ${ordered.length} enkäter har fatt slapptidpunkt.`);
}

main().finally(() => prisma.$disconnect());
