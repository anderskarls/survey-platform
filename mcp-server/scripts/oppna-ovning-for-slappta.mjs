// Ställer befintlig data i linje med regeln "släppt veckotest = öppen övning"
// (se openPracticeForRelease i src/lib/survey-edit.ts). Kopplingen i koden
// verkar framåt, från nästa släpp; det här öppnar veckorna vars test redan var
// släppta när regeln infördes.
//
// Bara kurser med flashcardMode - samma grind som i koden. Öppnar bara.
//
// TORRKÖRNING SOM DEFAULT. Skriver bara med --apply.
// Usage: node scripts/oppna-ovning-for-slappta.mjs [--apply]
import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

neonConfig.webSocketConstructor = ws;
const moduleDir = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(moduleDir, "../.env") });

const apply = process.argv.includes("--apply");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

try {
  // Ämnen som har en fråga i en släppt enkät, i en kortkurs, och som ännu
  // inte är öppna för övning.
  const rows = await pool.query(
    `SELECT DISTINCT t.id, t.name, c.id AS course_id, c.name AS course_name,
            s.title AS survey_title
       FROM "Topic" t
       JOIN "Course" c ON c.id = t."courseId"
       JOIN "Question" q ON q."topicId" = t.id
       JOIN "SurveyQuestion" sq ON sq."questionId" = q.id
       JOIN "Survey" s ON s.id = sq."surveyId"
      WHERE c."flashcardMode" = true
        AND t."practiceOpen" = false
        AND (s."openAt" IS NULL OR s."openAt" <= now())
      ORDER BY c.id, t.name`
  );

  if (rows.rows.length === 0) {
    console.log("Inget att öppna - allt släppt har redan öppen övning.");
  }
  for (const r of rows.rows) {
    console.log(
      `  kurs ${r.course_id} ${r.course_name}: öppnar "${r.name}" (släppt via ${r.survey_title})`
    );
  }

  if (apply && rows.rows.length > 0) {
    const ids = [...new Set(rows.rows.map((r) => r.id))];
    const res = await pool.query(
      `UPDATE "Topic" SET "practiceOpen" = true WHERE id = ANY($1::int[])`,
      [ids]
    );
    console.log(`\n== SKARP KÖRNING == ${res.rowCount} ämnen öppnade.`);
  } else {
    console.log(
      `\n== TORRKÖRNING (inget skrivs) == ${rows.rows.length} ämnen skulle öppnas.`
    );
  }
} finally {
  await pool.end();
}
