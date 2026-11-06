/**
 * Gör momentuppgifter till en serie (kartvyn, se src/lib/serie.ts): sätter
 * Survey.series och byter "lämna in" i beskrivningen mot autosparning, eftersom
 * seriens sidor aldrig lämnas in.
 *
 *   npx tsx scripts/satt-serie.ts --survey 475-481,483-489 --serie "Kartan - makt och skatt" [--skarpt]
 *
 * --survey  uppgifter, kommaseparerade och/eller intervall (475-481)
 * --serie   seriens namn = rubriken eleven ser i kartvyn
 * --ta-bort tar bort uppgifterna ur serien (beskrivningen lämnas som den är)
 *
 * Utan --skarpt skrivs bara vad som skulle ändras. Vägrar om en uppgift saknar
 * moment (unitId), ligger i olika moment, eller redan har inlämningar - de
 * syns inte i kartvyns status, och eleven skulle se två versioner.
 */
import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";

config({ path: "mcp-server/.env", quiet: true });
neonConfig.webSocketConstructor = ws;
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL saknas (mcp-server/.env)");
const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL }) });

function flagga(namn: string): string | undefined {
  const i = process.argv.indexOf(`--${namn}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}

function ids(spec: string): number[] {
  return spec.split(",").flatMap((del) => {
    const [a, b] = del.split("-").map(Number);
    if (!Number.isInteger(a)) throw new Error(`Ogiltigt id: ${del}`);
    if (b === undefined) return [a];
    return Array.from({ length: b - a + 1 }, (_, i) => a + i);
  });
}

/** Instruktionen om inlämning, omskriven för autosparning. */
function utanInlamning(text: string): string {
  return text
    .replace(/Fyll i och lämna in i lektion (\d+)\./g, "Fyll i under lektion $1 - allt sparas automatiskt.")
    .replace(
      /Du börjar i lektion (\d+) och sparar som utkast\. I lektion (\d+) fyller du klart och lämnar in\./g,
      "Du börjar i lektion $1 och fyller klart i lektion $2 - allt sparas automatiskt."
    );
}

async function main() {
  const surveyIds = ids(flagga("survey") ?? "");
  const serie = flagga("serie");
  const taBort = process.argv.includes("--ta-bort");
  const skarpt = process.argv.includes("--skarpt");
  if (surveyIds.length === 0 || (!serie && !taBort)) throw new Error("--survey och --serie (eller --ta-bort) krävs");

  const surveys = await prisma.survey.findMany({
    where: { id: { in: surveyIds } },
    select: { id: true, title: true, description: true, unitId: true, courseId: true, series: true, _count: { select: { responses: true } } },
    orderBy: { id: "asc" },
  });
  const saknas = surveyIds.filter((id) => !surveys.some((s) => s.id === id));
  if (saknas.length) throw new Error(`Finns inte: ${saknas.join(", ")}`);

  for (const s of surveys) {
    if (s.unitId == null) throw new Error(`#${s.id} hör inte till något moment`);
    if (!taBort && s._count.responses > 0) {
      throw new Error(`#${s.id} har ${s._count.responses} inlämningar - öppna dem igen (oppna-inlamning.ts) först`);
    }
  }

  for (const s of surveys) {
    const series = taBort ? null : serie!;
    const description = taBort ? s.description : utanInlamning(s.description);
    const andrad = description !== s.description;
    console.log(
      `#${s.id} kurs ${s.courseId} unit ${s.unitId} | ${s.title}\n  serie: ${s.series ?? "-"} -> ${series ?? "-"}${
        andrad ? `\n  beskrivning: ${description}` : ""
      }`
    );
    if (skarpt) {
      await prisma.survey.update({ where: { id: s.id }, data: { series, description } });
    }
  }
  console.log(skarpt ? `\nKlart: ${surveys.length} uppgifter.` : `\nTorrkörning - lägg till --skarpt för att skriva.`);
}

main()
  .catch((e) => {
    console.error(e.message ?? e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
