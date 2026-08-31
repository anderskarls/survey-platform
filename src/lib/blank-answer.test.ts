import { describe, it, expect } from "vitest";
import {
  blankCountsAsWrong,
  isBlank,
  submissionAnswers,
} from "./blank-answer";

describe("isBlank", () => {
  it("tomt och blanksteg räknas som obesvarat", () => {
    expect(isBlank("")).toBe(true);
    expect(isBlank("   ")).toBe(true);
    expect(isBlank("\n\t")).toBe(true);
  });

  it("ett svar är ett svar", () => {
    expect(isBlank("influence")).toBe(false);
    expect(isBlank(" a ")).toBe(false);
  });
});

describe("blankCountsAsWrong", () => {
  it("luckfrågan i ett veckotest rättas som fel", () => {
    expect(
      blankCountsAsWrong({ type: "CLOZE", isQuiz: true, flashcardMode: true })
    ).toBe(true);
  });

  it("flervalsfrågan i ett vanligt quiz rättas som fel", () => {
    expect(
      blankCountsAsWrong({
        type: "MULTIPLE_CHOICE",
        isQuiz: true,
        flashcardMode: false,
      })
    ).toBe(true);
  });

  it("flervalsfrågan i en kortkurs lämnas orörd - kortet vändes aldrig", () => {
    expect(
      blankCountsAsWrong({
        type: "MULTIPLE_CHOICE",
        isQuiz: true,
        flashcardMode: true,
      })
    ).toBe(false);
  });

  it("luckmeningskortet lämnas orört oavsett kursens läge", () => {
    for (const flashcardMode of [true, false]) {
      expect(
        blankCountsAsWrong({ type: "CLOZE_CARD", isQuiz: true, flashcardMode })
      ).toBe(false);
    }
  });

  it("enkätens obesvarade fält är ett avstående, inte ett fel", () => {
    expect(
      blankCountsAsWrong({ type: "CLOZE", isQuiz: false, flashcardMode: false })
    ).toBe(false);
    expect(
      blankCountsAsWrong({
        type: "MULTIPLE_CHOICE",
        isQuiz: false,
        flashcardMode: false,
      })
    ).toBe(false);
  });

  it("orättade typer får inga tomma rader", () => {
    for (const type of ["FREE_TEXT", "REFLECTION", "SORTING"]) {
      expect(
        blankCountsAsWrong({ type, isQuiz: true, flashcardMode: false })
      ).toBe(false);
    }
  });
});

describe("submissionAnswers", () => {
  it("skickar med obesvarade frågor som tom sträng", () => {
    expect(submissionAnswers([1, 2, 3], { 1: "influence", 3: "  " })).toEqual([
      { questionId: 1, value: "influence" },
      { questionId: 2, value: "" },
      { questionId: 3, value: "  " },
    ]);
  });

  it("håller visningsordningen", () => {
    const payload = submissionAnswers([9, 4, 7], {});
    expect(payload.map((a) => a.questionId)).toEqual([9, 4, 7]);
  });
});
