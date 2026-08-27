// Importerar glosekorten (MULTIPLE_CHOICE, bada riktningarna) for Engelska 7.
//
// Gar via samma importQuestions som MCP-verktyget import_questions, alltsa
// samma vag som glosekorten i Engelska 5 togs in. Korten hamnar i veckans
// amne UTAN att kopplas till nagot quiz - de nar eleven genom ovningspasset
// nar lararen oppnar amnet (Topic.practiceOpen).
//
//   node scripts/en7-import-glosekort.mjs --dry     (visar bara vad som skulle goras)
//   node scripts/en7-import-glosekort.mjs           (importerar)
//
// Sparr: en vecka vars amne redan har fragor hoppas over, sa skriptet kan
// koras om efter ett avbrott utan att dubblera nagot.
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { prisma } from "../dist/prisma.js";
import { importQuestions } from "../dist/tools/import-questions.js";

const COURSE_ID = 38;
const CSV_DIR = "C:/Brain/resources/en7-ordbank/csv";
const DRY = process.argv.includes("--dry");

const befintliga = new Map(
  (
    await prisma.topic.findMany({
      where: { courseId: COURSE_ID },
      select: { name: true, _count: { select: { questions: true } } },
    })
  ).map((t) => [t.name, t._count.questions])
);

const filer = readdirSync(CSV_DIR)
  .filter((f) => /^vecka-\d\d\.csv$/.test(f))
  .sort();

let importerade = 0;
let hoppade = 0;
let fragor = 0;

for (const fil of filer) {
  const csv = readFileSync(resolve(CSV_DIR, fil), "utf8");
  const rader = csv.split("\n").filter((r) => r.trim());
  // Amnesnamnet star i forsta kolumnen pa forsta dataraden. Flera teman
  // innehaller komma ("Vecka 03 - Retorik, litteratur och stilfigurer") och ar
  // darfor citerade i CSV:n - en split pa komma skulle kapa namnet och gora
  // sparren nedan verkningslos.
  const forsta = rader[1];
  const topic = forsta.startsWith('"')
    ? forsta.slice(1, forsta.indexOf('",')).replace(/""/g, '"')
    : forsta.slice(0, forsta.indexOf(","));
  const antal = rader.length - 1;

  if (befintliga.get(topic)) {
    console.log(`HOPPAR  ${topic.padEnd(52)} har redan ${befintliga.get(topic)} fragor`);
    hoppade++;
    continue;
  }
  if (DRY) {
    console.log(`SKULLE  ${topic.padEnd(52)} ${antal} glosekort`);
    importerade++;
    fragor += antal;
    continue;
  }
  const svar = await importQuestions(COURSE_ID, csv);
  console.log(`IMPORT  ${topic.padEnd(52)} ${svar}`);
  importerade++;
  fragor += antal;
}

console.log(
  `\n${DRY ? "Torrkorning: " : ""}${importerade} veckor ${DRY ? "skulle importeras" : "importerade"} ` +
    `(${fragor} glosekort), ${hoppade} hoppades over.`
);
await prisma.$disconnect();
