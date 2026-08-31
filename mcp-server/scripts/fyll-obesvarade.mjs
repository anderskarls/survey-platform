// Retroaktiv ifyllnad: obesvarade luckfrågor i redan inlämnade prov får en
// Answer-rad med tomt värde och isCorrect = false, så att historiken räknas
// på samma sätt som allt framåt (se src/lib/blank-answer.ts).
//
// TORRKÖRNING SOM DEFAULT. Skriver bara med --apply.
//
// Avgränsningar, medvetna:
//   - Bara QUIZ-läge. Enkätens obesvarade fält är ett avstående.
//   - Bara CLOZE. Luckfrågan når aldrig övningspoolen, så "visades frågan?"
//     kan avgöras ur svarshistoriken ensam: quizvyn döljer det eleven redan
//     klarat, och för CLOZE betyder klarat "senaste svaret var rätt".
//     Flervalsfrågan har FSRS-tillstånd och kräver en replay av
//     schemaläggningen vid inlämningstillfället för att avgöra samma sak -
//     den rapporteras i stället för att gissas.
//   - Lärarens provkonton (isTest) hoppas över.
//
// Usage: node scripts/fyll-obesvarade.mjs [courseId ...] [--apply]
import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

neonConfig.webSocketConstructor = ws;
const moduleDir = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(moduleDir, "../.env") });

const apply = process.argv.includes("--apply");
const courseIds = process.argv
  .slice(2)
  .filter((a) => a !== "--apply")
  .map(Number)
  .filter(Boolean);

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

try {
  const courseFilter = courseIds.length ? `AND s."courseId" = ANY($1::int[])` : "";
  const params = courseIds.length ? [courseIds] : [];

  // Alla quiz-inlämningar från riktiga elever, med enkätens frågor och de
  // svar som faktiskt finns.
  const responses = await pool.query(
    `SELECT r.id AS response_id,
            r."createdAt" AS created_at,
            r."studentId" AS student_id,
            st.number AS student_number,
            s.id AS survey_id,
            s.title AS survey_title,
            s."courseId" AS course_id,
            c.name AS course_name
       FROM "Response" r
       JOIN "Survey" s ON s.id = r."surveyId"
       JOIN "Course" c ON c.id = s."courseId"
       JOIN "Student" st ON st.id = r."studentId"
      WHERE s.mode = 'QUIZ' AND st."isTest" = false ${courseFilter}
      ORDER BY r."createdAt"`,
    params
  );

  const insertedIds = [];
  let filled = 0;
  let skippedMastered = 0;
  const skippedTypes = new Map();
  const perSurvey = new Map();

  for (const r of responses.rows) {
    const questions = await pool.query(
      `SELECT q.id, q.type
         FROM "SurveyQuestion" sq
         JOIN "Question" q ON q.id = sq."questionId"
        WHERE sq."surveyId" = $1`,
      [r.survey_id]
    );

    const answered = await pool.query(
      `SELECT "questionId" FROM "Answer" WHERE "responseId" = $1`,
      [r.response_id]
    );
    const answeredIds = new Set(answered.rows.map((a) => a.questionId));

    for (const q of questions.rows) {
      if (answeredIds.has(q.id)) continue;

      if (q.type !== "CLOZE") {
        // Orättade typer (fritext, reflektion, sortering) ska inte ha rader
        // alls; korttyperna kräver en FSRS-replay och rapporteras.
        if (q.type === "MULTIPLE_CHOICE" || q.type === "CLOZE_CARD") {
          const key = `${r.course_id}|${q.type}`;
          skippedTypes.set(key, (skippedTypes.get(key) ?? 0) + 1);
        }
        continue;
      }

      // Visades frågan? Quizvyn döljer det eleven redan klarat, och för
      // CLOZE är klarat = senaste svaret före den här inlämningen var rätt.
      const prior = await pool.query(
        `SELECT a."isCorrect"
           FROM "Answer" a
           JOIN "Response" pr ON pr.id = a."responseId"
          WHERE a."questionId" = $1
            AND pr."studentId" = $2
            AND pr."createdAt" < $3
          ORDER BY pr."createdAt" DESC
          LIMIT 1`,
        [q.id, r.student_id, r.created_at]
      );
      if (prior.rows[0]?.isCorrect === true) {
        skippedMastered++;
        continue;
      }

      if (apply) {
        const inserted = await pool.query(
          `INSERT INTO "Answer" ("responseId", "questionId", value, "isCorrect")
           VALUES ($1, $2, '', false)
           RETURNING id`,
          [r.response_id, q.id]
        );
        insertedIds.push(inserted.rows[0].id);
      }
      filled++;
      const key = `${r.survey_id}|${r.survey_title}|${r.course_name}`;
      const entry = perSurvey.get(key) ?? { count: 0, students: new Set() };
      entry.count++;
      entry.students.add(r.student_number);
      perSurvey.set(key, entry);
    }
  }

  console.log(apply ? "== SKARP KÖRNING ==" : "== TORRKÖRNING (inget skrivs) ==");
  console.log(`Genomgångna inlämningar: ${responses.rows.length}`);
  console.log(`Tomma luckfrågor att rätta som fel: ${filled}`);
  console.log(`Överhoppade (frågan var redan klarad och visades inte): ${skippedMastered}`);
  for (const [key, entry] of perSurvey) {
    const [surveyId, title, course] = key.split("|");
    console.log(
      `  enkät ${surveyId} ${title} (${course}): ${entry.count} rader, ${entry.students.size} elever`
    );
  }
  if (skippedTypes.size > 0) {
    console.log("\nEj rörda korttyper (kräver FSRS-replay för att avgöra om de visades):");
    for (const [key, n] of skippedTypes) {
      const [courseId, type] = key.split("|");
      console.log(`  kurs ${courseId} ${type}: ${n} luckor`);
    }
  }
  // Ångerlogg: exakt vilka rader körningen skapade. Utan den går en
  // felkörning inte att skilja från riktiga tomma svar i efterhand.
  if (apply && insertedIds.length > 0) {
    const path = resolve(moduleDir, `../fyll-obesvarade-${Date.now()}.json`);
    writeFileSync(path, JSON.stringify({ insertedAnswerIds: insertedIds }, null, 2));
    console.log(`\nÅngerlogg: ${path}`);
    console.log(`Ångra med: DELETE FROM "Answer" WHERE id = ANY(...);`);
  }
} finally {
  await pool.end();
}
