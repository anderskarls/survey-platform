// READ-ONLY: hur ser elevernas svar pa Veckotest 01 (kurs 13) ut egentligen?
import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
neonConfig.webSocketConstructor = ws;
const moduleDir = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(moduleDir, "../.env") });
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const q = async (sql, p = []) => (await pool.query(sql, p)).rows;
try {
  const [f] = await q(`SELECT count(*) AS fragor FROM "Question" q JOIN "SurveyQuestion" sq ON sq."questionId"=q.id WHERE sq."surveyId"=114`).catch(() => [null]);
  console.log("SurveyQuestion-koppling:", f ?? "(tabellen finns inte)");

  console.log("\n=== Per elev pa enkat 114 ===");
  const rows = await q(`
    SELECT r."studentId", s.number AS nr, count(DISTINCT r.id) AS responses, count(a.id) AS answers,
           count(a.id) FILTER (WHERE a."isCorrect") AS ratt,
           min(r."createdAt") AS forsta, max(r."createdAt") AS sista
    FROM "Response" r JOIN "Student" s ON s.id=r."studentId"
    LEFT JOIN "Answer" a ON a."responseId"=r.id
    WHERE r."surveyId"=114 GROUP BY r."studentId", s.number ORDER BY responses DESC, r."studentId"`);
  for (const r of rows)
    console.log(`elev ${String(r.studentId).padStart(4)} ${String("nr "+r.nr).padEnd(8)} responses ${String(r.responses).padStart(3)}  answers ${String(r.answers).padStart(3)}  ratt ${String(r.ratt).padStart(3)}  ${new Date(r.forsta).toISOString().slice(0,16)} -> ${new Date(r.sista).toISOString().slice(0,16)}`);
  console.log(`\nTotalt ${rows.length} elever`);

  console.log("\n=== Tomma responses (utan answers) pa 114 ===");
  console.log(await q(`SELECT count(*) AS tomma FROM "Response" r WHERE r."surveyId"=114 AND NOT EXISTS (SELECT 1 FROM "Answer" a WHERE a."responseId"=r.id)`));

  console.log("\n=== Antal fragor i enkat 114 ===");
  console.log(await q(`SELECT count(*) AS fragor FROM "Question" WHERE "surveyId"=114`).catch(() => "(Question har ingen surveyId)"));
} finally { await pool.end(); }
