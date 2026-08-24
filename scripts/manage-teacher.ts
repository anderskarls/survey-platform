import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import bcrypt from "bcryptjs";

/**
 * Lärarkonton: skapa, tilldela kurser, dra tillbaka, lista.
 *
 * Ett lärarkonto ser bara de kurser det tilldelats - inga andra kurser,
 * inga andra elever, inga andra frågor. Ägarkontot (se seed-admin.ts) ser
 * allt och är det enda som kan dela ut behörigheter.
 *
 *   npx tsx scripts/manage-teacher.ts list
 *   npx tsx scripts/manage-teacher.ts create <e-post> <lösenord> "<namn>" [kursId ...]
 *   npx tsx scripts/manage-teacher.ts grant  <e-post> <kursId> [kursId ...]
 *   npx tsx scripts/manage-teacher.ts revoke <e-post> <kursId> [kursId ...]
 *   npx tsx scripts/manage-teacher.ts password <e-post> <nytt lösenord>
 *   npx tsx scripts/manage-teacher.ts delete <e-post>
 */

// DATABASE_URL kan ligga i roten eller - som på Windows-maskinen - bara i
// mcp-server/.env. Läs båda, rotens först om den finns.
config();
config({ path: "mcp-server/.env" });

// Neons WebSocket-drivrutin går över port 443 och fungerar därför även bakom
// nätverk som blockerar direkta Postgres-anslutningar (TCP 5432). Samma väg
// in som mcp-server och verifieringsskripten tar.
neonConfig.webSocketConstructor = ws;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error(
    "DATABASE_URL saknas. Lägg den i .env i roten eller i mcp-server/.env."
  );
}

const prisma = new PrismaClient({
  adapter: new PrismaNeon({ connectionString }),
});

const ANVANDNING = `Användning:
  list                                            visa alla konton och deras kurser
  create <e-post> <lösenord> "<namn>" [kursId...] skapa lärarkonto
  grant  <e-post> <kursId> [kursId...]            ge åtkomst till kurser
  revoke <e-post> <kursId> [kursId...]            dra tillbaka åtkomst
  password <e-post> <nytt lösenord>               byt lösenord
  delete <e-post>                                 ta bort kontot

Kurs-ID hittas med: npx tsx scripts/manage-teacher.ts list`;

async function hamtaKonto(email: string) {
  const admin = await prisma.admin.findUnique({
    where: { email },
    include: { courses: { include: { course: true } } },
  });
  if (!admin) throw new Error(`Inget konto med e-posten ${email}`);
  return admin;
}

/** Avvisar kurs-ID som inte finns, hellre än att tyst skapa en tom koppling. */
async function validaKurser(ids: number[]): Promise<number[]> {
  if (ids.length === 0) return [];
  const found = await prisma.course.findMany({
    where: { id: { in: ids } },
    select: { id: true },
  });
  const funna = new Set(found.map((c) => c.id));
  const saknade = ids.filter((id) => !funna.has(id));
  if (saknade.length > 0) {
    throw new Error(`Dessa kurs-ID finns inte: ${saknade.join(", ")}`);
  }
  return ids;
}

function parseKursIds(args: string[]): number[] {
  return args.map((a) => {
    const n = Number(a);
    if (!Number.isInteger(n) || n <= 0) throw new Error(`Ogiltigt kurs-ID: ${a}`);
    return n;
  });
}

async function list() {
  const courses = await prisma.course.findMany({
    orderBy: { id: "asc" },
    select: { id: true, name: true, code: true },
  });
  console.log("Kurser:");
  for (const c of courses) {
    console.log(`  ${String(c.id).padStart(3)}  ${c.name}  (${c.code})`);
  }

  const admins = await prisma.admin.findMany({
    orderBy: { id: "asc" },
    include: { courses: { include: { course: true } } },
  });
  console.log("\nKonton:");
  for (const a of admins) {
    const kurser =
      a.role === "OWNER"
        ? "alla kurser"
        : a.courses.length === 0
          ? "inga kurser"
          : a.courses.map((c) => `${c.course.name} (${c.courseId})`).join(", ");
    console.log(`  ${a.email}  [${a.role}]  ${a.name}`);
    console.log(`      ${kurser}`);
  }
}

