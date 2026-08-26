import { describe, expect, it } from "vitest";
import {
  DAILY_NEW_CARD_CAP,
  PRACTICE_SET_CAP,
  buildRelearningStates,
  newCardRoom,
  selectPracticeSet,
  summarizePracticeReady,
  type AttemptRecord,
  type PracticeCandidate,
} from "./relearning";

// Regeln som testas: elevens badge och startsida ska räkna samma sak som
// passet faktiskt innehåller. Räknade de bara due-frågor blev startsidan tom
// för den elev vars lärare just öppnat en vecka - all historik saknas då.

const NOW = new Date("2026-09-10T10:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;

function attempt(questionId: number, daysAgo: number): AttemptRecord {
  return {
    questionId,
    isCorrect: false, // missat kort blir due snabbt
    createdAt: new Date(NOW.getTime() - daysAgo * DAY_MS),
    source: "practice",
  };
}

function cards(from: number, n: number, topicId = 1): PracticeCandidate[] {
  return Array.from({ length: n }, (_, i) => ({
    questionId: from + i,
    topicId,
  }));
}

describe("newCardRoom", () => {
  it("ger dagens tak när passet är tomt och korten är många", () => {
    expect(
      newCardRoom(0, { candidates: cards(100, 50), introducedToday: 0 })
    ).toBe(DAILY_NEW_CARD_CAP);
  });

  it("drar av det som redan introducerats idag", () => {
    expect(
      newCardRoom(0, { candidates: cards(100, 50), introducedToday: 4 })
    ).toBe(DAILY_NEW_CARD_CAP - 4);
  });

  it("ger noll när repetitionerna fyllt passet", () => {
    expect(
      newCardRoom(PRACTICE_SET_CAP, {
        candidates: cards(100, 50),
        introducedToday: 0,
      })
    ).toBe(0);
  });

  it("kan aldrig lova fler kort än det finns", () => {
    expect(
      newCardRoom(0, { candidates: cards(100, 3), introducedToday: 0 })
    ).toBe(3);
  });

  it("går inte under noll när taket redan är överskridet", () => {
    expect(
      newCardRoom(0, {
        candidates: cards(100, 5),
        introducedToday: DAILY_NEW_CARD_CAP + 2,
      })
    ).toBe(0);
  });
});

describe("summarizePracticeReady", () => {
  it("ser nya ord även när eleven inte mött en enda fråga", () => {
    const ready = summarizePracticeReady(new Map(), {
      candidates: cards(100, 45),
      introducedToday: 0,
    });
    expect(ready.due).toBe(0);
    expect(ready.newToday).toBe(DAILY_NEW_CARD_CAP);
    expect(ready.total).toBe(DAILY_NEW_CARD_CAP);
  });

  it("är tom när kursen varken har repetitioner eller öppnade veckor", () => {
    expect(summarizePracticeReady(new Map()).total).toBe(0);
  });

  it("stämmer med hur många frågor passet faktiskt innehåller", () => {
    const states = buildRelearningStates(
      [attempt(1, 3), attempt(2, 3), attempt(3, 3)],
      NOW
    );
    const candidates = cards(1, 3);
    const newCards = { candidates: cards(100, 20), introducedToday: 0 };
    const ready = summarizePracticeReady(states, newCards);
    const set = selectPracticeSet(
      candidates,
      states,
      PRACTICE_SET_CAP,
      newCards
    );
    expect(ready.total).toBe(set.length);
  });

  it("lovar inga nya ord när repetitionerna redan fyller passet", () => {
    const attempts = Array.from({ length: PRACTICE_SET_CAP + 5 }, (_, i) =>
      attempt(i + 1, 3)
    );
    const states = buildRelearningStates(attempts, NOW);
    const ready = summarizePracticeReady(states, {
      candidates: cards(100, 20),
      introducedToday: 0,
    });
    expect(ready.newToday).toBe(0);
    expect(ready.total).toBe(ready.due);
  });
});
