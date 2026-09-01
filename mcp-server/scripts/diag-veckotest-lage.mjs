// READ-ONLY: nuläget för veckotesten i engelskakurserna.
//
// Svarar på det som måste vara känt innan testens sammansättning läggs om:
// hur många frågor varje veckotest har idag, om det redan har riktiga
// elevsvar (då är det låst), vilket ämne veckans ord ligger i, och hur stor
// ordpoolen per vecka är.
//
// Usage: node scripts/diag-veckotest-lage.mjs [courseId ...]
import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

neonConfig.webSocketConstructor = ws;
const moduleDir = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(moduleDir, "../.env") });

const courseIds = process.argv.slice(2).map(Number).filter(Boolean);
const kurser = courseIds.length ? courseIds : [13, 36, 38];

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

try {
  const rows = await pool.query(
    `SELECT s.id, s.title, s."courseId", c.name AS kurs, s."openAt",
            (SELECT COUNT(*) FROM "SurveyQuestion" sq WHERE sq."surveyId" = s.id) AS fragor,
            (SELECT COUNT(*) FROM "Response" r JOIN "Student" st ON st.id = r."studentId"
              WHERE r."surveyId" = s.id AND st."isTest" = false) AS svar,
            (SELECT string_agg(DISTINCT t.name, ' | ') FROM "SurveyQuestion" sq
               JOIN "Question" q ON q.id = sq."questionId"
               LEFT JOIN "Topic" t ON t.id = q."topicId"
              WHERE sq."surveyId" = s.id) AS amnen
       FROM "Survey" s JOIN "Course" c ON c.id = s."courseId"
      WHERE s."courseId" = ANY($1::int[]) AND s.title LIKE 'Veckotest%'
      ORDER BY s."courseId", s.title`,
    [kurser]
  );

  let kurs = null;
  for (const r of rows.rows) {
    if (r.kurs !== kurs) {
      kurs = r.kurs;
      console.log(`\n=== [${r.courseId}] ${kurs} ===`);
    }
    const oppnar = r.openAt ? new Date(r.openAt).toISOString().slice(0, 16) : "null";
    console.log(
      `  [${r.id}] ${r.title}  fragor=${r.fragor}  riktiga_svar=${r.svar}  openAt=${oppnar}  amnen=${r.amnen}`
    );
  }

  console.log("\n=== Ämnen per kurs (ordpoolen) ===");
  const t = await pool.query(
    `SELECT c.id AS kid, c.name AS kurs, t.id, t.name, t."practiceOpen",
            COUNT(q.id) FILTER (WHERE q.type = 'CLOZE') AS cloze,
            COUNT(q.id) FILTER (WHERE q.type = 'FLASHCARD') AS flash,
            COUNT(q.id) FILTER (WHERE q.type = 'CLOZE_CARD') AS clozecard
       FROM "Topic" t JOIN "Course" c ON c.id = t."courseId"
       LEFT JOIN "Question" q ON q."topicId" = t.id
      WHERE c.id = ANY($1::int[])
      GROUP BY c.id, c.name, t.id, t.name, t."practiceOpen"
      ORDER BY c.id, t.name`,
    [kurser]
  );
  kurs = null;
  for (const r of t.rows) {
    if (r.kurs !== kurs) {
      kurs = r.kurs;
      console.log(`\n--- [${r.kid}] ${kurs} ---`);
    }
    console.log(
      `  [${r.id}] ${r.name}  cloze=${r.cloze} flash=${r.flash} clozecard=${r.clozecard} practiceOpen=${r.practiceOpen}`
    );
  }
} finally {
  await pool.end();
}
