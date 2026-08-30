/**
 * Slår ihop de inlämningar som Enter-buggen delade sönder.
 *
 * Bakgrund: luckfrågorna visas en i taget, och ett formulär med exakt ett
 * textfält skickas av HTML:s implicita inlämning när eleven trycker Enter.
 * Varje Enter blev därför en egen Response med det enda ord som var ifyllt.
 * Kurs 13:s Veckotest 01 fick 196 rader från 24 elever den 2026-08-28.
 *
 * Skriptet grupperar varje elevs inlämningar i kluster - inlämningar med
 * mindre än FONSTER_MIN minuters lucka hör till samma sittning - och slår ihop
 * varje kluster till EN inlämning med FÖRSTA svaret per fråga. Kluster långt
 * isär lämnas orörda: det är avsiktliga omkörningar, inte fragment.
 *
 * Varför första och inte senaste: varje oavsiktlig inlämning visade eleven
 * resultatsidan med facit. På enkät 114 var 33 av 37 omsvar fel -> rätt och
 * noll rätt -> fel - det är avskrivet facit, inte eleven som ändrar sig. Det
 * första svaret är elevens egen stavning, och stavningen är vad testet mäter.
 *
 *   node scripts/merge-split-responses.mjs <enkatId...> [--apply] [--fonster N]
 *
 * Utan --apply skrivs ingenting. Före varje skrivning dumpas alla berörda
 * rader till backup/merge-responses-<enkat>-<tid>.json.
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
config({ path: resolve(moduleDir, "../.env") });

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const fi = args.indexOf("--fonster");
const FONSTER_MIN = fi >= 0 ? Number(args[fi + 1]) : 60;
const surveyIds = args
  .filter((a, i) => /^\d+$/.test(a) && !(fi >= 0 && i === fi + 1))
  .map(Number);

if (!surveyIds.length) {
  console.error("Ange minst ett enkät-ID. Exempel: node scripts/merge-split-responses.mjs 114 --apply");
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const q = async (sql, p = []) => (await pool.query(sql, p)).rows;

try {
  for (const surveyId of surveyIds) {
    const [survey] = await q(
      `SELECT id, title, "courseId" FROM "Survey" WHERE id=$1`, [surveyId]);
    if (!survey) { console.log(`Enkät ${surveyId}: finns inte`); continue; }

    const responses = await q(`
      SELECT r.id, r."studentId", r."createdAt", r."lockModeViolations", s.number AS nr
      FROM "Response" r JOIN "Student" s ON s.id=r."studentId"
      WHERE r."surveyId"=$1 ORDER BY r."studentId", r."createdAt"`, [surveyId]);
    const answers = await q(`
      SELECT a.id, a."responseId", a."questionId", a.value, a."isCorrect", a.grade, a.feedback
      FROM "Answer" a JOIN "Response" r ON r.id=a."responseId"
      WHERE r."surveyId"=$1 ORDER BY a.id`, [surveyId]);

    const svarPerResponse = new Map();
    for (const a of answers) {
      if (!svarPerResponse.has(a.responseId)) svarPerResponse.set(a.responseId, []);
      svarPerResponse.get(a.responseId).push(a);
    }

    // Gruppera per elev, dela i kluster efter tidsluckan
    const perElev = new Map();
    for (const r of responses) {
      if (!perElev.has(r.studentId)) perElev.set(r.studentId, []);
      perElev.get(r.studentId).push(r);
    }

    console.log(`\n=== Enkät ${surveyId} "${survey.title}" (kurs ${survey.courseId}) ===`);
    console.log(`${responses.length} inlämningar, ${answers.length} svar, ${perElev.size} elever, fönster ${FONSTER_MIN} min`);

    const planer = [];
    for (const [studentId, rs] of perElev) {
      const kluster = [];
      for (const r of rs) {
        const senaste = kluster.at(-1);
        const gap = senaste
          ? (new Date(r.createdAt) - new Date(senaste.at(-1).createdAt)) / 60000
          : Infinity;
        if (senaste && gap <= FONSTER_MIN) senaste.push(r);
        else kluster.push([r]);
      }
      for (const k of kluster) {
        if (k.length < 2) continue;
        // Första svaret per fråga vinner - svaren är sorterade på id
        // (stigande), så det första som sätts är det eleven skrev innan facit
        // visades. Senare omsvar på samma fråga raderas med sin Response.
        const forstaSvar = new Map();
        for (const r of k)
          for (const a of svarPerResponse.get(r.id) ?? [])
            if (!forstaSvar.has(a.questionId)) forstaSvar.set(a.questionId, a);
        const behall = k.at(-1); // sista inlämningen i sittningen = den fullbordade
        planer.push({
          studentId, nr: k[0].nr,
          behall: behall.id,
          taBort: k.filter((r) => r.id !== behall.id).map((r) => r.id),
          svar: [...forstaSvar.values()],
          forsta: k[0].createdAt, sista: behall.createdAt,
        });
      }
    }

    if (!planer.length) { console.log("Inget att slå ihop."); continue; }

    for (const p of planer)
      console.log(`  elev nr ${String(p.nr).padStart(3)}: ${p.taBort.length + 1} -> 1 inlämning, ${p.svar.length} svar behålls  (${new Date(p.forsta).toISOString().slice(11,16)}-${new Date(p.sista).toISOString().slice(11,16)})`);
    const raderas = planer.reduce((n, p) => n + p.taBort.length, 0);
    const svarKvar = planer.reduce((n, p) => n + p.svar.length, 0);
    console.log(`\nSumma: ${planer.length} elever, ${raderas} inlämningar raderas, ${svarKvar} svar behålls`);
    const orord = responses.length - raderas - planer.length;
    console.log(`Orörda inlämningar (ensamma eller egen sittning): ${orord}`);

    if (!apply) { console.log("TORRKÖRNING - inget skrivet. Lägg till --apply."); continue; }

    const backupDir = resolve(moduleDir, "../backup");
    mkdirSync(backupDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupFil = join(backupDir, `merge-responses-${surveyId}-${stamp}.json`);
    writeFileSync(backupFil, JSON.stringify({ survey, responses, answers, planer }, null, 1), "utf8");
    console.log(`Backup: ${backupFil}`);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const p of planer) {
        const behallSvar = p.svar.map((a) => a.id);
        // Flytta vinnarsvaren till den inlämning som blir kvar ...
        await client.query(
          `UPDATE "Answer" SET "responseId"=$1 WHERE id = ANY($2::int[])`,
          [p.behall, behallSvar]);
        // ... och radera de tomma inlämningarna. Answer har cascade, så
        // eventuella förlorarsvar (äldre svar på samma fråga) följer med.
        await client.query(
          `DELETE FROM "Response" WHERE id = ANY($1::int[])`, [p.taBort]);
        // Sittningens starttid är sanningen om när eleven började.
        await client.query(
          `UPDATE "Response" SET "createdAt"=$1 WHERE id=$2`, [p.forsta, p.behall]);
      }
      await client.query("COMMIT");
      console.log("KLART - ihopslaget.");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }

    const [efter] = await q(`
      SELECT count(DISTINCT r.id) AS inlamningar, count(a.id) AS svar,
             count(DISTINCT r."studentId") AS elever
      FROM "Response" r LEFT JOIN "Answer" a ON a."responseId"=r.id
      WHERE r."surveyId"=$1`, [surveyId]);
    console.log(`Efter: ${efter.inlamningar} inlämningar, ${efter.svar} svar, ${efter.elever} elever`);
  }
} finally {
  await pool.end();
}
