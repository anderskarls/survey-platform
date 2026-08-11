/**
 * "Jag är osäker" är en metakognitiv knapp, inte ett svarsalternativ.
 *
 * Eleven som trycker på den sparar `__UNSURE__` som `Answer.value` med
 * `isCorrect: null`. Aggregaten räknade tidigare sentinelvärdet som vilken
 * option som helst, så läraren fick en stapel som hette `__UNSURE__` och en
 * rätt-andel som blev systematiskt för låg i just de grupper där knappen
 * används mest. Räkna alltid fördelningen genom `raknaSvarsalternativ` så att
 * osäkerheten redovisas bredvid fördelningen i stället för inuti den.
 */
export const OSAKER = "__UNSURE__";

export function arOsaker(value: string): boolean {
  return value === OSAKER;
}

export type Svarsfordelning = {
  /** Antal per faktiskt svarsalternativ. Innehåller aldrig `OSAKER`. */
  optionCounts: Record<string, number>;
  /** Antal elever som markerade "Jag är osäker" i stället för att svara. */
  osakra: number;
  /** Antal avgivna svar - nämnaren för procenten i fördelningen. */
  avgivna: number;
};

/**
 * @param optionTexts frågans svarsalternativ, så att alternativ ingen valde
 *   ändå får en nolla i fördelningen
 * @param values elevernas svarsvärden på frågan
 */
export function raknaSvarsalternativ(
  optionTexts: string[],
  values: string[]
): Svarsfordelning {
  const optionCounts: Record<string, number> = {};
  for (const text of optionTexts) optionCounts[text] = 0;

  let osakra = 0;
  let avgivna = 0;

  for (const value of values) {
    if (arOsaker(value)) {
      osakra++;
      continue;
    }
    optionCounts[value] = (optionCounts[value] || 0) + 1;
    avgivna++;
  }

  return { optionCounts, osakra, avgivna };
}
