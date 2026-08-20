import { describe, it, expect } from "vitest";
import {
  FLASHCARD_RATINGS,
  FLASHCARD_REVEAL,
  flashcardGrade,
  flashcardIsCorrect,
  flashcardLabel,
  isFlashcardValue,
} from "./flashcard";
import { gradeForAttempt, type AttemptRecord } from "./relearning";
import { toPracticeQuestion } from "./practice-question";

describe("flashcard-skattningar", () => {
  it("täcker FSRS betyg 1-4 utan luckor", () => {
    expect(FLASHCARD_RATINGS.map((r) => r.grade)).toEqual([1, 2, 3, 4]);
  });

  it("har unika värden", () => {
    const values = FLASHCARD_RATINGS.map((r) => r.value);
    expect(new Set(values).size).toBe(values.length);
  });

  it("känner igen sina egna värden och inget annat", () => {
    expect(isFlashcardValue("__FC_GOOD__")).toBe(true);
    expect(isFlashcardValue("__UNSURE__")).toBe(false);
    expect(isFlashcardValue("Attityd / Inställning")).toBe(false);
    // Vändmarkören är inte en skattning - den betyder bara "kortet är vänt"
    expect(isFlashcardValue(FLASHCARD_REVEAL)).toBe(false);
  });

  it("mappar värde till FSRS-betyg", () => {
    expect(flashcardGrade("__FC_AGAIN__")).toBe(1);
    expect(flashcardGrade("__FC_HARD__")).toBe(2);
    expect(flashcardGrade("__FC_GOOD__")).toBe(3);
    expect(flashcardGrade("__FC_EASY__")).toBe(4);
    expect(flashcardGrade("nåt annat")).toBeNull();
  });

  it("räknar bara Om igen som misslyckad återkallning", () => {
    // Svårt är ett svar eleven kom fram till, precis som i Anki - nyansen
    // bärs av betyget, inte av isCorrect.
    expect(flashcardIsCorrect("__FC_AGAIN__")).toBe(false);
    expect(flashcardIsCorrect("__FC_HARD__")).toBe(true);
    expect(flashcardIsCorrect("__FC_GOOD__")).toBe(true);
    expect(flashcardIsCorrect("__FC_EASY__")).toBe(true);
    expect(flashcardIsCorrect("__UNSURE__")).toBeNull();
  });

  it("ger läsbara etiketter i stället för sentinelvärden", () => {
    expect(flashcardLabel("__FC_HARD__")).toBe("Svårt");
    expect(flashcardLabel("Attityd / Inställning")).toBeNull();
  });
});

describe("skattningen når FSRS via quizsvar", () => {
  function answer(grade: number | undefined, isCorrect: boolean | null): AttemptRecord {
    return {
      questionId: 1,
      isCorrect,
      grade,
      createdAt: new Date("2026-08-20T10:00:00Z"),
      source: "answer",
    };
  }

  it("använder elevens betyg när kortet självskattats", () => {
    // Utan grade-kolumnen på Answer skulle Svårt och Lätt kollapsa till
    // Bra/Om igen och hela poängen med självskattningen gå förlorad.
    for (const r of FLASHCARD_RATINGS) {
      const record = answer(r.grade, flashcardIsCorrect(r.value));
      expect(gradeForAttempt(record)).toBe(r.grade);
    }
  });

  it("faller tillbaka på isCorrect för vanliga svar", () => {
    expect(gradeForAttempt(answer(undefined, true))).toBe(3);
    expect(gradeForAttempt(answer(undefined, false))).toBe(1);
  });
});

describe("kort i övningen läcker inte baksidan", () => {
  const mc = {
    id: 7,
    text: 'Vad betyder "attitude"?',
    type: "MULTIPLE_CHOICE",
    config: null,
    options: [
      { text: "Beteende / Uppförande" },
      { text: "Attityd / Inställning" },
    ],
  };

  it("skickar inga alternativ i flashcardläge", () => {
    // Baksidan hämtas först när eleven vänder kortet. Följde alternativen
    // med i sidladdningen skulle facit ligga i klienten före försöket - samma
    // regel som gäller sorteringsfrågornas kategorier.
    const q = toPracticeQuestion(mc, null, true);
    expect(q).not.toBeNull();
    expect(q!.flashcard).toBe(true);
    expect(q!.options).toEqual([]);
  });

  it("behåller alternativen i vanligt läge", () => {
    const q = toPracticeQuestion(mc, null, false);
    expect(q!.flashcard).toBe(false);
    expect(q!.options).toHaveLength(2);
  });

  it("gör inte fritext- eller sorteringsfrågor till kort", () => {
    const free = { ...mc, type: "FREE_TEXT", options: [] };
    const q = toPracticeQuestion(free, null, true);
    expect(q!.flashcard).toBe(false);
  });
});
