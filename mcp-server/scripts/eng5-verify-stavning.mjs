// READ-ONLY: verifierar stavningstesten i kurs 13 efter import.
import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

neonConfig.webSocketConstructor = ws;
const moduleDir = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(moduleDir, "../.env") });
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const q = async (sql) => (await pool.query(sql)).rows;
const fel = [];

try {
  const topics = await q(`SELECT count(*) n FROM "Topic" WHERE "courseId"=13`);
  console.log(`Topics i kursen: ${topics[0].n} (ska vara 27 - inga dubbletter)`);
  if (Number(topics[0].n) !== 27) fel.push("fel antal topics");

  const dubbletter = await q(`
    SELECT name, count(*) n FROM "Topic" WHERE "courseId"=13
    GROUP BY name HAVING count(*) > 1`);
  if (dubbletter.length) fel.push(`dubblerade topics: ${JSON.stringify(dubbletter)}`);

  const typer = await q(`
    SELECT q.type, count(*) n FROM "Question" q
    JOIN "Topic" t ON t.id=q."topicId" WHERE t."courseId"=13
    GROUP BY q.type ORDER BY q.type`);
  console.log("Frågor per typ:", typer.map((r) => `${r.type}=${r.n}`).join("  "));

  const stav = await q(`
    SELECT v.id, v.title,
           (SELECT count(*) FROM "SurveyQuestion" sq WHERE sq."surveyId"=v.id) fragor
    FROM "Survey" v WHERE v."courseId"=13 AND v.title LIKE '%stavning%'
    ORDER BY v.title`);
  console.log(`\nStavningstest: ${stav.length} st, ${stav.reduce((a, r) => a + Number(r.fragor), 0)} frågor totalt`);
  if (stav.length !== 27) fel.push(`fel antal stavningstest: ${stav.length}`);

  // Varje CLOZE-fråga måste ha ___ i texten och ett facit i config,
  // annars ser den normal ut för eleven men kan aldrig rättas.
  const trasiga = await q(`
    SELECT q.id, q.text FROM "Question" q
    JOIN "Topic" t ON t.id=q."topicId"
    WHERE t."courseId"=13 AND q.type='CLOZE'
      AND (q.text NOT LIKE '%___%'
           OR q.config IS NULL
           OR q.config->>'answer' IS NULL
           OR q.config->>'answer' = ''
           OR q.config->>'hint' IS NULL)`);
  console.log(`Luckfrågor utan ___, facit eller ledtråd: ${trasiga.length}`);
  if (trasiga.length) fel.push(`trasiga luckfrågor: ${JSON.stringify(trasiga)}`);

  // Ett facit som står kvar i sin egen mening ger bort svaret.
  const lackande = await q(`
    SELECT q.id, q.text, q.config->>'answer' facit FROM "Question" q
    JOIN "Topic" t ON t.id=q."topicId"
    WHERE t."courseId"=13 AND q.type='CLOZE'
      AND position(lower(q.config->>'answer') in lower(replace(q.text,'___',''))) > 0`);
  console.log(`Luckfrågor som avslöjar sitt eget facit: ${lackande.length}`);
  if (lackande.length) fel.push(`läckande: ${JSON.stringify(lackande)}`);

  // Ingen luckfråga får ligga i två test. Glosekorten däremot ÅTERANVÄNDS
  // med flit - ett ord som återkommer blir repetitionsord i senare veckotest
  // och behåller samma fråga, annars splittras FSRS-historiken per ord.
  const dubbelkopplade = await q(`
    SELECT sq."questionId", count(*) n FROM "SurveyQuestion" sq
    JOIN "Survey" v ON v.id=sq."surveyId"
    JOIN "Question" q ON q.id=sq."questionId"
    WHERE v."courseId"=13 AND q.type='CLOZE'
    GROUP BY sq."questionId" HAVING count(*) > 1`);
  console.log(`Luckfrågor kopplade till fler än ett test: ${dubbelkopplade.length}`);
  if (dubbelkopplade.length) fel.push(`dubbelkopplade: ${dubbelkopplade.length}`);

  const utanEnkat = await q(`
    SELECT count(*) n FROM "Question" q
    JOIN "Topic" t ON t.id=q."topicId"
    WHERE t."courseId"=13 AND q.type='CLOZE'
      AND NOT EXISTS (SELECT 1 FROM "SurveyQuestion" sq WHERE sq."questionId"=q.id)`);
  console.log(`Luckfrågor utan enkät: ${utanEnkat[0].n}`);
  if (Number(utanEnkat[0].n) !== 0) fel.push("luckfrågor utan enkät");

  console.log(fel.length ? `\nFEL (${fel.length}):\n - ${fel.join("\n - ")}` : "\nAllt grönt.");
} catch (e) {
  console.error("ERROR:", e.message);
} finally {
  await pool.end();
}
