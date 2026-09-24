/**
 * Lagger in extra luckmeningar i en kurs luckfragor (config.variants), sa att
 * lararen kan skicka ut nya versioner av ett veckotest: samma ord, nya
 * meningar. Se src/lib/survey-version.ts.
 *
 * Meningsbanken ar en JSON-fil med ordet som nyckel och en lista meningar som
 * varde - C:/Brain/resources/eng5-ordbank/varianter.json for Engelska 5 och
 * en7-ordbank/varianter.json for Engelska 7. Matchningen gors pa facit
 * (config.answer) mot nyckeln i gemener. Bara CLOZE - korten (CLOZE_CARD) ar
 * ovning och far inga versioner.
 *
 * Ror bara config.variants. Text, facit, accept och ledtrad ar orord, sa
 * elevsvaren pa originalen paverkas inte. Idempotent: en fraga som redan har
 * samma varianter hoppas over.
 *
 * Torrkorning som default. Med --apply skrivs en angerlogg med varje fragas
 * config fore andringen.
 *
 * Anvandning:
 *   node scripts/lagg-in-varianter.mjs <varianter.json> <kursId...> [--apply]
 */
import { config } from "dotenv";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";

const moduleDir = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(moduleDir, "../.env") });

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const positional = args.filter((a) => !a.startsWith("--"));
const bankPath = positional[0];
const courseIds = positional.slice(1).map(Number);

if (!bankPath || courseIds.length === 0 || courseIds.some((n) => !n)) {
  console.error(
    "Anvandning: node scripts/lagg-in-varianter.mjs <varianter.json> <kursId...> [--apply]"
  );
  process.exit(1);
}

const raw = JSON.parse(readFileSync(bankPath, "utf-8"));
const bank = new Map(
  Object.entries(raw)
    .filter(([k]) => !k.startsWith("_"))
    .map(([k, v]) => [k.toLowerCase(), v])
);

// Samma regler som planVersion kontrollerar - hellre stopp har an en trasig
// version i klassrummet.
for (const [word, variants] of bank) {
  if (!Array.isArray(variants) || variants.length === 0) {
    throw new Error(`${word}: inga meningar`);
  }
  for (const v of variants) {
    if (typeof v !== "string" || v.split("___").length !== 2) {
      throw new Error(`${word}: meningen maste ha exakt en ___: ${v}`);
    }
  }
}

neonConfig.webSocketConstructor = ws;
const prisma = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL }),
});

const sameList = (a, b) =>
  Array.isArray(a) && a.length === b.length && a.every((x, i) => x === b[i]);

const undo = [];
let totalUpdate = 0;

try {
  for (const courseId of courseIds) {
    const course = await prisma.course.findUnique({
      where: { id: courseId },
      select: { name: true },
    });
    if (!course) throw new Error(`Kurs ${courseId} finns inte`);

    const questions = await prisma.question.findMany({
      where: { type: "CLOZE", topic: { courseId } },
      select: { id: true, config: true },
      orderBy: { id: "asc" },
    });

    const toUpdate = [];
    const saknas = [];
    let redan = 0;
    for (const q of questions) {
      const answer = q.config?.answer;
      const variants = typeof answer === "string" ? bank.get(answer.toLowerCase()) : undefined;
      if (!variants) {
        // Versionernas egna fragor saknar varianter med flit; de ar inte
        // original och ska inte fa nagra.
        saknas.push(`${q.id}:${answer}`);
        continue;
      }
      if (sameList(q.config.variants, variants)) {
        redan++;
        continue;
      }
      toUpdate.push({ q, variants });
    }

    const minst = Math.min(
      ...questions
        .map((q) => bank.get(String(q.config?.answer ?? "").toLowerCase())?.length)
        .filter((n) => n !== undefined)
    );
    console.log(
      `Kurs ${courseId} (${course.name}): ${questions.length} luckfragor, ` +
        `${toUpdate.length} att uppdatera, ${redan} redan klara, ` +
        `${saknas.length} utan mening i banken` +
        (Number.isFinite(minst) ? `, minst ${minst} meningar per ord` : "")
    );
    if (saknas.length > 0) console.log(`  utan mening: ${saknas.slice(0, 20).join(", ")}`);

    if (apply) {
      for (const { q, variants } of toUpdate) {
        undo.push({ id: q.id, config: q.config });
        await prisma.question.update({
          where: { id: q.id },
          data: { config: { ...q.config, variants } },
        });
      }
    }
    totalUpdate += toUpdate.length;
  }

  if (apply && undo.length > 0) {
    const file = resolve(moduleDir, `../lagg-in-varianter-${Date.now()}.json`);
    writeFileSync(file, JSON.stringify(undo, null, 1));
    console.log(`\n${totalUpdate} fragor uppdaterade. Angerlogg: ${file}`);
  } else if (!apply) {
    console.log(`\nTorrkorning - ${totalUpdate} fragor skulle uppdateras. Kor med --apply.`);
  } else {
    console.log("\nIngenting att gora.");
  }
} finally {
  await prisma.$disconnect();
}
