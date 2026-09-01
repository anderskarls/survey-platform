// READ-ONLY: visar ett veckotest ord för ord, med veckan varje ord kommer ur.
// Usage: node scripts/visa-veckotest.mjs <surveyId>
import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

neonConfig.webSocketConstructor = ws;
const moduleDir = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(moduleDir, "../.env") });

const surveyId = Number(process.argv[2]);
if (!surveyId) {
  console.error("Ange surveyId");
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
try {
  const s = await pool.query(
    `SELECT s.title, c.name AS kurs FROM "Survey" s JOIN "Course" c ON c.id = s."courseId" WHERE s.id = $1`,
    [surveyId]
  );
  if (s.rows.length === 0) {
    console.error(`Ingen enkät med id ${surveyId}`);
    process.exit(1);
  }
  console.log(`${s.rows[0].kurs} - ${s.rows[0].title}\n`);

  const egen = s.rows[0].title.match(/\b(\d{1,2})\b/)?.[1];
  const rader = await pool.query(
    `SELECT sq."order", q.text, q.config, t.name AS amne
       FROM "SurveyQuestion" sq JOIN "Question" q ON q.id = sq."questionId"
       LEFT JOIN "Topic" t ON t.id = q."topicId"
      WHERE sq."surveyId" = $1 ORDER BY sq."order"`,
    [surveyId]
  );
  for (const r of rader.rows) {
    const v = r.amne?.match(/\b(\d{1,2})\b/)?.[1] ?? "??";
    const markor = v === egen ? "     " : " REP ";
    console.log(
      `${String(r.order + 1).padStart(2)}.${markor}${(r.config?.answer ?? "?").padEnd(18)} v${v}   ${r.text}`
    );
  }
} finally {
  await pool.end();
}
