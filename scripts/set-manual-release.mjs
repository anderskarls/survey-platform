/**
 * Satter en eller flera kurser i MANUELLT slapplage: varje enkat goms tills
 * lararen sjalv trycker "Slapp nu" i enkatlistan.
 *
 * Laget bars av Survey.openAt - en tidpunkt sa langt fram att den aldrig
 * passerar av sig sjalv - sa sparren galler pa alla stallen som redan
 * kontrollerar openAt: elevvyerna, delningslanken, respond och draft.
 * Se src/lib/survey-release.ts.
 *
 * Utan --apply skrivs ingenting, bara forhandsvisningen.
 *
 *   node scripts/set-manual-release.mjs 13 36 38
 *   node scripts/set-manual-release.mjs 13 36 38 --apply
 */
import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";

const moduleDir = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(moduleDir, "../mcp-server/.env") });

// Samma tidpunkt som MANUAL_RELEASE_AT i src/lib/survey-release.ts. Skripten
// kan inte importera TS-modulen, sa vardet star har - lases gor bade appen och
// skriptet via arsgransen 2090, inte via exakt likhet.
const MANUAL_RELEASE_AT = new Date("2099-01-01T00:00:00.000Z");

const APPLY = process.argv.includes("--apply");
const kursIds = process.argv.slice(2).filter((a) => !a.startsWith("--")).map(Number);
if (kursIds.length === 0 || kursIds.some((n) => !Number.isInteger(n) || n < 1)) {
  console.error("Anvandning: node scripts/set-manual-release.mjs <kursId...> [--apply]");
  process.exit(1);
}

neonConfig.webSocketConstructor = ws;
const prisma = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL }),
});

try {
  for (const courseId of kursIds) {
    const kurs = await prisma.course.findUnique({ where: { id: courseId } });
    if (!kurs) {
      console.error(`Kurs ${courseId} finns inte - hoppar over.`);
      continue;
    }
    const enkater = await prisma.survey.findMany({
      where: { courseId },
      select: { id: true, title: true, openAt: true },
      orderBy: { title: "asc" },
    });
    const redanManuella = enkater.filter(
      (s) => s.openAt && s.openAt.getUTCFullYear() >= 2090
    ).length;
    const oppna = enkater.filter((s) => !s.openAt).length;

    console.log(
      `Kurs ${courseId} "${kurs.name}": ${enkater.length} enkater ` +
        `(${oppna} oppna, ${redanManuella} redan manuella)`
    );

    if (APPLY) {
      const { count } = await prisma.survey.updateMany({
        where: { courseId },
        data: { openAt: MANUAL_RELEASE_AT },
      });
      console.log(`  -> ${count} enkater vantar nu pa lararens knapptryck.`);
    }
  }
  if (!APPLY) console.log("\nTorrkorning - inget skrivet. Kor om med --apply.");
} finally {
  await prisma.$disconnect();
}
