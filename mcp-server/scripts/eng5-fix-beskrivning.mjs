// Jämkar beskrivningen på de tre första stavningstesten (vecka 01-03) med de
// 24 senare. De skrevs med ASCII-a ("raknas") i en tidigare session.
//
//   node scripts/eng5-fix-beskrivning.mjs --dry
//   node scripts/eng5-fix-beskrivning.mjs
import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

neonConfig.webSocketConstructor = ws;
config({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../.env") });

const RÄTT = "Skriv in det engelska ordet som saknas. Stavningen räknas.";
const DRY = process.argv.includes("--dry");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

try {
  const { rows } = await pool.query(
    `SELECT id, title, description FROM "Survey"
     WHERE "courseId"=13 AND title LIKE '%stavning%' AND description <> $1
     ORDER BY title`,
    [RÄTT]
  );
  for (const r of rows) {
    console.log(`${DRY ? "SKULLE" : "UPPDAT"}  id=${String(r.id).padEnd(5)} "${r.title}"`);
    console.log(`         ${r.description}\n      -> ${RÄTT}`);
    if (!DRY)
      await pool.query(`UPDATE "Survey" SET description=$1 WHERE id=$2`, [RÄTT, r.id]);
  }
  console.log(`\n${rows.length} test ${DRY ? "skulle jämkas" : "jämkade"}.`);
} catch (e) {
  console.error("ERROR:", e.message);
} finally {
  await pool.end();
}
