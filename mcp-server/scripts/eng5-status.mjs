// READ-ONLY: kurs 13 (Engelska 5) - enkäter, topics, frågetyper.
// Samma connection-mönster som list-courses.mjs (Neon WebSocket).
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
  console.log("=== Kurs 13 ===");
  console.log(await q(`SELECT id,name,code,"flashcardMode" FROM "Course" WHERE id=13`));

  console.log("\n=== Frågor per topic och typ ===");
  for (const r of await q(`
    SELECT t.id, t.name AS topic, q.type, count(*) AS antal
    FROM "Question" q JOIN "Topic" t ON t.id=q."topicId"
    WHERE t."courseId"=13 GROUP BY t.id,t.name,q.type ORDER BY t.name, q.type`))
    console.log(`topic=${String(r.id).padEnd(5)} ${String(r.type).padEnd(16)} ${String(r.antal).padStart(3)}  ${r.topic}`);

  console.log("\n=== Enkäter (Survey) ===");
  for (const r of await q(`
    SELECT v.id, v.title, v.mode, v."shareCode",
           (SELECT count(*) FROM "SurveyQuestion" sq WHERE sq."surveyId"=v.id) AS fragor,
           (SELECT count(*) FROM "Response" rp WHERE rp."surveyId"=v.id) AS svar
    FROM "Survey" v WHERE v."courseId"=13 ORDER BY v.id`))
    console.log(`id=${String(r.id).padEnd(5)} fr=${String(r.fragor).padEnd(4)} svar=${String(r.svar).padEnd(4)} mode=${String(r.mode).padEnd(10)} kod=${r.shareCode}  "${r.title}"`);
} catch (e) {
  console.error("ERROR:", e.message);
} finally {
  await pool.end();
}
