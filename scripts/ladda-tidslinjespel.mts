/**
 * Laddar upp en tidslinjekorpus till tidslinjespelet och kopplar den till kurser.
 *
 * Korpusen kommer från tidslinjerepots `spel.py`, som skriver
 * `<kurs>-spel.json` ur samma CSV-filer som tidslinjen ritas ur. Den
 * valideras här med appens eget schema (src/lib/tidslinjespel.ts), så en
 * korpus som skulle krascha en omgång kommer aldrig in i databasen.
 *
 * Skriptet RADERAR INGENTING. Spelet uppdateras på sitt slug (korpusen byts,
 * omgångarna står kvar med sin egen kopia av facit) och kurskopplingar läggs
 * till. En koppling som ska bort tas bort för hand.
 *
 * Utan --skriv är det en torrkörning: den visar vad som skulle hända.
 *
 * Körs med:
 *   npx tsx scripts/ladda-tidslinjespel.mts <fil.json> --kurser 46,47,52 [--titel "Historia 1b"] [--skriv]
 */
import { config as laddaEnv } from "dotenv";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { readFileSync } from "fs";
import { z } from "zod";
import { nyckel, tidslinjespelDataSchema } from "../src/lib/tidslinjespel";

laddaEnv({ path: "mcp-server/.env" });
neonConfig.webSocketConstructor = ws;
const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const filSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/, "slug: små bokstäver, siffror och bindestreck"),
  titel: z.string().min(1).max(120),
  epoker: z.unknown(),
  handelser: z.unknown(),
});

function argument(namn: string): string | undefined {
  const i = process.argv.indexOf(namn);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const fil = process.argv[2];
  if (!fil || fil.startsWith("--")) {
    throw new Error("Ange korpusfilen: npx tsx scripts/ladda-tidslinjespel.mts <fil.json> --kurser 46,47");
  }
  const skriv = process.argv.includes("--skriv");
  const kurser = (argument("--kurser") ?? "")
    .split(",")
    .filter(Boolean)
    .map((k) => {
      const n = Number(k);
      if (!Number.isInteger(n)) throw new Error(`Ogiltigt kurs-id: ${k}`);
      return n;
    });

  // --- 1. Läs och validera korpusen med appens schema ---
  const rå = filSchema.parse(JSON.parse(readFileSync(fil, "utf8").replace(/^﻿/, "")));
  const parsed = tidslinjespelDataSchema.safeParse({ epoker: rå.epoker, handelser: rå.handelser });
  if (!parsed.success) {
    throw new Error("Korpusen är ogiltig:\n  " + parsed.error.issues.map((i) => i.message).join("\n  "));
  }
  const data = parsed.data;
  const titel = argument("--titel") ?? rå.titel;
  console.log(
    `Korpus "${rå.slug}": ${data.handelser.length} händelser, ${data.epoker.length} epoker (${data.epoker
      .map((e) => e.namn)
      .join(", ")}).`
  );

  // --- 2. Jämför med det som ligger i databasen ---
  const finns = await prisma.timelineGame.findUnique({
    where: { slug: rå.slug },
    include: { courses: true, _count: { select: { rounds: true } } },
  });
  if (finns) {
    const gammal = tidslinjespelDataSchema.safeParse(finns.data);
    const fore = new Set(gammal.success ? gammal.data.handelser.map(nyckel) : []);
    const efter = new Set(data.handelser.map(nyckel));
    const nya = [...efter].filter((k) => !fore.has(k));
    const borta = [...fore].filter((k) => !efter.has(k));
    console.log(
      `Spelet finns (id ${finns.id}, ${finns._count.rounds} omgångar). ` +
        `${nya.length} nya händelser, ${borta.length} borttagna.`
    );
    for (const k of nya) console.log(`  + ${k}`);
    for (const k of borta) console.log(`  - ${k}`);
    if (titel !== finns.title) console.log(`  Titel: "${finns.title}" -> "${titel}"`);
  } else {
    console.log(`Spelet finns inte - skapas med titeln "${titel}".`);
  }

  // --- 3. Kurserna ---
  const kurserIDb = await prisma.course.findMany({
    where: { id: { in: kurser } },
    select: { id: true, name: true },
  });
  for (const k of kurser) {
    const kurs = kurserIDb.find((c) => c.id === k);
    if (!kurs) throw new Error(`Kurs ${k} finns inte.`);
    const kopplad = finns?.courses.some((c) => c.courseId === k);
    console.log(`  Kurs ${k} (${kurs.name}): ${kopplad ? "redan kopplad" : "kopplas"}`);
  }
  for (const c of finns?.courses ?? []) {
    if (!kurser.includes(c.courseId)) console.log(`  Kurs ${c.courseId}: kopplad sedan tidigare, rörs inte`);
  }

  if (!skriv) {
    console.log("\nTorrkörning - inget skrevs. Kör igen med --skriv.");
    await prisma.$disconnect();
    return;
  }

  // --- 4. Skriv ---
  const spel = await prisma.timelineGame.upsert({
    where: { slug: rå.slug },
    create: { slug: rå.slug, title: titel, data },
    update: { title: titel, data },
  });
  for (const courseId of kurser) {
    await prisma.timelineGameCourse.upsert({
      where: { gameId_courseId: { gameId: spel.id, courseId } },
      create: { gameId: spel.id, courseId },
      update: {},
    });
  }
  console.log(`\nKlart: spel ${spel.id} "${spel.title}", nås på /spel/tidslinje/${spel.slug}.`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e instanceof Error ? e.message : e);
  await prisma.$disconnect();
  process.exit(1);
});
