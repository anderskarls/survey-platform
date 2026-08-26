// Engångsimport av förmågeövningar från CSV, via appens EGNA parser och
// validering (src/lib/csv.ts) - samma kodväg som POST /api/courses/[id]/
// questions/import, men utan HTTP-lagret. Behövs eftersom admin-API-nyckeln
// i den här miljön inte längre matchar prod.
//
//   npx tsx scripts/import-formaga.ts <courseId> <csvPath> [--commit]
//
// Utan --commit är körningen en torrkörning: inget skrivs.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { parseCsvContent, questionCreateData, validateCsvRows } from "../src/lib/csv";

// DATABASE_URL bor i mcp-serverns .env; Neons WebSocket-drivrutin krävs
// eftersom TCP 5432 är blockerat i den här miljön.
config({ path: resolve(process.cwd(), "mcp-server/.env") });
neonConfig.webSocketConstructor = ws;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL saknas i mcp-server/.env");

const prisma = new PrismaClient({
  adapter: new PrismaNeon({ connectionString }),
});

async function main() {
  const courseId = Number(process.argv[2]);
  const csvPath = process.argv[3];
  const commit = process.argv.includes("--commit");
  if (!courseId || !csvPath) {
    throw new Error("Använd: npx tsx scripts/import-formaga.ts <courseId> <csvPath> [--commit]");
  }

  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { name: true },
  });
  if (!course) throw new Error(`Kurs ${courseId} finns inte`);

  const rows = parseCsvContent(readFileSync(csvPath, "utf8"));
  if (rows.length === 0) throw new Error("Inga giltiga rader hittades");
  const errors = validateCsvRows(rows);
  if (errors.length > 0) {
    throw new Error(`Importen avvisades:\n${errors.join("\n")}`);
  }

  console.log(`Kurs ${courseId}: ${course.name}`);
  for (const r of rows) {
    console.log(`  ${r.type.padEnd(10)} ${(r.subskill ?? "-").padEnd(13)} ${r.text.slice(0, 60)}...`);
  }

  // Dubblettskydd: samma frågetext i samma topic betyder att importen
  // redan körts en gång.
  const topics = [...new Set(rows.map((r) => r.topic))];
  const existing = await prisma.question.findMany({
    where: {
      topic: { courseId, name: { in: topics } },
      text: { in: rows.map((r) => r.text) },
    },
    select: { id: true, text: true },
  });
  if (existing.length > 0) {
    console.log(`\n${existing.length} av frågorna finns redan i kursen - avbryter.`);
    console.log(existing.map((e) => `  #${e.id} ${e.text.slice(0, 50)}...`).join("\n"));
    return;
  }

  if (!commit) {
    console.log("\nTorrkörning - inget skrevs. Lägg till --commit för att importera.");
    return;
  }

  const created: number[] = [];
  await prisma.$transaction(
    async (tx) => {
      const topicMap = new Map<string, number>();
      for (const name of topics) {
        const topic = await tx.topic.upsert({
          where: { courseId_name: { courseId, name } },
          update: {},
          create: { name, courseId },
        });
        topicMap.set(name, topic.id);
      }
      for (const row of rows) {
        const q = await tx.question.create({
          data: { ...questionCreateData(row), topicId: topicMap.get(row.topic)! },
          select: { id: true },
        });
        created.push(q.id);
      }
    },
    { timeout: 30_000 }
  );

  console.log(`\nImporterade ${created.length} frågor: ${created.join(", ")}`);
  for (const [name] of topics.entries()) void name;
  const topicRows = await prisma.topic.findMany({
    where: { courseId, name: { in: topics } },
    select: { id: true, name: true },
  });
  for (const t of topicRows) {
    console.log(`Topic ${t.id}: ${t.name}  ->  /student/formagor/${t.id}`);
  }
}

main()
  .catch((e) => {
    console.error("FEL:", e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
