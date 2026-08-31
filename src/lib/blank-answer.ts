/**
 * Tomt svar i ett prov är ett fel, inte ett icke-svar.
 *
 * Formuläret filtrerade länge bort obesvarade frågor före inlämning, och
 * poängen räknades på antalet avgivna svar. En hoppad fråga blev därmed
 * osynlig: varken fel eller med i nämnaren. Effekten gick åt ett håll - att
 * hoppa över det man inte kunde HÖJDE procenten. I Veckotest 01 (Engelska 5)
 * lämnade 12 av 23 elever luckor, och en elev som svarade på 2 av 15 frågor
 * fick 100 %.
 *
 * Nu skickas varje visad fråga in, och servern rättar det tomma som fel. Två
 * undantag, båda avsiktliga:
 *
 *   - **Enkäter.** Ett obesvarat fält i en enkät är ett avstående, inte ett
 *     fel. Regeln gäller bara QUIZ-läge.
 *   - **Självskattade kort.** Ett kort som eleven aldrig hann vända säger
 *     ingenting om vad hen kan, och skulle dessutom mata FSRS med "kunde
 *     inte" för ett kort som aldrig visades.
 *
 * Kvar blir det som rättas objektivt mot ett facit: flervalsfrågan i vanlig
 * form och luckfrågan. Fritext, reflektion och sortering rättas inte alls -
 * för dem skulle en tom rad bara vara brus i lärarens sammanställning.
 */
import { rendersAsCard } from "@/lib/flashcard";

/** Frågetyper som rättas mot ett facit och därför kan vara obesvarade-fel. */
const GRADED_TYPES = ["MULTIPLE_CHOICE", "CLOZE"] as const;

/** Tomt eller bara blanksteg - eleven har inte svarat. */
export function isBlank(value: string): boolean {
  return value.trim().length === 0;
}

/**
 * Vad formuläret skickar in: varje visad fråga, i visningsordning, med tom
 * sträng där eleven inte svarat. Servern avgör sedan vad som blir en rad.
 *
 * Ligger här och inte i komponenterna för att båda formulären (inloggad vy
 * och delad länk) ska bygga samma paket - det var när de gjorde var sitt som
 * det obesvarade försvann.
 */
export function submissionAnswers(
  questionIds: number[],
  answers: Record<number, string>
): { questionId: number; value: string }[] {
  return questionIds.map((questionId) => ({
    questionId,
    value: answers[questionId] ?? "",
  }));
}

/** Hur det obesvarade skrivs ut i lärarens vyer. */
export const BLANK_LABEL = "(inget svar)";

/**
 * Etikett för ett sparat svar i en sammanställning. Tomma rader är riktiga
 * svar i datan nu, och utan den här skulle de synas som en namnlös stapel
 * eller en rad som slutar med kolon.
 */
export function answerLabel(value: string): string {
  return isBlank(value) ? BLANK_LABEL : value;
}

/**
 * Ska ett tomt svar på den här frågan sparas som fel?
 *
 * Falskt betyder inte "spara som rätt" utan "spara inte alls" - det tomma
 * svaret kastas som förut och frågan står utanför både täljare och nämnare.
 */
export function blankCountsAsWrong(params: {
  type: string;
  isQuiz: boolean;
  flashcardMode: boolean;
}): boolean {
  const { type, isQuiz, flashcardMode } = params;
  if (!isQuiz) return false;
  if (rendersAsCard(type, flashcardMode)) return false;
  return (GRADED_TYPES as readonly string[]).includes(type);
}
