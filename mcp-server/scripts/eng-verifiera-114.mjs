// READ-ONLY: kontroll efter ihopslagningen av enkat 114.
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
let fel = 0;
const kolla = (ok, text) => { console.log(`${ok ? "OK  " : "FEL "} ${text}`); if (!ok) fel++; };
try {
  const dubbletter = await q(`
    SELECT a."responseId", a."questionId", count(*) AS n
    FROM "Answer" a JOIN "Response" r ON r.id=a."responseId"
    WHERE r."surveyId"=114 GROUP BY 1,2 HAVING count(*) > 1`);
  kolla(dubbletter.length === 0, `inga dubbla svar pa samma fraga i samma inlamning (${dubbletter.length})`);

  const flera = await q(`
    SELECT r."studentId", s.number AS nr, count(*) AS n
    FROM "Response" r JOIN "Student" s ON s.id=r."studentId"
    WHERE r."surveyId"=114 GROUP BY 1,2 HAVING count(*) > 1`);
  kolla(flera.length === 1 && flera[0].nr === 99,
    `bara provkontot nr 99 har flera inlamningar kvar (${flera.map(f => `nr ${f.nr}:${f.n}`).join(", ") || "ingen"})`);

  const overtaliga = await q(`
    SELECT count(*) AS n FROM "Answer" a JOIN "Response" r ON r.id=a."responseId"
    WHERE r."surveyId"=114 AND a."questionId" NOT IN
      (SELECT "questionId" FROM "SurveyQuestion" WHERE "surveyId"=114)`);
  kolla(Number(overtaliga[0].n) === 0, `alla svar hor till enkatens fragor (${overtaliga[0].n} avvikande)`);

  const tomma = await q(`
    SELECT count(*) AS n FROM "Response" r WHERE r."surveyId"=114
      AND NOT EXISTS (SELECT 1 FROM "Answer" a WHERE a."responseId"=r.id)`);
  kolla(Number(tomma[0].n) === 0, `inga tomma inlamningar (${tomma[0].n})`);

  console.log("\n=== Resultat per elev (exkl. provkontot) ===");
  const rader = await q(`
    SELECT s.number AS nr, count(a.id) AS svarade,
           count(a.id) FILTER (WHERE a."isCorrect") AS ratt,
           min(r."createdAt") AS start
    FROM "Response" r JOIN "Student" s ON s.id=r."studentId"
    LEFT JOIN "Answer" a ON a."responseId"=r.id
    WHERE r."surveyId"=114 AND NOT s."isTest"
    GROUP BY s.number ORDER BY s.number`);
  for (const r of rader)
    console.log(`  nr ${String(r.nr).padStart(3)}: ${String(r.ratt).padStart(2)}/${String(r.svarade).padStart(2)} ratt av 15 fragor`);
  const helt = rader.filter(r => Number(r.svarade) === 15).length;
  console.log(`\n${rader.length} elever, varav ${helt} svarade pa alla 15`);
  const totRatt = rader.reduce((n, r) => n + Number(r.ratt), 0);
  const totSvar = rader.reduce((n, r) => n + Number(r.svarade), 0);
  console.log(`Klassens traffsakerhet: ${totRatt}/${totSvar} = ${Math.round(100 * totRatt / totSvar)}%`);

  console.log(fel === 0 ? "\nAllt gront." : `\n${fel} kontroll(er) misslyckades.`);
} finally { await pool.end(); }
