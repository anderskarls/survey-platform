/**
 * Rensar dubbla svar på samma fråga inom EN och samma inlämning.
 *
 * Uppstod som rest när merge-split-responses.mjs flyttade in vinnarsvaren i
 * den inlämning som skulle behållas: de senare omsvar som råkade ligga i just
 * den inlämningen följde inte med i raderingen av de andra. Modellen tillåter
 * bara ett svar per fråga och inlämning (respond-routen avvisar dubbletter),
 * så de här raderna ska inte finnas.
 *
 * Första svaret behålls, av samma skäl som i merge-skriptet: det är elevens
 * egen stavning, innan resultatsidan visade facit.
 *
 *   node scripts/rensa-dubbelsvar.mjs <enkatId...> [--apply]
 */
import { config } from "dotenv";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync, writeFileSync } from "node:fs";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

neonConfig.webSocketConstructor = ws;
const moduleDir = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(moduleDir, "../mcp-server/.env") });

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const surveyIds = args.filter((a) => /^\d+$/.test(a)).map(Number);
if (!surveyIds.length) {
  console.error("Ange minst ett enkät-ID.");
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const q = async (sql, p = []) => (await pool.query(sql, p)).rows;

try {
  for (const surveyId of surveyIds) {
    const rows = await q(`
      SELECT a.id, a."responseId", a."questionId", a.value, a."isCorrect",
             s.number AS nr
      FROM "Answer" a
      JOIN "Response" r ON r.id=a."responseId"
      JOIN "Student" s ON s.id=r."studentId"
      WHERE r."surveyId"=$1
      ORDER BY a."responseId", a."questionId", a.id`, [surveyId]);

    const grupp = new Map();
    for (const a of rows) {
      const k = `${a.responseId}:${a.questionId}`;
      if (!grupp.has(k)) grupp.set(k, []);
      grupp.get(k).push(a);
    }

    const taBort = [];
    for (const [, v] of grupp) {
      if (v.length < 2) continue;
      const [behall, ...rest] = v;
      for (const a of rest) {
        taBort.push(a);
        console.log(`  nr ${String(a.nr).padStart(3)} fråga ${a.questionId}: behåller "${behall.value}" (${behall.isCorrect}), raderar "${a.value}" (${a.isCorrect})`);
      }
    }

    console.log(`\nEnkät ${surveyId}: ${rows.length} svar, ${taBort.length} dubbletter att radera`);
    if (!taBort.length) continue;
    if (!apply) { console.log("TORRKÖRNING - inget skrivet. Lägg till --apply."); continue; }

    const backupDir = resolve(moduleDir, "../backup");
    mkdirSync(backupDir, { recursive: true });
    const fil = join(backupDir, `rensa-dubbelsvar-${surveyId}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    writeFileSync(fil, JSON.stringify({ surveyId, taBort }, null, 1), "utf8");
    console.log(`Backup: ${fil}`);

    await q(`DELETE FROM "Answer" WHERE id = ANY($1::int[])`, [taBort.map((a) => a.id)]);
    const [efter] = await q(`
      SELECT count(DISTINCT r.id) AS inlamningar, count(a.id) AS svar
      FROM "Response" r LEFT JOIN "Answer" a ON a."responseId"=r.id
      WHERE r."surveyId"=$1`, [surveyId]);
    console.log(`Efter: ${efter.inlamningar} inlämningar, ${efter.svar} svar`);
  }
} finally {
  await pool.end();
}
