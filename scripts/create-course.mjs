/**
 * Skapar en TOM kurs (namn + kurskod), utan elever.
 *
 * Syskonskript till create-course-with-students.mjs, som kraver ett antal
 * elever redan vid skapandet. Innehallet importeras separat och klasslistan
 * kan komma senare - kor scripts/add-students.mjs nar antalet ar kant.
 *
 * Logiken speglar src/app/api/courses/route.ts ordagrant:
 *   kurskod  nanoid(6) i versaler, _ och - ersatta med X
 *
 * Anvandning:
 *   node scripts/create-course.mjs "Kursnamn" [--flashcard]
 */
import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { nanoid } from "nanoid";

const moduleDir = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(moduleDir, "../mcp-server/.env") });

const args = process.argv.slice(2);
const flashcard = args.includes("--flashcard");
const courseName = args.filter((a) => !a.startsWith("--"))[0];
if (!courseName) {
  console.error('Anvandning: node scripts/create-course.mjs "Kursnamn" [--flashcard]');
  process.exit(1);
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL saknas i mcp-server/.env");
  process.exit(1);
}
neonConfig.webSocketConstructor = ws;
const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString }) });

const generateCourseCode = () => nanoid(6).toUpperCase().replace(/[_-]/g, "X");

async function main() {
  const clash = await prisma.course.findUnique({ where: { name: courseName } });
  if (clash) {
    console.error(`Avbryter: kursen "${courseName}" finns redan (id ${clash.id}, kod ${clash.code}).`);
    process.exit(1);
  }

  let code = generateCourseCode();
  while (await prisma.course.findUnique({ where: { code } })) code = generateCourseCode();

  const course = await prisma.course.create({
    data: { name: courseName, code, flashcardMode: flashcard },
  });

  console.log(`Skapad: kurs ${course.id} "${course.name}"`);
  console.log(`Kurskod: ${course.code}`);
  console.log(`Kortlage (flashcardMode): ${course.flashcardMode}`);
  console.log(`Elever: 0 - kor scripts/add-students.mjs ${course.id} <antal> <utfil.csv>`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
