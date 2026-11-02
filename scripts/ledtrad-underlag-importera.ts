/**
 * Fyller Question.hintBasis ur lektionens facit och källmaterial, så att
 * frågorna får en ledtrådsknapp. Utan --skriv visas bara vad som skulle
 * skrivas. Kräver att migrationen 20261028120000_ledtradar är deployad.
 *
 *   npx tsx scripts/ledtrad-underlag-importera.ts --surveys 385,386 \
 *     --facit "<md>" --kalla "<md>" [--graf "<md>"] [--skriv]
 *
 * Skriver bara frågor där underlaget gick att hitta och validerar mot
 * ledtradUnderlagSchema. Rör inget annat fält. Kör om när facit ändrats.
 * Med --graf följer frågans del av momentets kunskapsgraf med (fältet graf);
 * utan --graf skrivs underlaget utan graf, så en körning utan flaggan tar bort den.
 */
import { config } from "dotenv";
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { ledtradUnderlagSchema } from "../src/lib/ledtrad";
import { underlagFor, utanFrontmatter } from "./ledtrad-facit-md";
import { grafFor, lasGraf } from "./ledtrad-graf-md";

config({ path: "mcp-server/.env" });
neonConfig.webSocketConstructor = ws;

function flagga(namn: string): string {
  const i = process.argv.indexOf(namn);
  if (i < 0 || !process.argv[i + 1]) throw new Error(`${namn} saknas`);
  return process.argv[i + 1];
}

async function main() {
  const skriv = process.argv.includes("--skriv");
  const surveys = flagga("--surveys").split(",").map(Number);
  const facitMd = utanFrontmatter(readFileSync(flagga("--facit"), "utf8"));
  const kallaMd = utanFrontmatter(readFileSync(flagga("--kalla"), "utf8"));
  const graf = process.argv.includes("--graf") ? lasGraf(utanFrontmatter(readFileSync(flagga("--graf"), "utf8"))) : null;
  const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL! }) });
  try {
    const fragor = await prisma.question.findMany({
      where: { surveyQuestions: { some: { surveyId: { in: surveys } } }, type: { in: ["FREE_TEXT", "REFLECTION"] } },
      select: { id: true, text: true },
      orderBy: { id: "asc" },
    });
    let skrivna = 0;
    for (const q of fragor) {
      const bas = underlagFor(q.text, facitMd, kallaMd);
      const grafText = graf ? grafFor(q.text, graf) : null;
      if (graf && !grafText) console.log(`  q${q.id} saknar avsnitt i grafen - skrivs utan graf`);
      const u = bas ? { ...bas, ...(grafText ? { graf: grafText } : {}) } : null;
      const giltigt = u ? ledtradUnderlagSchema.safeParse(u) : null;
      if (!giltigt?.success) {
        console.log(`  q${q.id} HOPPAS ÖVER - inget underlag: ${q.text.slice(0, 70)}`);
        continue;
      }
      console.log(`  q${q.id} facit ${giltigt.data.facit.length} / kriterier ${giltigt.data.kriterier?.length ?? 0} / källa ${giltigt.data.kalla?.length ?? 0} / graf ${giltigt.data.graf?.length ?? 0} tecken: ${q.text.slice(0, 50)}`);
      if (skriv) {
        await prisma.question.update({ where: { id: q.id }, data: { hintBasis: giltigt.data } });
        skrivna++;
      }
    }
    console.log(skriv ? `Skrev underlag till ${skrivna} frågor.` : `Torrkörning (${fragor.length} frågor). Lägg till --skriv för att spara.`);
  } finally {
    await prisma.$disconnect();
  }
}

main();
