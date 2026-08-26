/**
 * En behärskningsmodell för hela elevvyn.
 *
 * Appen bar länge två modeller som inte visste om varandra. Dashboardens
 * progressbarer och quizvyns filter räknade en fråga som klarad efter två
 * rätt i rad (mastery.ts) - en streakmodell som i praktiken aldrig slog till,
 * eftersom de flesta quiz görs en gång. Övningen räknade samtidigt behärskning
 * som FSRS gör det: schemalagt intervall minst en vecka. Samma elev kunde se
 * 0 % på startsidan och "sitter bra" i övningen samma dag.
 *
 * Här är den enda modellen. FSRS avgör när det finns ett minneskort, och det
 * finns det för varje fråga eleven mött i övningspoolen.
 *
 * Fallbacken bär resten. Luckfrågor och fritext når aldrig övningen (poolen är
 * flervalsfrågor), så de får aldrig ett FSRS-tillstånd - för dem gäller
 * elevens senaste svar. Utan den regeln skulle ett veckotest med luckfrågor
 * visa 0 av 15 klarade i evighet, hur bra eleven än stavade.
 */
import type { QuestionPracticeState } from "@/lib/relearning";

export interface AnswerRecord {
  questionId: number;
  isCorrect: boolean | null;
  createdAt: Date;
}

/**
 * Senaste svaret per fråga, som rätt/fel. Osäkert svar (null) räknas som fel
 * hela vägen genom appen och gör det även här.
 */
export function latestAnswers(records: AnswerRecord[]): Map<number, boolean> {
  const latest = new Map<number, { at: number; isCorrect: boolean }>();
  for (const r of records) {
    const at = r.createdAt.getTime();
    const prev = latest.get(r.questionId);
    if (!prev || at >= prev.at) {
      latest.set(r.questionId, { at, isCorrect: r.isCorrect === true });
    }
  }
  return new Map(Array.from(latest, ([id, v]) => [id, v.isCorrect]));
}

export function isQuestionMastered(
  questionId: number,
  states: Map<number, QuestionPracticeState>,
  latest: Map<number, boolean>
): boolean {
  const state = states.get(questionId);
  if (state) return state.mastered;
  return latest.get(questionId) === true;
}

/**
 * Delar upp en frågeuppsättning i klarat och kvar. Samma uppdelning driver
 * både progressbaren på startsidan och vilka frågor quizvyn ställer om, så
 * att siffran eleven läser stämmer med vad hen sedan får.
 */
export function calculateMastery(
  questionIds: number[],
  states: Map<number, QuestionPracticeState>,
  latest: Map<number, boolean>
): { masteredIds: number[]; remainingIds: number[] } {
  const masteredIds: number[] = [];
  const remainingIds: number[] = [];
  for (const id of questionIds) {
    if (isQuestionMastered(id, states, latest)) masteredIds.push(id);
    else remainingIds.push(id);
  }
  return { masteredIds, remainingIds };
}
