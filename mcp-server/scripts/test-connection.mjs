#!/usr/bin/env node
// Verifierar att MCP-serverns Neon-anslutning fungerar via samma prisma.ts
// som verktygen anvander. Kor: node scripts/test-connection.mjs
import { prisma } from "../dist/prisma.js";

try {
  const courses = await prisma.course.findMany({
    select: { id: true, name: true, code: true },
    orderBy: { name: "asc" },
  });
  console.log(`OK - anslutning fungerar. Hittade ${courses.length} kurser:`);
  for (const c of courses) {
    console.log(`  [${c.id}] ${c.name} (${c.code})`);
  }
  process.exit(0);
} catch (err) {
  console.error("MISSLYCKADES - kunde inte ansluta/hamta data:");
  console.error(err.message);
  process.exit(1);
}
