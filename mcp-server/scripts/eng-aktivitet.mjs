// READ-ONLY: vad har eleverna faktiskt gjort i kurs 13/36/38?
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
  console.log("=== Svar per enkat och dag (kurs 13/36/38) ===");
  for (const r of await q(`
    SELECT v."courseId", v.id, v.title, count(*) AS svar,
           count(DISTINCT r."studentId") AS elever,
           min(r."createdAt")::date AS forsta, max(r."createdAt")::date AS sista
    FROM "Response" r JOIN "Survey" v ON r."surveyId"=v.id
    WHERE v."courseId" IN (13,36,38)
    GROUP BY v."courseId", v.id, v.title ORDER BY v."courseId", v.id`))
    console.log(`kurs ${r.courseId}  enkat ${r.id} ${String(r.title).padEnd(16)} svar ${String(r.svar).padStart(4)}  elever ${String(r.elever).padStart(3)}  ${r.forsta} -> ${r.sista}`);

  console.log("\n=== Ovningsforsok ===");
  for (const r of await q(`
    SELECT s."courseId", count(*) AS forsok, count(DISTINCT pa."studentId") AS elever,
           min(pa."createdAt")::date AS forsta, max(pa."createdAt")::date AS sista
    FROM "PracticeAttempt" pa JOIN "Student" s ON s.id=pa."studentId"
    WHERE s."courseId" IN (13,36,38) GROUP BY s."courseId" ORDER BY s."courseId"`))
    console.log(`kurs ${r.courseId}  forsok ${r.forsok}  elever ${r.elever}  ${r.forsta} -> ${r.sista}`);

  console.log("\n=== Veckotest 01: ratt/fel per kurs ===");
  for (const r of await q(`
    SELECT v."courseId", count(*) AS svar,
           count(*) FILTER (WHERE a."isCorrect") AS ratt,
           count(*) FILTER (WHERE NOT a."isCorrect") AS fel
    FROM "Answer" a JOIN "Response" r ON r.id=a."responseId" JOIN "Survey" v ON v.id=r."surveyId"
    WHERE v."courseId" IN (13,36,38) GROUP BY v."courseId" ORDER BY v."courseId"`))
    console.log(`kurs ${r.courseId}  answers ${r.svar}  ratt ${r.ratt}  fel ${r.fel}`);
} finally { await pool.end(); }
