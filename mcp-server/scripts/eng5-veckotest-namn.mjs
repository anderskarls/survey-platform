// Kurs 13 (Engelska 5): korta veckotestens titlar till bara "Veckotest NN".
// Temanamnen låg kvar från glosekortstesten och säger eleven ingenting som
// veckonumret inte redan säger.
//
// Utan flagga: dry-run. Med --apply: skarpt.
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

try {
  const surveys = await q(
    `SELECT id, title FROM "Survey" WHERE "courseId"=$1 ORDER BY id`,
    [COURSE_ID]
  );

  const byggda = [];
  for (const s of surveys) {
    const m = s.title.match(/^Veckotest (\d{2})/);
    if (!m) continue;
    const ny = `Veckotest ${m[1]}`;
    if (ny !== s.title) byggda.push({ id: s.id, fran: s.title, till: ny });
  }

  // Titlarna måste förbli unika inom kursen, annars blir listan obegriplig
  const titlar = new Set(byggda.map((b) => b.till));
  if (titlar.size !== byggda.length) {
    console.error("AVBRYTER - kortningen skulle ge dubbletter.");
    process.exit(1);
  }

  for (const b of byggda) console.log(`  id=${b.id}  "${b.fran}"  ->  "${b.till}"`);
  console.log(`\n${byggda.length} titlar att korta.`);

  if (!APPLY) {
    console.log("DRY-RUN. Kör med --apply.");
    process.exit(0);
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const b of byggda) {
      await client.query(`UPDATE "Survey" SET title=$1 WHERE id=$2`, [b.till, b.id]);
    }
    await client.query("COMMIT");
    console.log(`KLART: ${byggda.length} omdöpta.`);
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
} finally {
  await pool.end();
}
