/**
 * Enter-tangenten i ett frågeformulär.
 *
 * Bakgrunden: frågorna visas en i taget, och en luckfråga är ett ensamt
 * textfält. HTML:s implicita inlämning gäller då - ett formulär med exakt ett
 * textfält skickas när användaren trycker Enter, även utan submit-knapp. I ett
 * stavningstest är Enter precis vad man trycker när ordet är skrivet, så
 * inlämningen kom mitt i testet: en Response-rad per ord, utkastet raderat och
 * resultatsidan i ansiktet på eleven. Engelska 5 SA körde Veckotest 01 den
 * 2026-08-28 och 24 elever fick 196 inlämningar i stället för 24.
 *
 * Enter går därför vidare till nästa fråga i stället, och lämnar in först när
 * det inte finns någon nästa fråga att gå till.
 */
export type EnterAction = "ignore" | "next" | "submit";

export function enterKeyAction(event: {
  key: string;
  /** Elementet tangenttrycket kom ifrån (versaler, som DOM:ens tagName) */
  tagName: string;
  isLastQuestion: boolean;
  /** IME-komposition pågår - tangenttrycket tillhör inmatningsmetoden */
  isComposing?: boolean;
}): EnterAction {
  if (event.key !== "Enter") return "ignore";
  if (event.isComposing) return "ignore";
  // Radbrytning i ett fritextsvar, och knappar sköter sig själva.
  if (event.tagName === "TEXTAREA" || event.tagName === "BUTTON") return "ignore";
  return event.isLastQuestion ? "submit" : "next";
}
