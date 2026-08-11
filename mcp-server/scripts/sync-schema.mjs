#!/usr/bin/env node
// Kopierar delade filer från huvudprojektet till mcp-server, så att MCP-serverns
// Prisma-klient alltid matchar huvudappens DB-struktur och aggregatlogiken inte
// hinner glida isär mellan de två vägarna läraren läser resultat genom.
// Körs automatiskt via `prebuild` och `predev*`-skripten.

import { copyFileSync, readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const FILER = [
  ["../../prisma/schema.prisma", "../prisma/schema.prisma"],
  ["../../src/lib/svarsurval.ts", "../src/svarsurval.ts"],
  ["../../src/lib/svarsvarden.ts", "../src/svarsvarden.ts"],
];

let kopierade = 0;

for (const [relKalla, relMal] of FILER) {
  const source = resolve(__dirname, relKalla);
  const target = resolve(__dirname, relMal);

  if (!existsSync(source)) {
    console.error(`[sync-schema] Källfil saknas: ${source}`);
    process.exit(1);
  }

  const sourceContent = readFileSync(source, "utf8");
  const targetContent = existsSync(target) ? readFileSync(target, "utf8") : "";

  if (sourceContent === targetContent) continue;

  copyFileSync(source, target);
  console.log(`[sync-schema] Kopierade ${source} → ${target}`);
  kopierade++;
}

if (kopierade === 0) {
  console.log("[sync-schema] Allt är redan synkat.");
}
