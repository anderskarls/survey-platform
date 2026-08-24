import { describe, expect, it } from "vitest";
import {
  DAILY_NEW_CARD_CAP,
  buildRelearningStates,
  countIntroducedToday,
  selectPracticeSet,
  type AttemptRecord,
  type PracticeCandidate,
} from "./relearning";

// Regeln som testas: nya ord är lärarstyrda och takade. En öppnad vecka får
// mata övningspasset, men repetitionerna går alltid först och dagens tak
// håller över flera pass - annars vore det plugg, inte repetition.

const NOW = new Date("2026-09-10T10:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;

function attempt(
  questionId: number,
  daysAgo: number,
  isCorrect: boolean | null = true
): AttemptRecord {
  return {
    questionId,
    isCorrect,
    createdAt: new Date(NOW.getTime() - daysAgo * DAY_MS),
    source: "practice",
  };
}

/** n nya kandidater med id från `from`, alla i samma topic */
function newCards(from: number, n: number, topicId = 1): PracticeCandidate[] {
  return Array.from({ length: n }, (_, i) => ({
    questionId: from + i,
    topicId,
  }));
}

describe("nya kort i övningspasset", () => {
  it("tar in nya ord när eleven inte har något att repetera", () => {
    const states = buildRelearningStates([], NOW);
    const set = selectPracticeSet([], states, 20, {
      candidates: newCards(100, 30),
      introducedToday: 0,
    });
    expect(set).toHaveLength(DAILY_NEW_CARD_CAP);
    expect(set[0]).toBe(100);
  });

  it("släpper inte in fler nya än dagens tak", () => {
    const states = buildRelearningStates([], NOW);
    const set = selectPracticeSet([], states, 20, {
      candidates: newCards(100, 30),
      introducedToday: DAILY_NEW_CARD_CAP - 2,
    });
    expect(set).toHaveLength(2);
  });

  it("ger inga nya alls när taket redan är nått idag", () => {
    const states = buildRelearningStates([], NOW);
    const set = selectPracticeSet([], states, 20, {
      candidates: newCards(100, 30),
      introducedToday: DAILY_NEW_CARD_CAP,
    });
    expect(set).toEqual([]);
  });

  it("lägger repetitioner före nya ord", () => {
    // Två frågor missade för länge sedan - båda är due nu
    const attempts = [attempt(1, 30, false), attempt(2, 30, false)];
    const states = buildRelearningStates(attempts, NOW);
    const candidates: PracticeCandidate[] = [
      { questionId: 1, topicId: 1 },
      { questionId: 2, topicId: 1 },
    ];
    const set = selectPracticeSet(candidates, states, 20, {
      candidates: newCards(100, 5),
      introducedToday: 0,
    });
    expect(set.slice(0, 2).sort()).toEqual([1, 2]);
    expect(set.slice(2)).toEqual([100, 101, 102, 103, 104]);
  });

  it("tränger inte undan repetitioner när passet är fullt", () => {
    // 20 due-frågor fyller passets tak helt
    const attempts = Array.from({ length: 20 }, (_, i) =>
      attempt(i + 1, 30, false)
    );
    const states = buildRelearningStates(attempts, NOW);
    const candidates = Array.from({ length: 20 }, (_, i) => ({
      questionId: i + 1,
      topicId: 1,
    }));
    const set = selectPracticeSet(candidates, states, 20, {
      candidates: newCards(100, 10),
      introducedToday: 0,
    });
    expect(set).toHaveLength(20);
    expect(set.every((id) => id < 100)).toBe(true);
  });

  it("hoppar över nya kandidater som eleven redan mött", () => {
    // Fråga 100 har historik men är inte due - den ska varken repeteras
    // eller introduceras på nytt
    const states = buildRelearningStates([attempt(100, 0, true)], NOW);
    const set = selectPracticeSet([], states, 20, {
      candidates: newCards(100, 3),
      introducedToday: 0,
    });
    expect(set).toEqual([101, 102]);
  });

  it("beter sig precis som förr utan nya kort", () => {
    const attempts = [attempt(1, 30, false)];
    const states = buildRelearningStates(attempts, NOW);
    const set = selectPracticeSet([{ questionId: 1, topicId: 1 }], states);
    expect(set).toEqual([1]);
  });
});

describe("countIntroducedToday", () => {
  it("räknar frågor vars första försök är idag", () => {
    const states = buildRelearningStates(
      [attempt(1, 0, true), attempt(2, 0, false), attempt(3, 5, true)],
      NOW
    );
    expect(countIntroducedToday(states, NOW)).toBe(2);
  });

  it("räknar inte en gammal fråga som repeterats idag", () => {
    // Första försöket för fem dagar sedan, repetition idag - inte ny
    const states = buildRelearningStates(
      [attempt(1, 5, true), attempt(1, 0, true)],
      NOW
    );
    expect(countIntroducedToday(states, NOW)).toBe(0);
  });
});
