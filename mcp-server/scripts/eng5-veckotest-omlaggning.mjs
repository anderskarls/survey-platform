// Kurs 13 (Engelska 5): veckotesten blir luckfrågor, glosekorten blir övning.
//
// Bakgrund: kursen hade två parallella testserier - "Veckotest NN" med
// glosekort (självskattning) och "Vecka NN - stavning" med luckfrågor
// (rätt/fel). Beslutet är att veckotestet ska MÄTA, så glosekortstesten tas
// bort som enkäter och stavningstesten ärver deras namn. Glosekortsfrågorna
// ligger kvar i frågebanken och når eleverna via övningspasset i stället
// (Topic.practiceOpen - läraren öppnar en vecka i taget).
//
// Kör utan flagga för dry-run, med --apply för skarpt.
import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

neonConfig.webSocketConstructor = ws;
const moduleDir = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(moduleDir, "../.env") });

const APPLY = process.argv.includes("--apply");
const COURSE_ID = 13;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const q = async (sql, p = []) => (await pool.query(sql, p)).rows;

/** "Veckotest 01 - Känslor..." -> "01";  "Vecka 01 - stavning" -> "01" */
function weekOf(title) {
  const m = title.match(/^Veckotest (\d{2})|^Vecka (\d{2})/);
  return m ? m[1] ?? m[2] : null;
}

try {
  const surveys = await q(
    `SELECT v.id, v.title, v.description,
            (SELECT count(*)::int FROM "Response" r WHERE r."surveyId"=v.id) AS svar
     FROM "Survey" v WHERE v."courseId"=$1 ORDER BY v.id`,
    [COURSE_ID]
  );

  const kort = surveys.filter((s) => s.title.startsWith("Veckotest "));
  const luckor = surveys.filter((s) => /^Vecka \d{2} - stavning$/.test(s.title));

  console.log(`Glosekortstest att radera: ${kort.length}`);
  console.log(`Stavningstest att döpa om: ${luckor.length}`);

  // Spärr: radera aldrig ett test som eleverna faktiskt svarat på
  const medSvar = kort.filter((s) => s.svar > 0);
  if (medSvar.length > 0) {
    console.error("\nAVBRYTER - dessa har elevsvar:");
    for (const s of medSvar) console.error(`  id=${s.id} "${s.title}" (${s.svar} svar)`);
    process.exit(1);
  }

  // Namnmappning vecka -> glosekortstestets titel, som luckorna ärver
  const titelPerVecka = new Map();
  for (const s of kort) {
    const v = weekOf(s.title);
    if (v) titelPerVecka.set(v, s.title);
  }

  const omdop = [];
  const utanMotsvarighet = [];
  for (const s of luckor) {
    const v = weekOf(s.title);
    const nyTitel = v ? titelPerVecka.get(v) : null;
    if (nyTitel) omdop.push({ id: s.id, fran: s.title, till: nyTitel });
    else utanMotsvarighet.push(s);
  }

  console.log("\n=== Omdöpningar ===");
  for (const o of omdop) console.log(`  id=${o.id}  "${o.fran}"  ->  "${o.till}"`);
  if (utanMotsvarighet.length > 0) {
    console.log("\nStavningstest utan motsvarande veckotest (lämnas orörda):");
    for (const s of utanMotsvarighet) console.log(`  id=${s.id} "${s.title}"`);
  }

  console.log("\n=== Raderingar ===");
  for (const s of kort) console.log(`  id=${s.id} "${s.title}"`);

  if (!APPLY) {
    console.log("\nDRY-RUN. Kör med --apply för att genomföra.");
    process.exit(0);
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const o of omdop) {
      await client.query(`UPDATE "Survey" SET title=$1 WHERE id=$2`, [o.till, o.id]);
    }
    const ids = kort.map((s) => s.id);
    if (ids.length > 0) {
      await client.query(`DELETE FROM "Survey" WHERE id = ANY($1::int[])`, [ids]);
    }
    await client.query("COMMIT");
    console.log(`\nKLART: ${omdop.length} omdöpta, ${ids.length} raderade.`);
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
} finally {
  await pool.end();
}
