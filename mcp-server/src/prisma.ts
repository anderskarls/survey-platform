import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";

// Ladda .env fran mcp-serverns egen mapp oavsett aktuell arbetskatalog.
// Claude Code startar MCP-servern med projektroten som cwd, sa en ren
// `dotenv/config` skulle leta pa fel plats.
const moduleDir = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(moduleDir, "../.env") });

// Neons serverlosa drivrutin anvander WebSocket (port 443) i Node, vilket
// fungerar aven bakom natverk som blockerar direkta Postgres-anslutningar
// (TCP 5432) - precis den begransning som finns i den har miljon.
neonConfig.webSocketConstructor = ws;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error(
    "DATABASE_URL saknas. Skapa mcp-server/.env med DATABASE_URL=<din Neon-anslutningsstrang>."
  );
}

const adapter = new PrismaNeon({ connectionString });
export const prisma = new PrismaClient({ adapter });
