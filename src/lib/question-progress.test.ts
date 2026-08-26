import { describe, expect, it } from "vitest";
import {
  calculateMastery,
  isQuestionMastered,
  latestAnswers,
  type AnswerRecord,
} from "./question-progress";
import type { QuestionPracticeState } from "./relearning";

// Regeln som testas: en enda behärskningsmodell för elevvyn. FSRS avgör för
// allt som ligger i övningspoolen; luckfrågor och fritext, som aldrig kommer
// dit, faller tillbaka på elevens senaste svar.

const NOW = new Date("2026-09-10T10:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;

function state(questionId: number, mastered: boolean): QuestionPracticeState {
  return {
    questionId,
    due: NOW,
    dueDay: "2026-09-10",
    isDue: true,
    daysUntilDue: 0,
    stability: mastered ? 12 : 2,
    difficulty: 5,
    retrievability: 0.9,
    scheduledDays: mastered ? 10 : 2,
    lastReview: NOW,
    lapses: 0,
    reps: 3,
    firstSeenDay: "2026-09-01",
    mastered,
  };
}

function answer(
  questionId: number,
  daysAgo: number,
  isCorrect: boolean | null
): AnswerRecord {
  return {
    questionId,
    isCorrect,
    createdAt: new Date(NOW.getTime() - daysAgo * DAY_MS),
  };
}

describe("latestAnswers", () => {
  it("behåller det senaste svaret per fråga", () => {
    const latest = latestAnswers([
      answer(1, 5, false),
      answer(1, 1, true),
      answer(2, 3, true),
    ]);
    expect(latest.get(1)).toBe(true);
    expect(latest.get(2)).toBe(true);
  });

  it("räknar osäkert svar som fel", () => {
    expect(latestAnswers([answer(1, 1, null)]).get(1)).toBe(false);
  });

  it("låter ett senare fel slå ut ett tidigare rätt", () => {
    const latest = latestAnswers([answer(1, 4, true), answer(1, 2, false)]);
    expect(latest.get(1)).toBe(false);
  });
});

describe("behärskning", () => {
  it("låter FSRS avgöra när frågan finns i övningspoolen", () => {
    const states = new Map([[1, state(1, true)]]);
    // Senaste svaret var fel, men kortet har vuxit sig starkt sedan dess -
    // FSRS äger frågan och fallbacken ska inte lägga sig i
    const latest = new Map([[1, false]]);
    expect(isQuestionMastered(1, states, latest)).toBe(true);
  });

  it("räknar en fråga under inlärning som kvar, oavsett senaste svar", () => {
    const states = new Map([[1, state(1, false)]]);
    expect(isQuestionMastered(1, states, new Map([[1, true]]))).toBe(false);
  });

  it("faller tillbaka på senaste svaret för frågor utanför poolen", () => {
    // Luckfrågor och fritext får aldrig ett FSRS-tillstånd
    expect(isQuestionMastered(7, new Map(), new Map([[7, true]]))).toBe(true);
    expect(isQuestionMastered(8, new Map(), new Map([[8, false]]))).toBe(false);
  });

  it("räknar en obesvarad fråga som kvar", () => {
    expect(isQuestionMastered(9, new Map(), new Map())).toBe(false);
  });

  it("delar upp en enkät i klarat och kvar", () => {
    const states = new Map([
      [1, state(1, true)],
      [2, state(2, false)],
    ]);
    const latest = new Map([
      [3, true],
      [4, false],
    ]);
    const { masteredIds, remainingIds } = calculateMastery(
      [1, 2, 3, 4, 5],
      states,
      latest
    );
    expect(masteredIds).toEqual([1, 3]);
    expect(remainingIds).toEqual([2, 4, 5]);
  });

  it("ger ett luckfrågetest en meningsfull siffra i stället för noll", () => {
    // Veckotest med 5 luckfrågor, ingen av dem i övningspoolen: fyra rätt
    // senast ska synas som 4 av 5, inte som 0 av 5
    const latest = new Map([
      [1, true],
      [2, true],
      [3, true],
      [4, true],
      [5, false],
    ]);
    const { masteredIds } = calculateMastery([1, 2, 3, 4, 5], new Map(), latest);
    expect(masteredIds).toHaveLength(4);
  });
});
