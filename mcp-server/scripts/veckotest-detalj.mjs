// READ-ONLY: allt om ett veckotest - deltagande, svårighetsgrad per fråga,
// per elev, och vilka fel som bara var stavfel.
// Usage: node scripts/veckotest-detalj.mjs <surveyId>
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

/** Samma trösklar som nearMissThreshold i src/lib/cloze.ts. */
function nearMissThreshold(answer) {
  if (answer.length <= 4) return 1;
  if (answer.length <= 8) return 2;
  return 3;
}

/** Levenshtein - samma mått som cloze.ts använder för nära-miss. */
function editDistance(a, b) {
  const m = a.length;
  const n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    prev = cur;
  }
  return prev[n];
}

function norm(s) {
  return s
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

try {
  const s = await pool.query(
    `SELECT s.id, s.title, s.description, s.mode, s."openAt", s."createdAt",
            s."lockMode", c.id AS course_id, c.name AS course_name,
            (SELECT COUNT(*) FROM "Student" st WHERE st."courseId" = c.id AND st."isTest" = false) AS n_students
       FROM "Survey" s JOIN "Course" c ON c.id = s."courseId"
      WHERE s.id = $1`,
    [surveyId]
  );
  const survey = s.rows[0];
  if (!survey) {
    console.log("Finns inte.");
    process.exit(0);
  }

  console.log(`# ${survey.title} (enkät ${survey.id})`);
  console.log(`Kurs: ${survey.course_name} (id ${survey.course_id})`);
  console.log(`Läge: ${survey.mode}${survey.lock_mode ? " + låst läge" : ""}`);
  console.log(`Skapad: ${survey.createdAt?.toISOString?.().slice(0, 16) ?? survey.createdAt}`);
  console.log(`openAt: ${survey.openAt?.toISOString?.() ?? survey.openAt}`);
  console.log(`Elever i kursen: ${survey.n_students}`);

  const questions = await pool.query(
    `SELECT q.id, q.text, q.type, q.config, sq."order"
       FROM "SurveyQuestion" sq JOIN "Question" q ON q.id = sq."questionId"
      WHERE sq."surveyId" = $1 ORDER BY sq."order"`,
    [surveyId]
  );

  const answers = await pool.query(
    `SELECT a."questionId", a.value, a."isCorrect", st.number AS student_number,
            r.id AS response_id, r."createdAt" AS at
       FROM "Answer" a
       JOIN "Response" r ON r.id = a."responseId"
       JOIN "Student" st ON st.id = r."studentId"
      WHERE r."surveyId" = $1 AND st."isTest" = false
      ORDER BY st.number`,
    [surveyId]
  );

  const responses = new Map();
  for (const a of answers.rows) {
    if (!responses.has(a.response_id))
      responses.set(a.response_id, { n: a.student_number, at: a.at, rows: [] });
    responses.get(a.response_id).rows.push(a);
  }

  const deltagare = new Set([...responses.values()].map((r) => r.n));
  console.log(
    `\n## Deltagande\n${deltagare.size} av ${survey.n_students} elever, ${responses.size} inlämningar`
  );
  const first = [...responses.values()].map((r) => r.at).sort();
  if (first.length) {
    console.log(
      `Första: ${first[0].toISOString().slice(0, 16)}  Sista: ${first[first.length - 1].toISOString().slice(0, 16)}`
    );
  }

  console.log("\n## Per fråga");
  for (const q of questions.rows) {
    const svar = answers.rows.filter((a) => a.questionId === q.id);
    const ratt = svar.filter((a) => a.isCorrect === true).length;
    const tomma = svar.filter((a) => a.value.trim() === "").length;
    const facit = q.config?.answer ?? "";
    const felaktiga = svar.filter(
      (a) => a.isCorrect !== true && a.value.trim() !== ""
    );
    const stavfel = felaktiga.filter(
      (a) =>
        facit &&
        editDistance(norm(a.value), norm(facit)) <=
          nearMissThreshold(norm(facit))
    );
    const pct = svar.length ? Math.round((ratt / svar.length) * 100) : 0;
    console.log(
      `\n[${q.order}] ${q.text}\n  facit: "${facit}" - ${ratt}/${svar.length} rätt (${pct}%), ${tomma} tomma, ${felaktiga.length} felskrivna varav ${stavfel.length} stavfel`
    );
    if (felaktiga.length) {
      const lista = felaktiga
        .map((a) => `#${a.student_number}:"${a.value}"`)
        .join("  ");
      console.log(`  fel: ${lista}`);
    }
  }

  console.log("\n## Per elev");
  const rader = [...responses.values()]
    .map((r) => {
      const ratt = r.rows.filter((a) => a.isCorrect === true).length;
      const tomma = r.rows.filter((a) => a.value.trim() === "").length;
      return { n: r.n, ratt, av: r.rows.length, tomma };
    })
    .sort((a, b) => a.ratt - b.ratt);
  for (const r of rader) {
    const pct = Math.round((r.ratt / r.av) * 100);
    console.log(
      `  #${r.n}: ${r.ratt}/${r.av} (${pct}%)${r.tomma ? `, ${r.tomma} obesvarade` : ""}`
    );
  }

  const svarande = new Set(rader.map((r) => r.n));
  const alla = await pool.query(
    `SELECT number FROM "Student" WHERE "courseId" = $1 AND "isTest" = false ORDER BY number`,
    [survey.course_id]
  );
  const saknas = alla.rows.map((r) => r.number).filter((n) => !svarande.has(n));
  console.log(`\n## Har inte lämnat in (${saknas.length})`);
  console.log(saknas.map((n) => `#${n}`).join(", "));
} finally {
  await pool.end();
}
