// READ-ONLY: verifierar Engelska 7 (kurs 38) skarpt mot prod efter import.
// Prövar det som faktiskt kan gå sönder tyst: dubblerade ämnen, glosekort utan
// entydigt rätt svar, luckfrågor utan facit, facit som står kvar i sin egen
// mening, och veckotest utan släpptidpunkt.
import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

neonConfig.webSocketConstructor = ws;
const moduleDir = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(moduleDir, "../.env"), quiet: true });
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const q = async (sql) => (await pool.query(sql)).rows;
const fel = [];
const K = 38;

try {
  const kurs = await q(`SELECT id, name, code, "flashcardMode" FROM "Course" WHERE id=${K}`);
  console.log(`Kurs: ${JSON.stringify(kurs[0])}`);
  if (!kurs[0]?.flashcardMode) fel.push("flashcardMode är av - glosekorten visas som alternativlistor");

  const topics = await q(`SELECT count(*) n FROM "Topic" WHERE "courseId"=${K}`);
  console.log(`Ämnen: ${topics[0].n} (ska vara 27)`);
  if (Number(topics[0].n) !== 27) fel.push(`fel antal ämnen: ${topics[0].n}`);

  const dubbletter = await q(`
    SELECT name, count(*) n FROM "Topic" WHERE "courseId"=${K}
    GROUP BY name HAVING count(*) > 1`);
  if (dubbletter.length) fel.push(`dubblerade ämnen: ${JSON.stringify(dubbletter)}`);

  const oppna = await q(`SELECT count(*) n FROM "Topic" WHERE "courseId"=${K} AND "practiceOpen"`);
  console.log(`Öppnade för övning: ${oppna[0].n} (0 = läraren öppnar vecka för vecka)`);

  const typer = await q(`
    SELECT q.type, count(*) n FROM "Question" q
    JOIN "Topic" t ON t.id=q."topicId" WHERE t."courseId"=${K}
    GROUP BY q.type ORDER BY q.type`);
  console.log(`Frågor per typ: ${typer.map((r) => `${r.type}=${r.n}`).join("  ")} (ska vara MULTIPLE_CHOICE=778, CLOZE=389)`);
  const mc = Number(typer.find((r) => r.type === "MULTIPLE_CHOICE")?.n ?? 0);
  const cl = Number(typer.find((r) => r.type === "CLOZE")?.n ?? 0);
  if (mc !== 778) fel.push(`fel antal glosekort: ${mc}`);
  if (cl !== 389) fel.push(`fel antal luckfrågor: ${cl}`);

  // Ett glosekort utan exakt ett rätt alternativ, eller med färre än fyra
  // alternativ, ser normalt ut för eleven men rättas fel.
  const trasigaMC = await q(`
    SELECT q.id, q.text, count(o.*) alternativ, count(o.*) FILTER (WHERE o."isCorrect") ratta
    FROM "Question" q JOIN "Topic" t ON t.id=q."topicId"
    LEFT JOIN "QuestionOption" o ON o."questionId"=q.id
    WHERE t."courseId"=${K} AND q.type='MULTIPLE_CHOICE'
    GROUP BY q.id HAVING count(o.*) <> 4 OR count(o.*) FILTER (WHERE o."isCorrect") <> 1`);
  console.log(`Glosekort utan fyra alternativ / exakt ett rätt: ${trasigaMC.length}`);
  if (trasigaMC.length) fel.push(`trasiga glosekort: ${JSON.stringify(trasigaMC.slice(0, 5))}`);

  // Plattformen slumpar inte alternativen (QuestionRenderer) - står rätt svar
  // alltid först lär sig eleverna välja översta alternativet.
  const pos = await q(`
    SELECT plats, count(*) n FROM (
      SELECT row_number() OVER (PARTITION BY q.id ORDER BY o.id) plats, o."isCorrect"
      FROM "Question" q JOIN "Topic" t ON t.id=q."topicId"
      JOIN "QuestionOption" o ON o."questionId"=q.id
      WHERE t."courseId"=${K} AND q.type='MULTIPLE_CHOICE') s
    WHERE s."isCorrect" GROUP BY plats ORDER BY plats`);
  console.log(`Rätt svar per position: ${pos.map((r) => `${r.plats}:${r.n}`).join("  ")}`);
  if (pos.some((r) => Number(r.n) < 150)) fel.push("rätt svar är ojämnt fördelat över positionerna");

  const trasigaCloze = await q(`
    SELECT q.id, q.text FROM "Question" q JOIN "Topic" t ON t.id=q."topicId"
    WHERE t."courseId"=${K} AND q.type='CLOZE'
      AND (q.text NOT LIKE '%___%'
           OR q.config IS NULL
           OR q.config->>'answer' IS NULL
           OR q.config->>'answer' = ''
           OR q.config->>'hint' IS NULL)`);
  console.log(`Luckfrågor utan ___, facit eller ledtråd: ${trasigaCloze.length}`);
  if (trasigaCloze.length) fel.push(`trasiga luckfrågor: ${JSON.stringify(trasigaCloze.slice(0, 5))}`);

  // Facit får inte stå kvar i sin egen mening, inte ens inbakat i ett annat ord.
  const facitISinEgenMening = await q(`
    SELECT q.id, q.config->>'answer' svar, q.text FROM "Question" q
    JOIN "Topic" t ON t.id=q."topicId"
    WHERE t."courseId"=${K} AND q.type='CLOZE'
      AND position(lower(q.config->>'answer') in lower(replace(q.text, '___', ''))) > 0`);
  console.log(`Luckfrågor där facit står kvar i meningen: ${facitISinEgenMening.length}`);
  if (facitISinEgenMening.length) fel.push(`facit i meningen: ${JSON.stringify(facitISinEgenMening.slice(0, 5))}`);

  const test = await q(`
    SELECT v.id, v.title, v."openAt",
           (SELECT count(*) FROM "SurveyQuestion" sq WHERE sq."surveyId"=v.id) fragor
    FROM "Survey" v WHERE v."courseId"=${K} ORDER BY v.title`);
  const utanSlapp = test.filter((t) => !t.openAt);
  console.log(`\nVeckotest: ${test.length} st, ${test.reduce((a, r) => a + Number(r.fragor), 0)} frågor totalt`);
  console.log(`Utan släpptidpunkt: ${utanSlapp.length} (ska vara 0 - annars är testet öppet direkt)`);
  if (test.length !== 27) fel.push(`fel antal veckotest: ${test.length}`);
  if (utanSlapp.length) fel.push(`veckotest utan openAt: ${utanSlapp.map((t) => t.title).join(", ")}`);

  const forst = test.find((t) => t.title === "Veckotest 01");
  const sist = test.find((t) => t.title === "Veckotest 33");
  console.log(`Första: ${forst?.title} ${forst?.openAt?.toISOString()}   Sista: ${sist?.title} ${sist?.openAt?.toISOString()}`);

  const elever = await q(`SELECT count(*) n FROM "Student" WHERE "courseId"=${K}`);
  console.log(`Elevkonton: ${elever[0].n}`);

  console.log(fel.length ? `\nFEL (${fel.length}):\n - ${fel.join("\n - ")}` : "\nAllt grönt.");
} finally {
  await pool.end();
}
