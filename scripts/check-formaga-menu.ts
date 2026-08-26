// Read-only: exakt samma villkor som elevlayouten använder, per kurs.
import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";
config({ path: "mcp-server/.env" });
neonConfig.webSocketConstructor = ws;
const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  const kurser = await prisma.course.findMany({
    select: { id: true, name: true },
    orderBy: { id: "asc" },
  });
  for (const k of kurser) {
    const n = await prisma.question.count({
      where: {
        topic: { courseId: k.id },
        OR: [{ subskill: { not: null } }, { type: "SORTING" }],
      },
    });
    console.log(
      `  kurs ${String(k.id).padStart(2)}  ${n > 0 ? "VISAS " : "DÖLJS "} (${n} övningar)  ${k.name}`
    );
  }
  await prisma.$disconnect();
}
main();
