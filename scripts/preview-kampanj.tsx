// Förhandsvisar frontkartan mot påhittade sektorlägen och skriver en HTML-fil.
// Finns för att appen inte kan köras lokalt (ingen DB-anslutning) - kartan är
// ren presentation och kan därför granskas utan Next och utan Postgres.
//
//   npx tsx --tsconfig scripts/tsconfig.preview.json scripts/preview-kampanj.tsx [utfil]

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FrontKarta } from "../src/components/FrontKarta";
import { ARKIV, MONO, SANS, SERIF } from "../src/lib/arkiv";
import type { SectorState } from "../src/lib/kampanj";

// tsx kompilerar JSX med den klassiska transformen, som förutsätter att React
// finns i scope. Appfilerna importerar inte React (Next behöver det inte), så
// den läggs på globalThis i stället för att smutsa ner komponenten.
(globalThis as unknown as { React: unknown }).React = React;

function sektor(
  name: string,
  position: number | null,
  deltaPosition: number | null,
  extra: Partial<SectorState> = {}
): SectorState {
  return {
    key: `s-${name}`,
    name,
    position,
    iSchema: 40,
    forfallna: 12,
    tackning: 0.9,
    dimma: false,
    deltaPosition,
    deltaForfallna: deltaPosition === null ? null : -deltaPosition,
    ...extra,
  };
}

const scenarier: { rubrik: string; sectors: SectorState[] }[] = [
  {
    rubrik: "Fem topicsektorer, blandad rörelse (det vanliga fallet)",
    sectors: [
      sektor("Mellankrigstiden", 72, 8),
      sektor("Nazismens framväxt", 54, -11),
      sektor("Andra världskriget", 63, 0),
      sektor("Förintelsen", 81, 4),
      sektor("Kalla kriget", 38, -15),
    ],
  },
  {
    rubrik: "Åtta sektorer med dimma i mitten och en helt okänd sektor",
    sectors: [
      sektor("Källkritik", 66, 5),
      sektor("Propaganda", 49, -7),
      sektor("Vetenskapliga revolutionen", 58, null, {
        dimma: true,
        tackning: 0.3,
        deltaPosition: null,
      }),
      sektor("Upplysningen", null, null, {
        dimma: true,
        position: null,
        tackning: 0.1,
        iSchema: 2,
        forfallna: 0,
      }),
      sektor("Franska revolutionen", 44, 12),
      sektor("Industrialiseringen", 91, 2),
      sektor("Imperialismen", 27, -4),
      sektor("Nationalismen", 70, 15),
    ],
  },
  {
    rubrik: "Ytterlägen: 0 och 100, samt första dagsrapporten (ingen jämförelse)",
    sectors: [
      sektor("Demokratins genombrott", 100, 6),
      sektor("Rösträttskampen", 0, -9),
      sektor("Parlamentarism", 50, null),
      sektor("Statsskicket", 12, null),
    ],
  },
  {
    rubrik: "Tolv momentsektorer (över sektorgränsen) - trängsel i namnbandet",
    sectors: [
      sektor("Antikens Grekland", 61, 3),
      sektor("Romarriket", 44, -6),
      sektor("Medeltiden", 73, 9),
      sektor("Digerdöden och krisen", 30, -12),
      sektor("Renässansen", 82, 1),
      sektor("Reformationen", 57, 0),
      sektor("Stormaktstiden", 48, -3),
      sektor("Frihetstiden", 66, 7),
      sektor("Gustav III", 39, null, { dimma: true, tackning: 0.4 }),
      sektor("Napoleonkrigen", 71, 5),
      sektor("Wienkongressen", 25, -14),
      sektor("Revolutionsåret 1848", 88, 11),
    ],
  },
  {
    rubrik: "Tomt kartblad (ny kurs utan topics)",
    sectors: [],
  },
];

// Kartbilden ligger i public/ och nås rotrelativt i appen. Förhandsvisningen
// öppnas som en lös fil, så här behövs en absolut file-URL.
const temaBild = pathToFileURL(
  resolve(__dirname, "../public/kampanj/tema/fronten.jpg")
).href;

const html = `<!doctype html>
<html lang="sv">
<head>
<meta charset="utf-8">
<title>Frontkartan - förhandsvisning</title>
<style>
  body { margin: 0; padding: 2rem; background: #d8d2c6; font-family: ${SANS}; }
  .blad { background: ${ARKIV.papper}; border: 2px solid ${ARKIV.regel}; padding: 2rem 2.5rem; margin: 0 auto 2.5rem; max-width: 1180px; }
  .rubrik { font-family: ${MONO}; font-size: .78rem; letter-spacing: 2px; text-transform: uppercase; color: ${ARKIV.black2}; margin-bottom: 1rem; }
  /* Speglar teckenförklaringen i kampanjsidan - bara för att bedöma kartan i sitt sammanhang */
  .nyckel { font-family: ${MONO}; font-size: .78rem; letter-spacing: 1px; text-transform: uppercase; color: ${ARKIV.black2}; margin-top: .9rem; display: flex; flex-wrap: wrap; gap: .4rem 1.6rem; }
  h2 { font-family: ${SERIF}; font-size: 2.4rem; font-weight: 600; margin: 0 0 1.25rem; color: ${ARKIV.black}; }
  em { color: ${ARKIV.bordeaux}; }
</style>
</head>
<body>
<p style="font-family:${MONO};font-size:.78rem;letter-spacing:1px;text-transform:uppercase;color:${ARKIV.black2};max-width:1180px;margin:0 auto 1.5rem">
  Förhandsvisning · avtäckningen spelas vid sidladdning - ladda om för att se den igen
</p>
${scenarier
  .map(
    (s, i) => `<section class="blad">
  <div class="rubrik">${s.rubrik}</div>
  <h2>Läget vid <em>fronten</em></h2>
  ${renderToStaticMarkup(
    <FrontKarta sectors={s.sectors} temaBild={temaBild} instans={`p${i}`} />
  )}
  <div class="nyckel">
    <span style="color:${ARKIV.bordeaux}">▬ frontlinjen</span>
    <span style="color:${ARKIV.oliv}">▨ avtäckt karta = hållen terräng</span>
    <span>┄ läget vid förra rapporten</span>
    <span><span style="color:${ARKIV.oliv}">▲</span> återtagen mark · <span style="color:${ARKIV.bordeaux}">▼</span> förlorad</span>
    <span>▧ krigsdimma</span>
    <span>0-100 = andel kort i schema</span>
  </div>
</section>`
  )
  .join("\n")}
</body>
</html>
`;

const ut = process.argv[2] ?? "kampanj-preview.html";
writeFileSync(ut, html, "utf8");
console.log(`Skrev ${scenarier.length} scenarier till ${ut}`);
