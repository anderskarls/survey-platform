// Kortar veckotesten till högst 10 frågor.
//
// Bakgrund: i Veckotest 01 (både Engelska 5 och Engelska 7) föll svansen isär.
// Engelska 5 avgjorde varför - där fick "relationship" 26 % och "personality"
// 35 %, ord som inte är svåra för en svensk gymnasieelev. De satt sist. Antal
// tomma svar följde positionen, inte ordet, och all aktivitet låg inom 8-13
// minuter. Eleverna hann inte fram. 15 ord där man ska producera exakt rätt
// engelskt ord ur en svensk ledtråd är för många på ett lektionsmoment.
//
// Urvalet är jämnt spritt över listan, inte de tio första: veckoorden ligger i
// bokstavsordning, så ett "ta de tio första" hade betytt att sena bokstäver
// aldrig mättes. Första och sista ordet behålls alltid. De fem som lämnar
// testet finns kvar som glosekort i övningen - de slutar mätas, inte övas.
//
// Rör bara enkäter UTAN svar från riktiga elever. Provkontots svar räknas inte.
//
// TORRKÖRNING SOM DEFAULT. Skriver bara med --apply.
// Usage: node scripts/korta-veckotest.mjs [courseId ...] [--apply] [--tak=10]
import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

neonConfig.webSocketConstructor = ws;
const moduleDir = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(moduleDir, "../.env") });

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const takArg = args.find((a) => a.startsWith("--tak="));
const TAK = takArg ? Number(takArg.split("=")[1]) : 10;
const courseIds = args
  .filter((a) => !a.startsWith("--"))
  .map(Number)
  .filter(Boolean);

if (courseIds.length === 0) {
  console.error("Ange minst en courseId. T.ex: node scripts/korta-veckotest.mjs 13 36 38");
  process.exit(1);
}

/**
 * Jämnt spridda index över en lista av längd n, TAK stycken, första och
 * sista alltid med. round(i * (n-1) / (TAK-1)) ger en lika fördelning som
 * inte klumpar ihop sig i någon ände.
 */
function spriddaIndex(n, tak) {
  if (n <= tak) return [...Array(n).keys()];
  const valda = new Set();
  for (let i = 0; i < tak; i++) {
    valda.add(Math.round((i * (n - 1)) / (tak - 1)));
  }
  // Avrundningen kan i teorin ge en krock; fyll på framifrån om så.
  for (let i = 0; valda.size < tak && i < n; i++) valda.add(i);
  return [...valda].sort((a, b) => a - b);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

try {
  const surveys = await pool.query(
    `SELECT s.id, s.title, s."courseId", c.name AS course_name,
            (SELECT COUNT(*) FROM "SurveyQuestion" sq WHERE sq."surveyId" = s.id) AS n,
            (SELECT COUNT(*) FROM "Response" r
               JOIN "Student" st ON st.id = r."studentId"
              WHERE r."surveyId" = s.id AND st."isTest" = false) AS riktiga_svar
       FROM "Survey" s JOIN "Course" c ON c.id = s."courseId"
      WHERE s."courseId" = ANY($1::int[])
        AND s.mode = 'QUIZ'
        AND s.title LIKE 'Veckotest%'
      ORDER BY s."courseId", s.title`,
    [courseIds]
  );

  const borttagna = [];
  let rorda = 0;
  let hoppade = 0;

  for (const s of surveys.rows) {
    const n = Number(s.n);
    if (Number(s.riktiga_svar) > 0) {
      console.log(
        `  hoppar [${s.id}] ${s.course_name} ${s.title} - ${s.riktiga_svar} riktiga elevsvar finns redan`
      );
      hoppade++;
      continue;
    }
    if (n <= TAK) continue;

    const qs = await pool.query(
      `SELECT sq."questionId", sq."order", q.config
         FROM "SurveyQuestion" sq JOIN "Question" q ON q.id = sq."questionId"
        WHERE sq."surveyId" = $1 ORDER BY sq."order"`,
      [s.id]
    );

    const behall = new Set(spriddaIndex(qs.rows.length, TAK));
    const ut = qs.rows.filter((_, i) => !behall.has(i));
    const kvar = qs.rows.filter((_, i) => behall.has(i));

    console.log(
      `\n[${s.id}] ${s.course_name} ${s.title}: ${n} -> ${kvar.length} frågor`
    );
    console.log(
      `  ur testet: ${ut.map((r) => r.config?.answer ?? "?").join(", ")}`
    );

    if (apply) {
      for (const r of ut) {
        await pool.query(
          `DELETE FROM "SurveyQuestion" WHERE "surveyId" = $1 AND "questionId" = $2`,
          [s.id, r.questionId]
        );
        borttagna.push({
          surveyId: s.id,
          questionId: r.questionId,
          order: r.order,
          ord: r.config?.answer ?? null,
        });
      }
      // Numrera om så ordningen blir 0..9 utan hål
      for (let i = 0; i < kvar.length; i++) {
        await pool.query(
          `UPDATE "SurveyQuestion" SET "order" = $1 WHERE "surveyId" = $2 AND "questionId" = $3`,
          [i, s.id, kvar[i].questionId]
        );
      }
    }
    rorda++;
  }

  console.log(
    `\n${apply ? "== SKARP KÖRNING ==" : "== TORRKÖRNING (inget skrivs) =="}`
  );
  console.log(`Tak: ${TAK} frågor. Kurser: ${courseIds.join(", ")}`);
  console.log(`Enkäter att korta: ${rorda}. Överhoppade (har elevsvar): ${hoppade}.`);

  if (apply && borttagna.length > 0) {
    const path = resolve(moduleDir, `../korta-veckotest-${Date.now()}.json`);
    writeFileSync(path, JSON.stringify({ borttagna }, null, 2));
    console.log(`\nÅngerlogg (surveyId, questionId, ursprunglig order): ${path}`);
  }
} finally {
  await pool.end();
}
