// READ-ONLY: skiljer sig forsta och sista svaret pa samma fraga (enkat 114)?
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
  const rows = await q(`
    SELECT r."studentId", s.number AS nr, a."questionId", a.id, a.value, a."isCorrect"
    FROM "Answer" a JOIN "Response" r ON r.id=a."responseId" JOIN "Student" s ON s.id=r."studentId"
    WHERE r."surveyId"=114 ORDER BY r."studentId", a."questionId", a.id`);
  const grupp = new Map();
  for (const r of rows) {
    const k = `${r.studentId}:${r.questionId}`;
    if (!grupp.has(k)) grupp.set(k, []);
    grupp.get(k).push(r);
  }
  let flera = 0, identiska = 0, felTillRatt = 0, rattTillFel = 0, annat = 0;
  const exempel = [];
  for (const [, v] of grupp) {
    if (v.length < 2) continue;
    flera++;
    const f = v[0], s = v.at(-1);
    if (f.value === s.value) { identiska++; continue; }
    if (f.isCorrect === false && s.isCorrect === true) { felTillRatt++; if (exempel.length < 8) exempel.push(`nr ${f.nr} fraga ${f.questionId}: "${f.value}" -> "${s.value}" (fel -> RATT)`); }
    else if (f.isCorrect === true && s.isCorrect === false) rattTillFel++;
    else { annat++; if (exempel.length < 8) exempel.push(`nr ${f.nr} fraga ${f.questionId}: "${f.value}" -> "${s.value}" (${f.isCorrect} -> ${s.isCorrect})`); }
  }
  console.log(`Fragor med flera svar fran samma elev: ${flera}`);
  console.log(`  identiskt svar igen: ${identiska}`);
  console.log(`  fel -> ratt: ${felTillRatt}`);
  console.log(`  ratt -> fel: ${rattTillFel}`);
  console.log(`  ovrigt (fel -> annat fel osv): ${annat}`);
  console.log("\nExempel:");
  for (const e of exempel) console.log("  " + e);

  console.log("\n=== Poang per elev: forsta svaret vs sista svaret ===");
  const perElev = new Map();
  for (const [, v] of grupp) {
    const nr = v[0].nr;
    if (!perElev.has(nr)) perElev.set(nr, { forsta: 0, sista: 0, fragor: 0 });
    const p = perElev.get(nr);
    p.fragor++;
    if (v[0].isCorrect) p.forsta++;
    if (v.at(-1).isCorrect) p.sista++;
  }
  for (const [nr, p] of [...perElev].sort((a, b) => a[0] - b[0]))
    console.log(`  nr ${String(nr).padStart(3)}: forsta ${String(p.forsta).padStart(2)}/${p.fragor}   sista ${String(p.sista).padStart(2)}/${p.fragor}${p.sista > p.forsta ? "   <-- skillnad" : ""}`);
} finally { await pool.end(); }
