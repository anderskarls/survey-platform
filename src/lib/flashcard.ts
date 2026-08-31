/**
 * Flashcardläge - Anki-modellen för flervalsfrågor.
 *
 * I flashcardläge visas frågans framsida utan alternativ. Eleven försöker
 * minnas svaret, trycker "Visa svar" och skattar sedan sig själv. Skattningen
 * blir svarets värde, så frågebanken behöver inte ändras: samma
 * MULTIPLE_CHOICE-frågor kan visas som alternativlista i en kurs och som kort
 * i en annan, och FSRS-historiken per fråga förblir en enda.
 *
 * Värdena följer samma mönster som "__UNSURE__" i den vanliga renderingen.
 */

import { parseClozeConfig } from "@/lib/cloze";

/**
 * Frågetyper som visas i kortform och därmed hör hemma i övningspoolen.
 *
 * MULTIPLE_CHOICE blir kort bara i kurser med flashcardMode - i övriga kurser
 * är den en vanlig alternativlista. CLOZE_CARD är kort i kraft av sin typ:
 * en mening med lucka som eleven fyller i huvudet. Listan används av
 * relearning-data och week-practice-data för att avgöra vad som är ett kort,
 * och håller samtidigt veckotestets CLOZE utanför övningen.
 */
export const CARD_TYPES = ["MULTIPLE_CHOICE", "CLOZE_CARD"] as const;

/** Kan frågetypen över huvud taget visas som kort? */
export function isCardType(type: string): boolean {
  return (CARD_TYPES as readonly string[]).includes(type);
}

/**
 * Ska den här frågan renderas som kort just nu? Luckmeningskortet alltid;
 * flervalsfrågan bara där kursen kör flashcardläge.
 */
export function rendersAsCard(type: string, flashcardMode: boolean): boolean {
  return type === "CLOZE_CARD" || (flashcardMode && type === "MULTIPLE_CHOICE");
}

export interface FlashcardRating {
  /** Sparas som Answer.value / PracticeAttempt.value */
  value: string;
  /** FSRS-betyg (ts-fsrs Rating) */
  grade: 1 | 2 | 3 | 4;
  label: string;
  hint: string;
}

export const FLASHCARD_RATINGS: readonly FlashcardRating[] = [
  { value: "__FC_AGAIN__", grade: 1, label: "Om igen", hint: "kunde inte" },
  { value: "__FC_HARD__", grade: 2, label: "Svårt", hint: "kom på det till slut" },
  { value: "__FC_GOOD__", grade: 3, label: "Bra", hint: "kunde det" },
  { value: "__FC_EASY__", grade: 4, label: "Lätt", hint: "satt direkt" },
] as const;

/**
 * Skickas när eleven vänder kortet i övningsläget. Övningen sparar försöket
 * först och skickar tillbaka baksidan, precis som fritextövningen gör med
 * exempelsvaren - facit lämnar aldrig servern innan eleven försökt. Betyget
 * sätts sedan i fas 2 (PATCH), så värdet blir kvar som markör för att det
 * här försöket var ett kort.
 */
export const FLASHCARD_REVEAL = "__FC_REVEAL__";

/**
 * Kortets baksida till klienten - eller null när frågan inte är ett kort.
 *
 * Baksidan följer med enkäten från början, av samma skäl som glosekortens
 * facit gör det: kortet ska vändas i webbläsaren utan ett extra anrop, och
 * eleven skattar sig ändå själv. I övningen gäller motsatt regel - där
 * lämnar facit servern först efter att försöket är sparat.
 */
export function cardBack(
  question: {
    type: string;
    config?: unknown;
    options?: { text: string; isCorrect: boolean }[];
  },
  flashcardMode: boolean
): string | null {
  if (question.type === "CLOZE_CARD") {
    return parseClozeConfig(question.config)?.answer ?? null;
  }
  if (!flashcardMode || question.type !== "MULTIPLE_CHOICE") return null;
  return question.options?.find((o) => o.isCorrect)?.text ?? null;
}

const BY_VALUE = new Map(FLASHCARD_RATINGS.map((r) => [r.value, r]));

/** Är värdet en självskattning från ett flashcard? */
export function isFlashcardValue(value: string): boolean {
  return BY_VALUE.has(value);
}

/** FSRS-betyget för en självskattning, annars null. */
export function flashcardGrade(value: string): 1 | 2 | 3 | 4 | null {
  return BY_VALUE.get(value)?.grade ?? null;
}

/**
 * isCorrect för en självskattning.
 *
 * "Om igen" betyder att eleven inte kom på svaret - allt annat är en lyckad
 * återkallning, precis som i FSRS där Hard fortfarande räknas som ett svar
 * eleven kom fram till. Nyansen mellan Svårt, Bra och Lätt går inte förlorad:
 * den bärs av grade-kolumnen, och rådvärdet finns kvar i Answer.value så att
 * läraren kan se fördelningen per ord.
 */
export function flashcardIsCorrect(value: string): boolean | null {
  const rating = BY_VALUE.get(value);
  if (!rating) return null;
  return rating.grade > 1;
}

/** Etikett att visa i lärarvyer i stället för det råa sentinelvärdet. */
export function flashcardLabel(value: string): string | null {
  return BY_VALUE.get(value)?.label ?? null;
}
