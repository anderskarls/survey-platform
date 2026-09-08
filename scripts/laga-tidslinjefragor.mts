/**
 * Lagar de fem frågorna i uppgift 376 "Tidslinjen: placera epokernas gränser"
 * (kurs 12, MSA26B) så att de blir riktiga klickfrågor i tidslinjen.
 *
 * Bakgrund: MCP-serverns byggda `dist` var från 2026-09-03, tre dagar före
 * frågetypen TIMELINE mergades till main. Den byggda CSV-parsern kände inte
 * typen och lät den falla igenom till MULTIPLE_CHOICE, så fem alternativlösa
 * flervalsfrågor landade i kursen. Källan var rättad - bygget var det inte.
 *
 * Skriptet RADERAR INGENTING. Frågorna har redan rätt text och rätt ordning i
 * uppgiften; det som saknas är typen och konfigurationen. De skrivs på plats,
 * vilket behåller fråge-id, uppgiftens koppling och delningskoden MRgi_MhI.
 * Parsern är webbappens egen (src/lib/csv.ts), som kan TIMELINE.
 *
 * Körs med:  npx tsx scripts/laga-tidslinjefragor.mts
 */
import { config as laddaEnv } from "dotenv";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { readFileSync } from "fs";
import { parseCsvContent, validateCsvRows } from "../src/lib/csv";
import { timelineConfigSchema } from "../src/lib/tidslinje";

laddaEnv({ path: "mcp-server/.env" });
neonConfig.webSocketConstructor = ws;
const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const SURVEY = 376;
const KURS = 12;
const CSV =
  "C:/Brain/output/lessons/Historia/Var börjar historien - epokindelning och forntid/fragor/tidslinjen-artal-klick.csv";

async function main() {
  // --- 1. Läs och validera CSV:n med webbappens parser ---
  const rows = parseCsvContent(readFileSync(CSV, "utf8"));
  const fel = validateCsvRows(rows);
  if (fel.length > 0) throw new Error("CSV-fel: " + fel.join("; "));
  for (const r of rows) {
    if (r.type !== "TIMELINE") throw new Error(`Rad med fel typ: ${r.type}`);
    const check = timelineConfigSchema.safeParse(r.config);
    if (!check.success) {
      throw new Error(
        `Ogiltig config för "${r.text}": ` +
          check.error.issues.map((i) => i.message).join("; ")
      );
    }
  }
  console.log(`CSV: ${rows.length} rader, alla TIMELINE, config validerad.`);

  // --- 2. Hämta uppgiften och para ihop rad med fråga på texten ---
  const survey = await prisma.survey.findUnique({
    where: { id: SURVEY },
    include: {
      questions: { include: { question: true }, orderBy: { order: "asc" } },
    },
  });
  if (!survey) throw new Error(`Uppgift ${SURVEY} finns inte.`);
  if (survey.courseId !== KURS) throw new Error("Fel kurs - avbryter.");
  if (survey.questions.length !== rows.length) {
    throw new Error(
      `Uppgiften har ${survey.questions.length} frågor, CSV:n ${rows.length}.`
    );
  }

  const par = survey.questions.map((sq) => {
    const rad = rows.find((r) => r.text === sq.question.text);
    if (!rad) throw new Error(`Ingen CSV-rad matchar "${sq.question.text}".`);
    return { fraga: sq.question, rad };
  });

  // --- 3. Skriv typ och config på plats ---
  let andrade = 0;
  for (const { fraga, rad } of par) {
    if (fraga.type === "TIMELINE" && fraga.config) {
      console.log(`  ${fraga.id} är redan TIMELINE - lämnas orörd.`);
      continue;
    }
    await prisma.question.update({
      where: { id: fraga.id },
      data: { type: "TIMELINE", config: rad.config as never },
    });
    andrade++;
  }
  console.log(`${andrade} frågor skrivna om från MULTIPLE_CHOICE till TIMELINE.`);

  // --- 4. Verifiera skarpt mot databasen ---
  const efter = await prisma.survey.findUnique({
    where: { id: SURVEY },
    include: {
      questions: {
        include: { question: { include: { options: true } } },
        orderBy: { order: "asc" },
      },
    },
  });
  console.log(
    `\nVerifiering: s${efter?.id} "${efter?.title}" - kod ${efter?.shareCode}, läge ${efter?.mode}`
  );
  let allaOk = true;
  for (const sq of efter?.questions ?? []) {
    const q = sq.question;
    const parsed = timelineConfigSchema.safeParse(q.config);
    const ok = q.type === "TIMELINE" && parsed.success && q.options.length === 0;
    if (!ok) allaOk = false;
    console.log(
      `  ${ok ? "OK " : "FEL"} ${q.id} ${q.type} ` +
        `form=${parsed.success ? parsed.data.form : "-"} ` +
        `mal=${parsed.success ? parsed.data.mal[0].ar : "-"} ` +
        `:: ${q.text.slice(0, 45)}`
    );
  }
  console.log(
    allaOk
      ? "\nKlart. Alla fem är tidslinjefrågor - dela ut koden MRgi_MhI."
      : "\nNågot stämmer inte - se raderna märkta FEL ovan."
  );

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
