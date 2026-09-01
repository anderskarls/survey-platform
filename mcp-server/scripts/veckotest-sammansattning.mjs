// Lägger om veckotestens sammansättning: 13 nya ord + 5 repetitionsord.
//
// Bakgrund. Veckotesten byggdes först som "veckans hela ordlista" (13-15 ord)
// och kortades 2026-08-31 till 10, sedan svansen fallit isär i Veckotest 01 -
// tomma svar följde positionen i listan, inte ordet. Testet mätte alltså bara
// veckan som var, och ord som passerat slutade mätas helt.
//
// Nu bär varje test två delar:
//
//   - **13 nya ord** ur veckans eget ämne. Har veckan fler tas 13 jämnt
//     spridda över listan (första och sista alltid med) - orden ligger i
//     bokstavsordning, så "de 13 första" hade betytt att sena bokstäver
//     aldrig mättes. Har veckan färre tas alla.
//   - **5 repetitionsord** ur TIDIGARE veckor, jämnt spridda över kursen så
//     långt den gått: fem veckor väljs jämnt över de föregående (den första
//     och den närmast föregående alltid med), och ett ord dras ur varje.
//
// De fem ligger inflätade bland veckans ord, på jämnt fördelade platser.
//
// Urvalet är FAST per test - dras en gång här och är sedan detsamma för alla
// elever, så resultatvyn per fråga går att läsa. Slumpen är seedad på
// surveyId, alltså ger en omkörning samma test.
//
// Två saker som INTE händer, båda kontrollerade:
//   - Inga kommande ord läcker ut i övningen. Ett ämne blir övningsbart så
//     snart någon av dess frågor ingår i en släppt enkät (week-practice-data.ts).
//     Repetitionsorden kommer bara från veckor som redan släppts, så släppet
//     av vecka N öppnar ingenting nytt.
//   - Enkäter med riktiga elevsvar rörs inte. Provkontots svar räknas inte.
//
// TORRKÖRNING SOM DEFAULT. Skriver bara med --apply.
// Usage: node scripts/veckotest-sammansattning.mjs [courseId ...] [--apply] [--nya=13] [--rep=5]
import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

neonConfig.webSocketConstructor = ws;
const moduleDir = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(moduleDir, "../.env") });

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const talArg = (namn, standard) => {
  const a = args.find((x) => x.startsWith(`--${namn}=`));
  return a ? Number(a.split("=")[1]) : standard;
};
const NYA = talArg("nya", 13);
const REP = talArg("rep", 5);
const courseIds = args
  .filter((a) => !a.startsWith("--"))
  .map(Number)
  .filter(Boolean);

if (courseIds.length === 0) {
  console.error(
    "Ange minst en courseId. T.ex: node scripts/veckotest-sammansattning.mjs 13 36 38"
  );
  process.exit(1);
}

/** Veckonumret ur "Veckotest 07" eller "Vecka 07 - Kultur, språk och ...". */
function veckonummer(text) {
  const m = text.match(/\b(\d{1,2})\b/);
  return m ? Number(m[1]) : null;
}

/**
 * `antal` jämnt spridda index över en lista av längd n, första och sista
 * alltid med. Samma fördelning som nedkortningen 2026-08-31 använde, så
 * urvalet ur en vecka blir detsamma vare sig testet kortas eller läggs om.
 */
function spriddaIndex(n, antal) {
  if (n <= antal) return [...Array(n).keys()];
  if (antal <= 1) return [0];
  const valda = new Set();
  for (let i = 0; i < antal; i++) {
    valda.add(Math.round((i * (n - 1)) / (antal - 1)));
  }
  for (let i = 0; valda.size < antal && i < n; i++) valda.add(i);
  return [...valda].sort((a, b) => a - b);
}

