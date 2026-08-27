// Importerar veckotesten (CLOZE) for Engelska 7, kurs 38.
//
// Gar via samma createQuizFromCsv som MCP-verktyget create_quiz_from_csv,
// alltsa samma vag som Engelska 5:s veckotest togs in. Fragorna hamnar i
// veckans befintliga amne - kor en7-import-glosekort.mjs forst, sa delar
// luckorna och korten samma amne precis som i Engelska 5.
//
//   node scripts/en7-import-veckotest.mjs --dry     (visar bara vad som skulle goras)
//   node scripts/en7-import-veckotest.mjs           (importerar)
//
// Sparr: en vecka som redan har ett "Veckotest NN" i kursen hoppas over.
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { prisma } from "../dist/prisma.js";
import { createQuizFromCsv } from "../dist/tools/create-quiz-from-csv.js";

const COURSE_ID = 38;
const CSV_DIR = "C:/Brain/resources/en7-ordbank/csv-luckor";
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
  const titel = `Veckotest ${vecka}`;
  const csv = readFileSync(resolve(CSV_DIR, fil), "utf8");
  const rader = csv.split("\n").filter((r) => r.trim()).length - 1;

  if (befintliga.has(titel)) {
    console.log(`HOPPAR  ${titel.padEnd(16)} finns redan`);
    hoppade++;
    continue;
  }
  if (DRY) {
    console.log(`SKULLE  ${titel.padEnd(16)} ${rader} luckfrågor`);
    importerade++;
    continue;
  }
  const svar = JSON.parse(
    await createQuizFromCsv(COURSE_ID, titel, csv, BESKRIVNING, "QUIZ", false)
  );
  console.log(
    `SKAPAD  ${titel.padEnd(16)} id=${String(svar.id).padEnd(5)} ` +
      `frågor=${String(svar.questionCount).padEnd(3)} kod=${svar.shareCode}`
  );
  importerade++;
}

console.log(
  `\n${DRY ? "Torrkörning: " : ""}${importerade} test ${DRY ? "skulle skapas" : "skapade"}, ${hoppade} hoppades över.`
);
await prisma.$disconnect();
