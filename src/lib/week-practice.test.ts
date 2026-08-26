import { describe, expect, it } from "vitest";
import {
  orderWeekQuestions,
  remainingToday,
  summarizeWeekTopics,
  weekStatusLabel,
} from "./week-practice";
import type { QuestionPracticeState } from "./relearning";

// Regeln som testas: veckolistan ska visa elevens verkliga läge i en vecka.
// En vecka eleven aldrig rört ska se orörd ut - inte klar - och drillen ska
// lägga det som behöver arbete först.

function state(
  questionId: number,
  opts: Partial<QuestionPracticeState> = {}
): QuestionPracticeState {
  return {
    questionId,
    due: new Date("2026-09-10T08:00:00.000Z"),
    dueDay: "2026-09-10",
    isDue: false,
    daysUntilDue: 3,
    stability: 5,
    difficulty: 5,
    retrievability: 0.9,
    scheduledDays: 3,
    lastReview: new Date("2026-09-07T08:00:00.000Z"),
    lapses: 0,
    reps: 1,
    firstSeenDay: "2026-09-07",
    mastered: false,
    ...opts,
  };
}

function states(list: QuestionPracticeState[]) {
  return new Map(list.map((s) => [s.questionId, s]));
}

describe("summarizeWeekTopics", () => {
  it("räknar aldrig mötta kort som nya, inte som klara", () => {
    const [vecka] = summarizeWeekTopics(
      [{ id: 1, name: "Vecka 01", questionIds: [10, 11, 12] }],
      states([])
    );
    expect(vecka.total).toBe(3);
    expect(vecka.fresh).toBe(3);
    expect(vecka.due).toBe(0);
    expect(vecka.mastered).toBe(0);
  });

  it("delar upp veckan i due, nya och behärskade", () => {
    const [vecka] = summarizeWeekTopics(
      [{ id: 1, name: "Vecka 01", questionIds: [10, 11, 12, 13] }],
      states([
        state(10, { isDue: true, daysUntilDue: 0 }),
        state(11, { mastered: true, daysUntilDue: 9 }),
        state(12),
      ])
    );
    expect(vecka.due).toBe(1);
    expect(vecka.mastered).toBe(1);
    expect(vecka.fresh).toBe(1); // 13 saknar status
  });

  it("sorterar veckorna som en människa läser dem", () => {
    const namn = summarizeWeekTopics(
      [
        { id: 3, name: "Vecka 10", questionIds: [1] },
        { id: 1, name: "Vecka 02", questionIds: [2] },
        { id: 2, name: "Vecka 9", questionIds: [3] },
      ],
      states([])
    ).map((t) => t.name);
    expect(namn).toEqual(["Vecka 02", "Vecka 9", "Vecka 10"]);
  });
});

describe("orderWeekQuestions", () => {
  it("lägger due först, sedan nya, sist det som vilar", () => {
    const ordning = orderWeekQuestions(
      [40, 41, 42, 43],
      states([
        state(40, { daysUntilDue: 5 }), // vilar
        state(42, { isDue: true, daysUntilDue: 0 }), // due
        state(43, { daysUntilDue: 2 }), // vilar, men närmare
      ])
    );
    // 42 due, 41 aldrig mött, sedan de vilande i tur och ordning
    expect(ordning).toEqual([42, 41, 43, 40]);
  });

  it("behåller frågornas egen ordning när statusen är lika", () => {
    expect(orderWeekQuestions([5, 3, 4], states([]))).toEqual([3, 4, 5]);
  });

  it("rör inte listan den fick", () => {
    const ids = [9, 8, 7];
    orderWeekQuestions(ids, states([]));
    expect(ids).toEqual([9, 8, 7]);
  });
});

describe("weekStatusLabel", () => {
  it("säger vad som väntar när något gör det", () => {
    expect(
      weekStatusLabel({
        topicId: 1,
        name: "Vecka 01",
        total: 30,
        fresh: 4,
        due: 6,
        mastered: 10,
        doneToday: 0,
        remaining: 30,
      })
    ).toBe("30 kort · 6 att repetera · 4 nya");
  });

  it("säger att allt sitter när hela veckan är behärskad", () => {
    expect(
      weekStatusLabel({
        topicId: 1,
        name: "Vecka 01",
        total: 30,
        fresh: 0,
        due: 0,
        mastered: 30,
        doneToday: 0,
        remaining: 30,
      })
    ).toBe("30 kort · allt sitter");
  });

  it("skiljer behärskad vecka från vecka som bara vilar", () => {
    expect(
      weekStatusLabel({
        topicId: 1,
        name: "Vecka 01",
        total: 30,
        fresh: 0,
        due: 0,
        mastered: 12,
        doneToday: 0,
        remaining: 30,
      })
    ).toBe("30 kort · inget att repetera nu");
  });
});

// Regeln som testas: en vecka pa 30 kort ska vara delbar. Det eleven gjort
// idag raknas bort - inte for att det ar "klart", utan for att ett andra
// forsok samma dag inte flyttar nagot intervall.

describe("veckan är delbar", () => {
  it("räknar bort det som gjorts idag", () => {
    const [vecka] = summarizeWeekTopics(
      [{ id: 1, name: "Vecka 01", questionIds: [10, 11, 12, 13] }],
      states([]),
      new Set([10, 11])
    );
    expect(vecka.doneToday).toBe(2);
    expect(vecka.remaining).toBe(2);
    expect(vecka.total).toBe(4);
  });

  it("utan gjorda kort står hela veckan kvar", () => {
    const [vecka] = summarizeWeekTopics(
      [{ id: 1, name: "Vecka 01", questionIds: [10, 11] }],
      states([])
    );
    expect(vecka.doneToday).toBe(0);
    expect(vecka.remaining).toBe(2);
  });

  it("remainingToday lämnar kvar det som inte gjorts, i ordning", () => {
    expect(remainingToday([1, 2, 3, 4], new Set([2, 4]))).toEqual([1, 3]);
    expect(remainingToday([1, 2], new Set())).toEqual([1, 2]);
    expect(remainingToday([1, 2], new Set([1, 2]))).toEqual([]);
  });

  it("etiketten säger hur mycket som står kvar när veckan är påbörjad", () => {
    expect(
      weekStatusLabel({
        topicId: 1,
        name: "Vecka 01",
        total: 30,
        fresh: 18,
        due: 0,
        mastered: 0,
        doneToday: 12,
        remaining: 18,
      })
    ).toBe("30 kort · 18 kvar idag");
  });

  it("etiketten säger klar för idag när inget står kvar", () => {
    expect(
      weekStatusLabel({
        topicId: 1,
        name: "Vecka 01",
        total: 30,
        fresh: 0,
        due: 0,
        mastered: 3,
        doneToday: 30,
        remaining: 0,
      })
    ).toBe("30 kort · klar för idag");
  });
});
