// READ-ONLY: hur ofta lämnas frågor obesvarade i veckotesten?
// En obesvarad fråga skapar ingen Answer-rad alls - den syns varken som fel
// eller i nämnaren. Skriptet mäter skillnaden mellan antal frågor i enkäten
// och antal svar per inlämning.
// Usage: node scripts/diag-obesvarade.mjs [courseId ...]
import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

neonConfig.webSocketConstructor = ws;
const moduleDir = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(moduleDir, "../.env") });

const courseIds = process.argv.slice(2).map(Number).filter(Boolean);
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

try {
  const courseFilter = courseIds.length
    ? `AND s."courseId" = ANY($1::int[])`
    : "";
  const params = courseIds.length ? [courseIds] : [];

  const rows = await pool.query(
    `SELECT s.id AS survey_id,
            s.title,
            s."courseId",
            c.name AS course_name,
            (SELECT COUNT(*) FROM "SurveyQuestion" sq WHERE sq."surveyId" = s.id) AS n_questions,
            r.id AS response_id,
            st.number AS student_number,
            st."isTest" AS is_test,
            (SELECT COUNT(*) FROM "Answer" a WHERE a."responseId" = r.id) AS n_answers,
            (SELECT COUNT(*) FROM "Answer" a WHERE a."responseId" = r.id AND a."isCorrect" IS TRUE) AS n_correct
       FROM "Survey" s
       JOIN "Course" c ON c.id = s."courseId"
       JOIN "Response" r ON r."surveyId" = s.id
       JOIN "Student" st ON st.id = r."studentId"
      WHERE s.mode = 'QUIZ' ${courseFilter}
      ORDER BY s."courseId", s.id, st.number`,
    params
  );

  if (rows.rows.length === 0) {
    console.log("Inga quiz-inlämningar hittades.");
  }

  const bySurvey = new Map();
  for (const r of rows.rows) {
    if (r.is_test) continue;
    const key = r.survey_id;
    if (!bySurvey.has(key)) bySurvey.set(key, { meta: r, responses: [] });
    bySurvey.get(key).responses.push(r);
  }

  for (const { meta, responses } of bySurvey.values()) {
    const nq = Number(meta.n_questions);
    const partial = responses.filter((r) => Number(r.n_answers) < nq);
    console.log(
      `\n[kurs ${meta.courseId} ${meta.course_name}] enkät ${meta.survey_id}: ${meta.title}`
    );
    console.log(
      `  ${nq} frågor, ${responses.length} inlämningar, ${partial.length} med luckor`
    );
    for (const r of partial) {
      const skipped = nq - Number(r.n_answers);
      const pctVisad =
        Number(r.n_answers) > 0
          ? Math.round((Number(r.n_correct) / Number(r.n_answers)) * 100)
          : 0;
      const pctSant = Math.round((Number(r.n_correct) / nq) * 100);
      console.log(
        `    elev #${r.student_number}: ${r.n_answers}/${nq} besvarade, ` +
          `${r.n_correct} rätt -> visat ${pctVisad}% (av besvarade), ` +
          `faktiskt ${pctSant}% (av alla frågor), ${skipped} hoppade`
      );
    }
  }
} finally {
  await pool.end();
}
