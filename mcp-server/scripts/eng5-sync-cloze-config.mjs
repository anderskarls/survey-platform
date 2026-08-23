// Synkar CLOZE-configen (answer/hint/accept) i kurs 13 mot csv-luckor/.
// CSV:n är källan; databasen ska följa den. Rör bara config - text, typ och
// koppling till test lämnas orörda.
//
//   node scripts/eng5-sync-cloze-config.mjs --dry
//   node scripts/eng5-sync-cloze-config.mjs
//
// Säkerhetsspärr: vägrar röra en fråga som redan har elevsvar, för då är det
// question-edit.ts väg som gäller (omrättning av lagrade svar), inte en rå
// config-skrivning. Frågor utan svar skrivs direkt.
import { config as dotenv } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readdirSync, readFileSync } from "node:fs";
import Papa from "papaparse";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

neonConfig.webSocketConstructor = ws;
const moduleDir = dirname(fileURLToPath(import.meta.url));
dotenv({ path: resolve(moduleDir, "../.env") });

const CSV_DIR = "C:/Brain/resources/eng5-ordbank/csv-luckor";
const DRY = process.argv.includes("--dry");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const franCsv = new Map();
for (const fil of readdirSync(CSV_DIR).filter((f) => f.endsWith(".csv"))) {
  const { data } = Papa.parse(readFileSync(resolve(CSV_DIR, fil), "utf8"), {
    header: true,
    skipEmptyLines: true,
  });
  for (const rad of data) {
    if (rad.type?.trim().toUpperCase() === "CLOZE" && rad.text?.trim())
      franCsv.set(rad.text.trim(), JSON.parse(rad.config));
  }
}

const lika = (a, b) =>
  JSON.stringify(a, Object.keys(a ?? {}).sort()) ===
  JSON.stringify(b, Object.keys(b ?? {}).sort());

try {
  const { rows: medSvar } = await pool.query(`
    SELECT DISTINCT a."questionId" id FROM "Answer" a
    JOIN "Question" q ON q.id=a."questionId"
    JOIN "Topic" t ON t.id=q."topicId"
    WHERE t."courseId"=13 AND q.type='CLOZE'`);
  const besvarade = new Set(medSvar.map((r) => r.id));

  const { rows } = await pool.query(`
    SELECT q.id, q.text, q.config FROM "Question" q
    JOIN "Topic" t ON t.id=q."topicId"
    WHERE t."courseId"=13 AND q.type='CLOZE'`);

  let ändrade = 0;
  let saknade = 0;
  let skyddade = 0;
  for (const r of rows) {
    const önskad = franCsv.get(r.text.trim());
    if (!önskad) {
      console.log(`SAKNAS I CSV  id=${r.id}  "${r.text.slice(0, 60)}"`);
      saknade++;
      continue;
    }
    if (lika(önskad, r.config)) continue;
    if (besvarade.has(r.id)) {
      console.log(
        `SKYDDAD id=${String(r.id).padEnd(5)} har elevsvar - ändra via appens ` +
          `PATCH-route (question-edit.ts), inte här.`
      );
      skyddade++;
      continue;
    }
    console.log(
      `${DRY ? "SKULLE" : "UPPDAT"}  id=${String(r.id).padEnd(5)} ` +
        `${JSON.stringify(r.config)}  ->  ${JSON.stringify(önskad)}`
    );
    if (!DRY)
      await pool.query(`UPDATE "Question" SET config=$1 WHERE id=$2`, [
        JSON.stringify(önskad),
        r.id,
      ]);
    ändrade++;
  }
  console.log(
    `\n${rows.length} luckfrågor granskade, ${ändrade} ${DRY ? "skulle ändras" : "uppdaterade"}, ${saknade} utan motsvarighet i CSV, ${skyddade} skyddade av elevsvar.`
  );
} catch (e) {
  console.error("ERROR:", e.message);
} finally {
  await pool.end();
}
