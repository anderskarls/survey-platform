import { describe, expect, it } from "vitest";
import { planQuestionUpdate, desiredCorrect, QuestionEditError } from "./question-edit";
import { updateQuestionSchema } from "./validators";
import type { PlannableQuestion } from "./question-edit";

function fraga(overrides: Partial<PlannableQuestion> = {}): PlannableQuestion {
  return {
    type: "MULTIPLE_CHOICE",
    options: [
      { id: 1, text: "Versaillesfreden", isCorrect: true },
      { id: 2, text: "Wienkongressen", isCorrect: false },
    ],
    _count: { answers: 12, practiceAttempts: 3 },
    ...overrides,
  };
}

function input(raw: Record<string, unknown>) {
  return updateQuestionSchema.parse(raw);
}

describe("desiredCorrect", () => {
  it("håller 'Jag är inte säker' utanför rättningen", () => {
    expect(desiredCorrect("__UNSURE__", "Versaillesfreden")).toBeNull();
  });

  it("ger null när frågan saknar facit", () => {
    expect(desiredCorrect("Versaillesfreden", null)).toBeNull();
  });

  it("jämför svarets text med facittexten", () => {
    expect(desiredCorrect("Versaillesfreden", "Versaillesfreden")).toBe(true);
    expect(desiredCorrect("Wienkongressen", "Versaillesfreden")).toBe(false);
  });
});

describe("planQuestionUpdate - textbyten", () => {
  it("ser ett rättat stavfel som ett textbyte, inte som en ny uppsättning", () => {
    const plan = planQuestionUpdate(
      fraga(),
      input({
        options: [
          { id: 1, text: "Versaillesfördraget", isCorrect: true },
          { id: 2, text: "Wienkongressen", isCorrect: false },
        ],
      })
    );
    expect(plan.renames).toEqual([
      { id: 1, from: "Versaillesfreden", to: "Versaillesfördraget" },
    ]);
    expect(plan.removed).toHaveLength(0);
    expect(plan.facitChanged).toBe(false);
  });

  it("kräver ingen bekräftelse för ett rent textbyte - svaren migreras förlustfritt", () => {
    const plan = planQuestionUpdate(
      fraga(),
      input({
        options: [
          { id: 1, text: "Versaillesfördraget", isCorrect: true },
          { id: 2, text: "Wienkongressen", isCorrect: false },
        ],
      })
    );
    expect(plan.confirmationMessage).toBeNull();
    expect(plan.regradeNeeded).toBe(true);
  });

  it("hanterar att två alternativ byter text med varandra", () => {
    const plan = planQuestionUpdate(
      fraga(),
      input({
        options: [
          { id: 1, text: "Wienkongressen", isCorrect: true },
          { id: 2, text: "Versaillesfreden", isCorrect: false },
        ],
      })
    );
    expect(plan.renames).toEqual([
      { id: 1, from: "Versaillesfreden", to: "Wienkongressen" },
      { id: 2, from: "Wienkongressen", to: "Versaillesfreden" },
    ]);
  });
});

