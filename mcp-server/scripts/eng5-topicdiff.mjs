// READ-ONLY: jämför topic-namnen i csv-luckor/ med de topics som finns i kurs 13.
// Fångar att importen annars skulle skapa dubbletter av veckorna.
import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readdirSync, readFileSync } from "node:fs";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

neonConfig.webSocketConstructor = ws;
const moduleDir = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(moduleDir, "../.env") });

const CSV_DIR = "C:/Brain/resources/eng5-ordbank/csv-luckor";
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

try {
  const { rows } = await pool.query(
    `SELECT id, name FROM "Topic" WHERE "courseId"=13 ORDER BY name`
  );
  const iDb = new Map(rows.map((r) => [r.name, r.id]));

  for (const fil of readdirSync(CSV_DIR).filter((f) => f.endsWith(".csv"))) {
    const rader = readFileSync(resolve(CSV_DIR, fil), "utf8").split("\n").slice(1);
    const namn = new Set(
      rader
        .filter((r) => r.trim())
        .map((r) => r.match(/^"([^"]+)"/)?.[1] ?? r.split(",")[0])
    );
    for (const n of namn) {
      const träff = iDb.has(n);
      console.log(`${träff ? "OK  " : "NY  "} ${fil.padEnd(14)} topic=${träff ? iDb.get(n) : "-"}  "${n}"`);
    }
  }
} catch (e) {
  console.error("ERROR:", e.message);
} finally {
  await pool.end();
}
