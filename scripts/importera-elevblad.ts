/**
 * Importerar ett elevblad som uppgift i ett moment: tabellerna blir tabellfrågor
 * (TABLE), ★-frågorna fritext. Spec:en byggs ur elevbladets markdown med
 * C:\Brain\resources\elevuppgift-utskrift\blad2app.py.
 *
 * Skapar ämne, frågor och uppgift (SURVEY) med unitId och lektion i en
 * transaktion - inget separat kopplingssteg som efter create_quiz_from_csv.
 *
 *   npx tsx scripts/importera-elevblad.ts <spec.json> --kurs 10 --unit 5 --lektion 5 --amne "Antiken - Lektion 5"
 *     [--titel "..."]   uppgiftens titel (annars bladets H1)
 *     [--skarpt]        skriver; utan flaggan är det en torrkörning
 */
import { readFileSync } from "node:fs";
import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { nanoid } from "nanoid";
import { tabellConfigSchema } from "../src/lib/tabell";

config({ path: "mcp-server/.env", quiet: true });
neonConfig.webSocketConstructor = ws;
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL saknas (mcp-server/.env)");

const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL }) });

function flagga(namn: string): string | undefined {
  const i = process.argv.indexOf(`--${namn}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}
function heltal(namn: string): number {
  const v = Number(flagga(namn));
  if (!Number.isInteger(v) || v <= 0) throw new Error(`--${namn} saknas eller är inte ett heltal`);
  return v;
}

type Fraga = { type: "TABLE" | "FREE_TEXT"; text: string; config?: unknown };
type Spec = { titel: string; beskrivning: string; fragor: Fraga[] };

async function main() {
  const fil = process.argv[2];
  if (!fil || fil.startsWith("--")) throw new Error("Ange spec-filen först");
  const spec = JSON.parse(readFileSync(fil, "utf-8")) as Spec;
  const kurs = heltal("kurs");
  const unit = heltal("unit");
  const lektion = heltal("lektion");
  const amne = flagga("amne");
  if (!amne) throw new Error("--amne saknas (frågornas ämne i frågebanken)");
  const titel = flagga("titel") ?? spec.titel;
  const skarpt = process.argv.includes("--skarpt");

  // Configen valideras här, inte först när eleven öppnar uppgiften.
  for (const [i, f] of spec.fragor.entries()) {
    if (f.type === "TABLE") {
      const p = tabellConfigSchema.safeParse(f.config);
      if (!p.success) throw new Error(`Fråga ${i + 1} "${f.text}": ${p.error.issues.map((x) => x.message).join("; ")}`);
    } else if (f.type !== "FREE_TEXT") {
      throw new Error(`Fråga ${i + 1}: okänd typ ${f.type}`);
    }
    if (f.text.length > 1000) throw new Error(`Fråga ${i + 1}: frågetexten är över 1000 tecken`);
  }

  const u = await prisma.unit.findUnique({ where: { id: unit }, select: { courseId: true, title: true } });
  if (!u) throw new Error(`Unit ${unit} finns inte`);
  if (u.courseId !== kurs) throw new Error(`Unit ${unit} ligger i kurs ${u.courseId}, inte ${kurs}`);

  console.log(skarpt ? "== SKARPT ==" : "== TORRKÖRNING (inget skrivs) ==");
  console.log(`kurs ${kurs}, unit ${unit} "${u.title}", lektion ${lektion}, ämne "${amne}"`);
  console.log(`uppgift: "${titel}" (SURVEY)\nbeskrivning: ${spec.beskrivning}\n`);
  for (const [i, f] of spec.fragor.entries()) {
    if (f.type === "TABLE") {
      const c = tabellConfigSchema.parse(f.config);
      const rutor = c.rader.flat().filter((x) => x === null).length;
      console.log(`  ${i + 1}. TABELL ${f.text} - ${c.kolumner.length} kolumner, ${c.rader.length} rader, ${rutor} skrivrutor`);
    } else {
      console.log(`  ${i + 1}. FRITEXT ${f.text.slice(0, 100)}`);
    }
  }

  if (!skarpt) {
    console.log("\nTorrkörning klar. Kör om med --skarpt för att skriva.");
    return;
  }

  const shareCode = nanoid(8);
  const survey = await prisma.$transaction(
    async (tx) => {
      const topic = await tx.topic.upsert({
        where: { courseId_name: { courseId: kurs, name: amne } },
        update: {},
        create: { name: amne, courseId: kurs },
      });
      const ids: number[] = [];
      for (const f of spec.fragor) {
        const q = await tx.question.create({
          data: {
            text: f.text,
            type: f.type,
            topicId: topic.id,
            config: f.type === "TABLE" ? (tabellConfigSchema.parse(f.config) as never) : undefined,
          },
        });
        ids.push(q.id);
      }
      return tx.survey.create({
        data: {
          title: titel,
          description: spec.beskrivning,
          shareCode,
          mode: "SURVEY",
          courseId: kurs,
          unitId: unit,
          lesson: lektion,
          questions: { create: ids.map((questionId, order) => ({ questionId, order })) },
        },
        include: { questions: { orderBy: { order: "asc" }, include: { question: { select: { id: true, type: true } } } } },
      });
    },
    { timeout: 30_000, maxWait: 5_000 }
  );

  console.log(`\nSKRIVET: survey ${survey.id} ${survey.shareCode} unit ${survey.unitId} lektion ${survey.lesson}`);
  for (const sq of survey.questions) console.log(`  [${sq.order}] q${sq.question.id} ${sq.question.type}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