describe("planQuestionUpdate - bekräftelse", () => {
  it("kräver bekräftelse när facit flyttas och det finns svar", () => {
    const plan = planQuestionUpdate(
      fraga(),
      input({
        options: [
          { id: 1, text: "Versaillesfreden", isCorrect: false },
          { id: 2, text: "Wienkongressen", isCorrect: true },
        ],
      })
    );
    expect(plan.facitChanged).toBe(true);
    expect(plan.confirmationMessage).toContain("12 elevsvar och 3 övningsförsök");
    expect(plan.confirmationMessage).toContain("flyttar rätt svar");
  });

  it("kräver ingen bekräftelse när frågan är obesvarad", () => {
    const plan = planQuestionUpdate(
      fraga({ _count: { answers: 0, practiceAttempts: 0 } }),
      input({
        options: [
          { id: 1, text: "Versaillesfreden", isCorrect: false },
          { id: 2, text: "Wienkongressen", isCorrect: true },
        ],
      })
    );
    expect(plan.confirmationMessage).toBeNull();
  });

  it("kräver bekräftelse när ett alternativ tas bort", () => {
    const plan = planQuestionUpdate(
      fraga({
        options: [
          { id: 1, text: "Versaillesfreden", isCorrect: true },
          { id: 2, text: "Wienkongressen", isCorrect: false },
          { id: 3, text: "Westfaliska freden", isCorrect: false },
        ],
      }),
      input({
        options: [
          { id: 1, text: "Versaillesfreden", isCorrect: true },
          { id: 2, text: "Wienkongressen", isCorrect: false },
        ],
      })
    );
    expect(plan.removed).toHaveLength(1);
    expect(plan.confirmationMessage).toContain("ett alternativ");
  });

  it("kräver bekräftelse när frågetypen byts", () => {
    const plan = planQuestionUpdate(fraga(), input({ type: "FREE_TEXT" }));
    expect(plan.typeChanged).toBe(true);
    expect(plan.isMc).toBe(false);
    expect(plan.confirmationMessage).toContain("byter frågetyp");
  });

  it("räknar bara med de historikslag som faktiskt finns", () => {
    const plan = planQuestionUpdate(
      fraga({ _count: { answers: 0, practiceAttempts: 4 } }),
      input({ type: "FREE_TEXT" })
    );
    expect(plan.confirmationMessage).toContain("4 övningsförsök");
    expect(plan.confirmationMessage).not.toContain("elevsvar");
  });
});

describe("planQuestionUpdate - enbart metadata", () => {
  it("lämnar alternativen orörda när bara frågetexten ändras", () => {
    const plan = planQuestionUpdate(fraga(), input({ text: "  Ny frågetext  " }));
    expect(plan.incoming).toBeUndefined();
    expect(plan.renames).toHaveLength(0);
    expect(plan.regradeNeeded).toBe(false);
    expect(plan.confirmationMessage).toBeNull();
  });

  it("trimmar frågetexten", () => {
    expect(input({ text: "  Ny frågetext  " }).text).toBe("Ny frågetext");
  });
});

describe("planQuestionUpdate - avvisar ogiltiga ändringar", () => {
  it("vägrar alternativ som tillhör en annan fråga", () => {
    expect(() =>
      planQuestionUpdate(
        fraga(),
        input({
          options: [
            { id: 99, text: "Versaillesfreden", isCorrect: true },
            { id: 2, text: "Wienkongressen", isCorrect: false },
          ],
        })
      )
    ).toThrow(QuestionEditError);
  });

  it("vägrar en flervalsfråga med bara ett alternativ", () => {
    expect(() =>
      planQuestionUpdate(
        fraga(),
        input({ options: [{ id: 1, text: "Versaillesfreden", isCorrect: true }] })
      )
    ).toThrow(/minst två alternativ/);
  });

  it("kräver alternativ när en textfråga görs om till flerval", () => {
    expect(() =>
      planQuestionUpdate(
        fraga({ type: "FREE_TEXT", options: [] }),
        input({ type: "MULTIPLE_CHOICE" })
      )
    ).toThrow(/Ange alternativen/);
  });

  it("kräver config för sorteringsfrågor som saknar den", () => {
    expect(() =>
      planQuestionUpdate(
        fraga({ type: "FREE_TEXT", options: [], config: null }),
        input({ type: "SORTING" })
      )
    ).toThrow(/categories och items/);
  });
});

describe("updateQuestionSchema", () => {
  it("avvisar två alternativ med samma text", () => {
    expect(() =>
      input({
        options: [
          { id: 1, text: "Samma", isCorrect: true },
          { id: 2, text: "Samma", isCorrect: false },
        ],
      })
    ).toThrow(/olika text/);
  });

  it("avvisar två rätta svar", () => {
    expect(() =>
      input({
        options: [
          { id: 1, text: "Ett", isCorrect: true },
          { id: 2, text: "Två", isCorrect: true },
        ],
      })
    ).toThrow(/Bara ett alternativ/);
  });

  it("avvisar en tom uppdatering", () => {
    expect(() => input({})).toThrow(/Inget att uppdatera/);
  });

  it("kvitteringsflaggan ensam räknas inte som en ändring", () => {
    expect(() => input({ confirmRegrade: true })).toThrow(/Inget att uppdatera/);
  });
});