async function create(args: string[]) {
  const [email, password, name, ...rest] = args;
  if (!email || !password || !name) throw new Error(ANVANDNING);
  const kursIds = await validaKurser(parseKursIds(rest));

  const befintlig = await prisma.admin.findUnique({ where: { email } });
  if (befintlig) {
    throw new Error(
      `${email} finns redan. Använd grant/password i stället, eller delete först.`
    );
  }

  const admin = await prisma.admin.create({
    data: {
      email,
      name,
      passwordHash: await bcrypt.hash(password, 12),
      role: "TEACHER",
      courses: { create: kursIds.map((courseId) => ({ courseId })) },
    },
    include: { courses: { include: { course: true } } },
  });

  console.log(`Lärarkonto skapat: ${admin.email} (${admin.name})`);
  console.log(`  Lösenord: ${password}`);
  skrivKurser(admin.courses);
}

async function grant(args: string[]) {
  const [email, ...rest] = args;
  if (!email || rest.length === 0) throw new Error(ANVANDNING);
  const admin = await hamtaKonto(email);
  if (admin.role === "OWNER") {
    console.log(`${email} är ägarkonto och når redan alla kurser. Inget gjort.`);
    return;
  }
  const kursIds = await validaKurser(parseKursIds(rest));

  // createMany + skipDuplicates gör kommandot idempotent - att köra det två
  // gånger ska inte vara ett fel.
  await prisma.adminCourse.createMany({
    data: kursIds.map((courseId) => ({ adminId: admin.id, courseId })),
    skipDuplicates: true,
  });

  const uppdaterad = await hamtaKonto(email);
  console.log(`Behörighet uppdaterad för ${email}:`);
  skrivKurser(uppdaterad.courses);
}

async function revoke(args: string[]) {
  const [email, ...rest] = args;
  if (!email || rest.length === 0) throw new Error(ANVANDNING);
  const admin = await hamtaKonto(email);
  const kursIds = parseKursIds(rest);

  const { count } = await prisma.adminCourse.deleteMany({
    where: { adminId: admin.id, courseId: { in: kursIds } },
  });

  const uppdaterad = await hamtaKonto(email);
  console.log(`${count} koppling(ar) borttagna för ${email}:`);
  skrivKurser(uppdaterad.courses);
}

async function password(args: string[]) {
  const [email, nytt] = args;
  if (!email || !nytt) throw new Error(ANVANDNING);
  await hamtaKonto(email);
  await prisma.admin.update({
    where: { email },
    data: { passwordHash: await bcrypt.hash(nytt, 12) },
  });
  console.log(`Lösenord bytt för ${email}: ${nytt}`);
}

async function remove(args: string[]) {
  const [email] = args;
  if (!email) throw new Error(ANVANDNING);
  const admin = await hamtaKonto(email);
  if (admin.role === "OWNER") {
    const antalAgare = await prisma.admin.count({ where: { role: "OWNER" } });
    if (antalAgare <= 1) {
      throw new Error(
        "Det här är det sista ägarkontot. Skapa ett nytt med seed-admin innan du tar bort det."
      );
    }
  }
  await prisma.admin.delete({ where: { email } });
  console.log(`Kontot ${email} borttaget.`);
}

function skrivKurser(courses: { courseId: number; course: { name: string } }[]) {
  if (courses.length === 0) {
    console.log("  Kurser: inga");
    return;
  }
  console.log("  Kurser:");
  for (const c of courses) console.log(`    ${c.courseId}  ${c.course.name}`);
}

async function main() {
  const [kommando, ...args] = process.argv.slice(2);
  switch (kommando) {
    case "list":
      return list();
    case "create":
      return create(args);
    case "grant":
      return grant(args);
    case "revoke":
      return revoke(args);
    case "password":
      return password(args);
    case "delete":
      return remove(args);
    default:
      console.log(ANVANDNING);
      process.exitCode = 1;
  }
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
