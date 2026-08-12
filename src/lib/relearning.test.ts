import { describe, expect, it } from "vitest";
import {
  buildQuestionState,
  hasAttemptOnDay,
  type AttemptRecord,
} from "./relearning";

// Regeln som testas: bara dagens FÖRSTA försök per fråga styr FSRS-schemat.
// Omkörningar samma dag sparas och hjälper inlärningen, men de kan varken
// förlänga intervallet eller tvätta bort en miss - eleven har sett facit och
// svarar då på igenkänning, inte framplockning.

const QID = 42;
/** Mitt på dagen i Europe/Stockholm oavsett sommar-/vintertid */
const NOW = new Date("2026-09-10T10:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;

function attempt(
  daysAgo: number,
  isCorrect: boolean | null,
  extra: Partial<AttemptRecord> = {}
): AttemptRecord {
  return {
    questionId: QID,
    isCorrect,
    createdAt: new Date(NOW.getTime() - daysAgo * DAY_MS),
    source: "practice",
    ...extra,
  };
}

/** Samma dag som `daysAgo`, fast `hours` timmar senare */
function laterSameDay(
  daysAgo: number,
  hours: number,
  isCorrect: boolean | null,
  extra: Partial<AttemptRecord> = {}
): AttemptRecord {
  return {
    questionId: QID,
    isCorrect,
    createdAt: new Date(NOW.getTime() - daysAgo * DAY_MS + hours * 60 * 60 * 1000),
    source: "practice",
    ...extra,
  };
}

function schedule(attempts: AttemptRecord[]) {
  const state = buildQuestionState(attempts, NOW);
  expect(state).not.toBeNull();
  return state!;
}

describe("omkörning samma dag påverkar inte schemat", () => {
  it("rätt svar efter en miss samma dag ger samma schema som missen ensam", () => {
    const miss = [attempt(3, false)];
    const missOchOmkorning = [attempt(3, false), laterSameDay(3, 2, true)];

    expect(schedule(missOchOmkorning).due.getTime()).toBe(
      schedule(miss).due.getTime()
    );
    expect(schedule(missOchOmkorning).scheduledDays).toBe(
      schedule(miss).scheduledDays
    );
  });

  it("självskattningen Lätt på en omkörning kan inte göra frågan behärskad", () => {
    const laundered = [
      attempt(3, false),
      laterSameDay(3, 2, true, { grade: 4 }), // Lätt på ett svar eleven just fått serverat
    ];

    expect(schedule(laundered).mastered).toBe(false);
    expect(schedule(laundered).due.getTime()).toBe(
      schedule([attempt(3, false)]).due.getTime()
    );
  });

  it("ett skarpt quizsvar och ett övningsförsök samma dag dubbelräknas inte", () => {
    const baraQuiz = [attempt(5, true, { source: "answer" })];
    const quizOchOvning = [
      attempt(5, true, { source: "answer" }),
      laterSameDay(5, 3, true),
    ];

    expect(schedule(quizOchOvning).due.getTime()).toBe(
      schedule(baraQuiz).due.getTime()
    );
  });

  it("fler omkörningar samma dag ändrar ingenting utöver den första", () => {
    const en = [attempt(2, false), laterSameDay(2, 1, true)];
    const fyra = [
      attempt(2, false),
      laterSameDay(2, 1, true),
      laterSameDay(2, 2, true),
      laterSameDay(2, 3, true, { grade: 4 }),
    ];

    expect(schedule(fyra).due.getTime()).toBe(schedule(en).due.getTime());
    expect(schedule(fyra).reps).toBe(schedule(en).reps);
  });
});

describe("försök olika dagar räknas fortfarande", () => {
  it("rätt svar dagen efter förlänger intervallet", () => {
    const baraMissen = schedule([attempt(3, false)]);
    const medUppfoljning = schedule([attempt(3, false), attempt(2, true)]);

    expect(medUppfoljning.due.getTime()).toBeGreaterThan(
      baraMissen.due.getTime()
    );
    expect(medUppfoljning.reps).toBe(2);
  });

  it("spacade korrekta svar bygger mot behärskad", () => {
    const state = schedule([
      attempt(30, true),
      attempt(20, true),
      attempt(10, true),
    ]);

    expect(state.reps).toBe(3);
    expect(state.mastered).toBe(true);
  });
});

describe("hasAttemptOnDay", () => {
  it("är sann för ett försök tidigare samma kalenderdag", () => {
    expect(hasAttemptOnDay([attempt(0, true)], NOW)).toBe(true);
  });

  it("är falsk när senaste försöket var igår", () => {
    expect(hasAttemptOnDay([attempt(1, true)], NOW)).toBe(false);
  });

  it("räknar dygnet i svensk tid, inte i UTC", () => {
    // 22:30 UTC den 15 juni = 00:30 den 16 juni i Stockholm (UTC+2)
    const sentPaKvallenUtc: AttemptRecord = {
      questionId: QID,
      isCorrect: true,
      createdAt: new Date("2026-06-15T22:30:00.000Z"),
      source: "practice",
    };
    const den16e = new Date("2026-06-16T08:00:00.000Z");

    expect(hasAttemptOnDay([sentPaKvallenUtc], den16e)).toBe(true);
  });
});
