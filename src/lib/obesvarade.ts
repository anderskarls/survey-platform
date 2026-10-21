/**
 * Bekräftelse innan en uppgift lämnas in.
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
 * Nu stannar varje inlämning och frågar - med obesvarade frågor säger rutan
 * hur många (2026-10-21: läraren ville ha rutan varje gång, inte bara då).
 * Knappen som tar eleven tillbaka står där Skicka svar stod, så ett klick
 * till av farten landar på den och inte på inlämningen. Medan rutan visas
 * lämnar bara dess egen knapp in, inte en Enter eller ett formulär-submit.
 */
import { isBlank } from "@/lib/blank-answer";

/** Positionerna (0-baserade, i visningsordning) för frågor utan svar. */
export function obesvaradePositioner(
  questionIds: number[],
  answers: Record<number, string>
): number[] {
  return questionIds.flatMap((id, i) => (isBlank(answers[id] ?? "") ? [i] : []));
}
