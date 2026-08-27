/**
 * Slar pa eller av kortlaget (Course.flashcardMode) for en kurs.
 *
 * Samma reglage som pa kursens admin-dashboard, men kobart fran terminalen -
 * anvandbart nar en kurs skapats utanfor det har flodet. Kortlaget ar ett
 * PRESENTATIONSLAGE: fragorna forblir MULTIPLE_CHOICE, sa laget kan slas av
 * och pa utan datamigrering och utan att elevernas FSRS-historik pavverkas.
 *
 * Anvandning:
 *   node scripts/set-flashcard-mode.mjs <kursId> on|off
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

const [courseArg, lageArg] = process.argv.slice(2);
if (!courseArg || !["on", "off"].includes(lageArg)) {
  console.error("Anvandning: node scripts/set-flashcard-mode.mjs <kursId> on|off");
  process.exit(1);
}
const courseId = Number(courseArg);
const flashcardMode = lageArg === "on";

neonConfig.webSocketConstructor = ws;
const prisma = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL }),
});

const fore = await prisma.course.findUnique({ where: { id: courseId } });
if (!fore) {
  console.error(`Kurs ${courseId} finns inte.`);
  process.exit(1);
}
const efter = await prisma.course.update({ where: { id: courseId }, data: { flashcardMode } });
console.log(
  `Kurs ${efter.id} "${efter.name}": flashcardMode ${fore.flashcardMode} -> ${efter.flashcardMode}`
);
await prisma.$disconnect();
