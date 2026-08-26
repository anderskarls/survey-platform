// Read-only: vad ser provkontona i respektive kurs efter kursavgränsningen?
import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";
config({ path: "mcp-server/.env" });
neonConfig.webSocketConstructor = ws;
const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });
(globalThis as unknown as { prisma: PrismaClient }).prisma = prisma;

async function main() {
  const { loadRelearningData } = await import("../src/lib/relearning-data");
  const konton = await prisma.student.findMany({
    where: { isTest: true },
    select: { id: true, courseId: true, course: { select: { name: true } } },
    orderBy: { courseId: "asc" },
  });
  for (const k of konton) {
    const d = await loadRelearningData(k.id);
    const ids = [...d.states.keys()];
    const kurser = new Set(
      [...d.questionInfo.values()].map((i) => i.courseId)
    );
    console.log(
      `kurs ${k.courseId} (${k.course.name}): pool=${ids.length} frågor, nya=${d.newCandidates.length}, kurser i poolen=[${[...kurser].join(",")}], växlaren=${d.accounts.length} kurser`
    );
  }
  await prisma.$disconnect();
}
main();
