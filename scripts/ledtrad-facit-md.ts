/**
 * Läser ledtrådsunderlag ur lektionens facit och källmaterial (markdown i
 * vaultet). Delas av provkörningen och importen till Question.hintBasis.
 *
 * Förutsätter frihetsprotokollens form: frågetexten börjar "Station N - ...",
 * facit har "## Station N" med "### ... HADE" och "### ... SAKNADE", och
 * källmaterialet har "## Station N". Facits kalibreringsavsnitt (E/C/A)
 * följer aldrig med.
 */
import type { LedtradUnderlag } from "../src/lib/ledtrad";

/** Avsnittet som börjar med rubriken och slutar vid nästa rubrik på samma eller högre nivå. */
export function avsnitt(md: string, rubrik: RegExp): string | null {
  const rader = md.split(/\r?\n/);
  const start = rader.findIndex((r) => rubrik.test(r));
  if (start < 0) return null;
  const niva = rader[start].match(/^#+/)![0].length;
  let slut = rader.length;
  for (let i = start + 1; i < rader.length; i++) {
    const m = rader[i].match(/^(#+)\s/);
    if (m && m[1].length <= niva) {
      slut = i;
      break;
    }
  }
  return rader.slice(start, slut).join("\n").trim();
}

export function utanFrontmatter(md: string): string {
  return md.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "");
}

export function underlagFor(fraga: string, facitMd: string, kallaMd: string): Required<LedtradUnderlag> | null {
  const station = fraga.match(/Station (\d)/)?.[1];
  if (!station) return null;
  const allmant = avsnitt(facitMd, /^## Så är facit tänkt/) ?? "";
  const stationFacit = avsnitt(facitMd, new RegExp(`^## Station ${station}\\b`));
  const kalla = avsnitt(kallaMd, new RegExp(`^## Station ${station}\\b`));
  if (!stationFacit || !kalla) return null;
  // "Vilken frihet saknade" -> SAKNADE-delen, annars HADE-delen. "Vem är
  // personen" ligger före båda och följer alltid med.
  const saknade = /saknade/i.test(fraga);
  const del = avsnitt(stationFacit, saknade ? /^### .*SAKNADE/ : /^### .*HADE/);
  const vem = stationFacit.split(/\n### /)[0];
  return { kriterier: allmant, facit: [vem, del ?? stationFacit].join("\n\n"), kalla };
}
