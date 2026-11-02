/**
 * Läser momentets kunskapsgraf (markdown i vaultet) och plockar ut en frågas
 * del av den som text till Question.hintBasis.graf. Delas av provkörningen
 * och importen.
 *
 * Förutsätter grafens form (kunskapsgraf-lektion-3.md):
 *   ## Påståenden   rader "- **Me6** sats *(belägg)*"
 *   ## Kedjor       rader "- **R2** G2 + Me6 → **Me7** (kommentar)"
 *   ## Frågorna     "### Station N - ...: Vilken frihet hade/saknade ..."
 *                   med punkterna Svar, Kedjor och Felspår
 * Premisser som inte är id (fri text) följer med som de står.
 */
import { avsnitt } from "./ledtrad-facit-md";

interface Kedja {
  id: string;
  premisser: string[];
  slutsats: string;
}

export interface Graf {
  pastaenden: Map<string, string>;
  kedjor: Map<string, Kedja>;
  /** Frågeavsnitten, nyckel = rubriken utan "### ". */
  fragor: Map<string, string>;
}

const ID = /[A-ZÅÄÖ][a-zåäö]*\d+/g;

function rader(md: string | null): string[] {
  return (md ?? "").split(/\r?\n/);
}

export function lasGraf(md: string): Graf {
  const pastaenden = new Map<string, string>();
  for (const r of rader(avsnitt(md, /^## Påståenden/))) {
    const m = r.match(/^- \*\*([^*]+)\*\*\s+(.+)$/);
    if (m) pastaenden.set(m[1], m[2].replace(/\*/g, "").trim());
  }
  const kedjor = new Map<string, Kedja>();
  for (const r of rader(avsnitt(md, /^## Kedjor/))) {
    const m = r.match(/^- \*\*([^*]+)\*\*\s+(.+?)\s*→\s*\*\*([^*]+)\*\*/);
    if (m) kedjor.set(m[1], { id: m[1], premisser: m[2].split(/\s+\+\s+/).map((p) => p.trim()), slutsats: m[3] });
  }
  const fragor = new Map<string, string>();
  const del = avsnitt(md, /^## Frågorna/) ?? "";
  for (const bit of del.split(/\n(?=### )/).slice(1)) {
    const [rubrik, ...rest] = bit.split(/\r?\n/);
    fragor.set(rubrik.replace(/^###\s+/, "").trim(), rest.join("\n").trim());
  }
  return { pastaenden, kedjor, fragor };
}

function punkt(avs: string, namn: string): string {
  return avs.match(new RegExp(`^- \\*\\*${namn}:\\*\\*\\s*(.+)$`, "m"))?.[1].trim() ?? "";
}

/**
 * Frågans del av grafen som text, eller null om frågan saknar avsnitt.
 * Matchar på stationsnumret och hade/saknade, som facitläsaren.
 */
export function grafFor(fraga: string, graf: Graf): string | null {
  const station = fraga.match(/Station (\d)/)?.[1];
  if (!station) return null;
  const saknade = /saknade/i.test(fraga);
  const rubrik = [...graf.fragor.keys()].find(
    (k) => new RegExp(`^Station ${station}\\b`).test(k) && /saknade/i.test(k) === saknade
  );
  if (!rubrik) return null;
  const avs = graf.fragor.get(rubrik)!;

  const svar = punkt(avs, "Svar").match(ID) ?? [];
  const kedjeIds = (punkt(avs, "Kedjor").match(ID) ?? []).filter((id) => graf.kedjor.has(id));
  const felspar = punkt(avs, "Felspår").replace(/\*/g, "");

  // Alla påståenden som frågan rör: svaren, kedjornas led och det felspåret pekar på.
  const ids = new Set<string>(svar);
  for (const k of kedjeIds.map((id) => graf.kedjor.get(id)!)) {
    for (const p of [...k.premisser, k.slutsats]) if (graf.pastaenden.has(p)) ids.add(p);
  }
  for (const id of felspar.match(ID) ?? []) if (graf.pastaenden.has(id)) ids.add(id);
  const okanda = [...ids].filter((id) => !graf.pastaenden.has(id));
  if (okanda.length) throw new Error(`Okända påståenden i "${rubrik}": ${okanda.join(", ")}`);

  const svarSet = new Set(svar);
  const delar = [
    "Påståenden ([svar] = godtagbart svar på frågan):",
    ...[...ids].map((id) => `- ${id}${svarSet.has(id) ? " [svar]" : ""}: ${graf.pastaenden.get(id)}`),
    kedjeIds.length
      ? ["", "Kedjor (premisserna tillsammans ger slutsatsen):", ...kedjeIds.map((id) => {
          const k = graf.kedjor.get(id)!;
          return `- ${id}: ${k.premisser.join(" + ")} -> ${k.slutsats}`;
        })].join("\n")
      : "",
    felspar ? `\nVanligaste felspåret: ${felspar}` : "",
  ];
  return delar.filter(Boolean).join("\n");
}
