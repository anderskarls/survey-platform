// Importerar stavningstesten (CLOZE) for Engelska 5, kurs 13.
// Gar via samma createQuizFromCsv som MCP-verktyget create_quiz_from_csv,
// sa importvagen ar identisk med den vecka 01-03 togs in genom.
//
//   node scripts/eng5-import-stavning.mjs --dry     (visar bara vad som skulle goras)
//   node scripts/eng5-import-stavning.mjs           (importerar)
//
// Spärr: en vecka som redan har ett "Vecka NN - stavning" i kurs 13 hoppas over.
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { prisma } from "../dist/prisma.js";
import { createQuizFromCsv } from "../dist/tools/create-quiz-from-csv.js";

const COURSE_ID = 13;
const CSV_DIR = "C:/Brain/resources/eng5-ordbank/csv-luckor";
const BESKRIVNING = "Skriv in det engelska ordet som saknas. Stavningen räknas.";
const DRY = process.argv.includes("--dry");

const befintliga = new Set(
  (
    await prisma.survey.findMany({
      where: { courseId: COURSE_ID },
      select: { title: true },
    })
  ).map((s) => s.title)
);

const filer = readdirSync(CSV_DIR)
  .filter((f) => /^vecka-\d\d\.csv$/.test(f))
  .sort();

let importerade = 0;
let hoppade = 0;

for (const fil of filer) {
  const vecka = fil.slice(6, 8);
  const titel = `Vecka ${vecka} - stavning`;
  const csv = readFileSync(resolve(CSV_DIR, fil), "utf8");
  const rader = csv.split("\n").filter((r) => r.trim()).length - 1;

  if (befintliga.has(titel)) {
    console.log(`HOPPAR  ${titel.padEnd(24)} finns redan`);
    hoppade++;
    continue;
  }
  if (DRY) {
    console.log(`SKULLE  ${titel.padEnd(24)} ${rader} luckfrågor`);
    importerade++;
    continue;
  }
  const svar = JSON.parse(
    await createQuizFromCsv(COURSE_ID, titel, csv, BESKRIVNING, "QUIZ", false)
  );
  console.log(
    `SKAPAD  ${titel.padEnd(24)} id=${String(svar.id).padEnd(5)} ` +
      `frågor=${String(svar.questionCount).padEnd(3)} kod=${svar.shareCode}`
  );
  importerade++;
}

console.log(
  `\n${DRY ? "Torrkörning: " : ""}${importerade} test ${DRY ? "skulle skapas" : "skapade"}, ${hoppade} hoppades över.`
);
await prisma.$disconnect();
