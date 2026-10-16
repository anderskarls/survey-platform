/**
 * Bekräftelse innan en uppgift lämnas in med obesvarade frågor.
 *
 * Bakgrunden: frågorna visas en i taget, och på sista frågan byts Nästa ut
 * mot Skicka svar på exakt samma plats. Den som klickar sig snabbt genom
 * bladet för att se vad som kommer lämnar alltså in med sista klicket. Ingen
 * frågade om det var meningen, och utkastet raderas vid inlämning. Hi 1b
 * MSA26A, elevbladet till lektion 5 (tabellfrågor), 2026-10-09: tre elever
 * lämnade in med 2-3 av 8 frågor besvarade på 20 minuter, en av dem två
 * gånger på fyra minuter. Varje gång fick läraren be om att få uppgiften
 * upplåst för hand.
 *
 * Nu stannar inlämningen och frågar när något är obesvarat. Knappen som tar
 * eleven tillbaka står där Skicka svar stod, så ett klick till av farten
 * landar på den och inte på inlämningen.
 */
import { isBlank } from "@/lib/blank-answer";

/** Positionerna (0-baserade, i visningsordning) för frågor utan svar. */
export function obesvaradePositioner(
  questionIds: number[],
  answers: Record<number, string>
): number[] {
  return questionIds.flatMap((id, i) => (isBlank(answers[id] ?? "") ? [i] : []));
}

/**
 * Vad ett inlämningsförsök ska leda till. `bekraftar` är sant när rutan redan
 * visas - då lämnar bara rutans egen knapp in, inte en Enter eller ett
 * formulär-submit som råkar komma in under tiden. Har eleven svarat på det
 * sista medan rutan stod framme finns inget kvar att fråga om.
 */
export function inlamningsbeslut(antalObesvarade: number, bekraftar: boolean): "skicka" | "fraga" | "vanta" {
  if (antalObesvarade === 0) return "skicka";
  return bekraftar ? "vanta" : "fraga";
}