/** Seedad slump (mulberry32) - samma surveyId ger samma test vid omkörning. */
function seedadSlump(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Repetitionsorden: `antal` ord ur tidigare veckor, jämnt över kursen.
 *
 * Veckorna väljs först - jämnt spridda över de föregående, vilket alltid ger
 * med både den allra första veckan och den närmast föregående. Sedan dras ett
 * ord ur varje vald vecka. Finns det färre tidigare veckor än platser cyklas
 * veckorna om, och en vecka får då lämna flera ord.
 */
function valjRepetition(tidigare, antal, slump) {
  if (tidigare.length === 0 || antal <= 0) return [];
  const n = tidigare.length;
  const veckoindex = [];
  for (let i = 0; i < antal; i++) {
    veckoindex.push(
      n >= antal
        ? antal === 1
          ? n - 1
          : Math.round((i * (n - 1)) / (antal - 1))
        : i % n
    );
  }

  const anvanda = new Set();
  const valda = [];
  for (const start of veckoindex) {
    // Är veckans pool tömd (fler platser än ord) letas närmaste vecka framåt.
    for (let steg = 0; steg < n; steg++) {
      const v = tidigare[(start + steg) % n];
      const lediga = v.ord.filter((q) => !anvanda.has(q.id));
      if (lediga.length === 0) continue;
      const q = lediga[Math.floor(slump() * lediga.length)];
      anvanda.add(q.id);
      valda.push({ ...q, vecka: v.vecka });
      break;
    }
  }
  return valda;
}

/**
 * Platserna där repetitionsorden hamnar bland veckans ord: jämnt fördelade,
 * aldrig först och aldrig sist. Positionseffekten träffar båda ändarna, och
 * veckans egna ord är det som faktiskt ska mätas där.
 */
function repetitionsplatser(totalt, antal) {
  const platser = [];
  for (let i = 0; i < antal; i++) {
    let p = Math.round(((i + 1) * (totalt + 1)) / (antal + 1)) - 1;
    p = Math.max(1, Math.min(totalt - 2, p));
    while (platser.includes(p) && p < totalt - 1) p++;
    while (platser.includes(p) && p > 1) p--;
    platser.push(p);
  }
  return platser;
}

/** Ordet frågan mäter, som det står i konfigurationen. */
const ordet = (q) => q.config?.answer ?? `#${q.id}`;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

try {
  const kurser = await pool.query(
    `SELECT id, name FROM "Course" WHERE id = ANY($1::int[]) ORDER BY id`,
    [courseIds]
  );

  const angerlogg = [];
  let lagda = 0;
  let hoppade = 0;

  for (const kurs of kurser.rows) {
    console.log(`\n=== [${kurs.id}] ${kurs.name} ===`);

    // Veckornas ordpooler. Bara CLOZE - luckfrågan är mätningen; korten
    // (CLOZE_CARD) är övningen och hör inte hemma i ett test.
    const fragor = await pool.query(
      `SELECT q.id, q.config, t.id AS topic_id, t.name AS topic_name
         FROM "Question" q JOIN "Topic" t ON t.id = q."topicId"
        WHERE t."courseId" = $1 AND q.type = 'CLOZE'
        ORDER BY t.name, q.id`,
      [kurs.id]
    );

    const veckor = new Map();
    for (const q of fragor.rows) {
      const v = veckonummer(q.topic_name);
      if (v === null) continue;
      if (!veckor.has(v)) veckor.set(v, { vecka: v, namn: q.topic_name, ord: [] });
      veckor.get(v).ord.push({ id: q.id, config: q.config });
    }
    const veckoordning = [...veckor.values()].sort((a, b) => a.vecka - b.vecka);

    const enkater = await pool.query(
      `SELECT s.id, s.title,
              (SELECT COUNT(*) FROM "Response" r JOIN "Student" st ON st.id = r."studentId"
                WHERE r."surveyId" = s.id AND st."isTest" = false) AS svar
         FROM "Survey" s
        WHERE s."courseId" = $1 AND s.mode = 'QUIZ' AND s.title LIKE 'Veckotest%'
        ORDER BY s.title`,
      [kurs.id]
    );

    for (const s of enkater.rows) {
      const v = veckonummer(s.title);
      const vecka = v === null ? null : veckor.get(v);
      if (!vecka) {
        console.log(`  [${s.id}] ${s.title} - hittar inget ämne för veckan, hoppar`);
        hoppade++;
        continue;
      }
      if (Number(s.svar) > 0) {
        console.log(
          `  [${s.id}] ${s.title} - ${s.svar} riktiga elevsvar finns redan, hoppar`
        );
        hoppade++;
        continue;
      }

      const slump = seedadSlump(s.id);
      const nyaIdx = spriddaIndex(vecka.ord.length, NYA);
      const nya = nyaIdx.map((i) => vecka.ord[i]);
      const tidigare = veckoordning.filter((x) => x.vecka < vecka.vecka);
      const rep = valjRepetition(tidigare, REP, slump);

      const totalt = nya.length + rep.length;
      const platser = repetitionsplatser(totalt, rep.length);
      const slutlig = new Array(totalt).fill(null);
      platser.forEach((p, i) => (slutlig[p] = { ...rep[i], repetition: true }));
      let k = 0;
      for (let i = 0; i < totalt; i++) {
        if (slutlig[i] === null) slutlig[i] = { ...nya[k++], repetition: false };
      }

      const nuvarande = await pool.query(
        `SELECT "questionId", "order" FROM "SurveyQuestion"
          WHERE "surveyId" = $1 ORDER BY "order"`,
        [s.id]
      );
      const foreIds = new Set(nuvarande.rows.map((r) => r.questionId));
      const efterIds = slutlig.map((q) => q.id);
      const tillagda = efterIds.filter((id) => !foreIds.has(id));
      const bortplockade = nuvarande.rows
        .map((r) => r.questionId)
        .filter((id) => !efterIds.includes(id));

      const repText = rep
        .map((q) => `${ordet(q)} (v${String(q.vecka).padStart(2, "0")})`)
        .join(", ");
      console.log(
        `  [${s.id}] ${s.title}: ${nuvarande.rows.length} -> ${totalt} frågor  (${nya.length} nya + ${rep.length} rep)`
      );
      console.log(`      repetition: ${repText || "-"}`);
      if (tillagda.length || bortplockade.length) {
        console.log(
          `      +${tillagda.length} fråga(or), -${bortplockade.length} fråga(or)`
        );
      } else {
        console.log(`      oförändrad uppsättning, bara ordningen sätts om`);
      }

      if (apply) {
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          if (bortplockade.length > 0) {
            await client.query(
              `DELETE FROM "SurveyQuestion" WHERE "surveyId" = $1 AND "questionId" = ANY($2::int[])`,
              [s.id, bortplockade]
            );
          }
          for (const id of tillagda) {
            await client.query(
              `INSERT INTO "SurveyQuestion" ("surveyId", "questionId", "order") VALUES ($1, $2, $3)`,
              [s.id, id, 0]
            );
          }
          for (let i = 0; i < efterIds.length; i++) {
            await client.query(
              `UPDATE "SurveyQuestion" SET "order" = $1 WHERE "surveyId" = $2 AND "questionId" = $3`,
              [i, s.id, efterIds[i]]
            );
          }
          await client.query("COMMIT");
        } catch (e) {
          await client.query("ROLLBACK");
          throw e;
        } finally {
          client.release();
        }
        angerlogg.push({
          surveyId: s.id,
          titel: s.title,
          fore: nuvarande.rows.map((r) => ({
            questionId: r.questionId,
            order: r.order,
          })),
          efter: efterIds.map((id, i) => ({ questionId: id, order: i })),
        });
      }
      lagda++;
    }
  }

  console.log(
    `\n${apply ? "== SKARP KÖRNING ==" : "== TORRKÖRNING (inget skrivs) =="}`
  );
  console.log(`Sammansättning: ${NYA} nya + ${REP} repetition. Kurser: ${courseIds.join(", ")}`);
  console.log(`Enkäter omlagda: ${lagda}. Överhoppade: ${hoppade}.`);

  if (apply && angerlogg.length > 0) {
    const path = resolve(moduleDir, `../veckotest-sammansattning-${Date.now()}.json`);
    writeFileSync(path, JSON.stringify({ angerlogg }, null, 2));
    console.log(`\nÅngerlogg (hela uppsättningen före och efter): ${path}`);
  }
} finally {
  await pool.end();
}
