// READ-ONLY: samlat lage for engelskakurserna (13 SA, 36 EK, 38 En7).
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
const IDS = [13, 36, 38];

try {
  for (const id of IDS) {
    const [c] = await q(`SELECT id,name,code,"flashcardMode" FROM "Course" WHERE id=$1`, [id]);
    if (!c) { console.log(`Kurs ${id}: SAKNAS`); continue; }
    const [s] = await q(`SELECT count(*) FILTER (WHERE NOT "isTest") AS elever,
        count(*) FILTER (WHERE "isTest") AS testkonton FROM "Student" WHERE "courseId"=$1`, [id]);
    const topics = await q(`SELECT name, "practiceOpen" FROM "Topic" WHERE "courseId"=$1 ORDER BY name`, [id]);
    const open = topics.filter(t => t.practiceOpen).map(t => t.name);
    const surveys = await q(`SELECT id,title,"openAt","shareCode" FROM "Survey" WHERE "courseId"=$1 ORDER BY id`, [id]);
    const manual = surveys.filter(v => v.openAt && new Date(v.openAt).getUTCFullYear() >= 2090);
    const oppna = surveys.filter(v => !v.openAt || new Date(v.openAt) <= new Date());
    const schemalagda = surveys.length - manual.length - oppna.length;
    const [a] = await q(`SELECT
        (SELECT count(*) FROM "Response" r JOIN "Survey" v ON r."surveyId"=v.id WHERE v."courseId"=$1) AS svar,
        (SELECT count(*) FROM "PracticeAttempt" pa JOIN "Student" st ON pa."studentId"=st.id WHERE st."courseId"=$1) AS ovningar,
        (SELECT count(*) FROM "AdminCourse" WHERE "courseId"=$1) AS admins`, [id]);
    console.log(`\n=== ${c.id}  ${c.name}  (${c.code})  flashcardMode=${c.flashcardMode} ===`);
    console.log(`  elever ${s.elever} (+${s.testkonton} testkonton)   admins ${a.admins}`);
    console.log(`  amnen ${topics.length}  |  practiceOpen: ${open.length ? open.join(", ") : "INGEN"}`);
    console.log(`  enkater ${surveys.length}  |  oppna nu ${oppna.length}  manuella ${manual.length}  schemalagda ${schemalagda}`);
    if (oppna.length) console.log(`    oppna: ${oppna.map(v => `${v.title} /s/${v.shareCode}`).join(" | ")}`);
    console.log(`  elevsvar ${a.svar}   ovningsforsok ${a.ovningar}`);
  }
} finally { await pool.end(); }
