import { describe, expect, it } from "vitest";
import { planSurveyUpdate, SurveyEditError } from "./survey-edit";
import { updateSurveySchema } from "./validators";
import type { PlannableSurvey } from "./survey-edit";

function enkat(overrides: Partial<PlannableSurvey> = {}): PlannableSurvey {
  return {
    title: "Veckotest 04",
    description: "",
    mode: "QUIZ",
    lockMode: false,
    unitId: null,
    lesson: null,
    openAt: null,
    questions: [
      { questionId: 10, order: 0 },
      { questionId: 11, order: 1 },
      { questionId: 12, order: 2 },
    ],
    responseCount: 5,
    answeredByQuestion: { 10: 5, 11: 5, 12: 4 },
    ...overrides,
  };
}

function input(raw: Record<string, unknown>) {
  return updateSurveySchema.parse(raw);
}

describe("updateSurveySchema", () => {
  it("avvisar en tom kropp - ingenting att uppdatera", () => {
    expect(() => updateSurveySchema.parse({})).toThrow();
  });

  it("tar null som ett värde, inte som utelämnat", () => {
    const parsed = input({ openAt: null });
    expect(parsed.openAt).toBeNull();
  });

  it("kräver minst en fråga", () => {
    expect(() => updateSurveySchema.parse({ questionIds: [] })).toThrow();
  });
});

describe("planSurveyUpdate - fält", () => {
  it("räknar bara fält som faktiskt fick ett nytt värde", () => {
    const plan = planSurveyUpdate(
      enkat(),
      input({ title: "Veckotest 04", description: "Vecka 4" })
    );
    expect(plan.changedFields).toEqual(["beskrivning"]);
  });

  it("ser ett byte av läge och av låst läge", () => {
    const plan = planSurveyUpdate(enkat(), input({ mode: "SURVEY", lockMode: true }));
    expect(plan.changedFields).toEqual(["läge", "låst läge"]);
  });

  it("jämför släpptiden på tidpunkt, inte på strängform", () => {
    const openAt = new Date("2026-09-01T06:00:00.000Z");
    const oford = planSurveyUpdate(
      enkat({ openAt }),
      input({ openAt: openAt.toISOString() })
    );
    expect(oford.changedFields).toEqual([]);

    const flyttad = planSurveyUpdate(
      enkat({ openAt }),
      input({ openAt: "2026-09-08T06:00:00.000Z" })
    );
    expect(flyttad.changedFields).toEqual(["öppnar"]);
  });

  it("ser att släppet nollställs", () => {
    const plan = planSurveyUpdate(
      enkat({ openAt: new Date("2026-09-01T06:00:00.000Z") }),
      input({ openAt: null })
    );
    expect(plan.changedFields).toEqual(["öppnar"]);
  });

  it("lämnar frågeuppsättningen orörd när questionIds utelämnas", () => {
    const plan = planSurveyUpdate(enkat(), input({ title: "Nytt namn" }));
    expect(plan.nextQuestionIds).toBeNull();
    expect(plan.added).toEqual([]);
    expect(plan.removed).toEqual([]);
    expect(plan.confirmationMessage).toBeNull();
  });
});

describe("planSurveyUpdate - frågeuppsättningen", () => {
  it("skiljer tillagda, urlyfta och behållna", () => {
    const plan = planSurveyUpdate(enkat(), input({ questionIds: [11, 10, 20] }));
    expect(plan.added).toEqual([20]);
    expect(plan.removed).toEqual([12]);
    expect(plan.kept).toEqual([11, 10]);
  });

  it("ser ren omsortering som omsortering, inte som en ny uppsättning", () => {
    const plan = planSurveyUpdate(enkat(), input({ questionIds: [12, 11, 10] }));
    expect(plan.reordered).toBe(true);
    expect(plan.added).toEqual([]);
    expect(plan.removed).toEqual([]);
    expect(plan.confirmationMessage).toBeNull();
  });

  it("räknar inte samma ordning som en omsortering", () => {
    const plan = planSurveyUpdate(enkat(), input({ questionIds: [10, 11, 12] }));
    expect(plan.reordered).toBe(false);
  });

  it("flaggar inte omsortering när uppsättningen också ändras", () => {
    // Ordningen skrivs ändå om för allt; att kalla det omsortering vore
    // dubbelrapportering av samma ändring.
    const plan = planSurveyUpdate(enkat(), input({ questionIds: [12, 11] }));
    expect(plan.reordered).toBe(false);
  });

  it("avvisar samma fråga två gånger", () => {
    expect(() =>
      planSurveyUpdate(enkat(), input({ questionIds: [10, 10, 11] }))
    ).toThrow(SurveyEditError);
  });
});

describe("planSurveyUpdate - elevernas svar", () => {
  it("kräver bekräftelse när en urlyft fråga har svar", () => {
    const plan = planSurveyUpdate(enkat(), input({ questionIds: [10, 11] }));
    expect(plan.hiddenAnswers).toBe(4);
    expect(plan.confirmationMessage).toContain("4 elevsvar");
    expect(plan.confirmationMessage).toContain("raderas inte");
  });

  it("summerar över flera urlyfta frågor", () => {
    const plan = planSurveyUpdate(enkat(), input({ questionIds: [10] }));
    expect(plan.hiddenAnswers).toBe(9);
    expect(plan.confirmationMessage).toContain("2 frågor");
  });

  it("kräver ingen bekräftelse för en obesvarad fråga", () => {
    const plan = planSurveyUpdate(
      enkat({ answeredByQuestion: { 10: 5, 11: 5, 12: 0 } }),
      input({ questionIds: [10, 11] })
    );
    expect(plan.hiddenAnswers).toBe(0);
    expect(plan.confirmationMessage).toBeNull();
  });

  it("kräver ingen bekräftelse i en enkät utan inlämningar", () => {
    const plan = planSurveyUpdate(
      enkat({ responseCount: 0, answeredByQuestion: {} }),
      input({ questionIds: [10] })
    );
    expect(plan.confirmationMessage).toBeNull();
    expect(plan.responsesMissingNew).toBe(0);
  });

  it("räknar inlämningar som saknar de nytillagda frågorna", () => {
    const plan = planSurveyUpdate(enkat(), input({ questionIds: [10, 11, 12, 30] }));
    expect(plan.responsesMissingNew).toBe(5);
    // Att lägga till är inte destruktivt - det ska inte spärras.
    expect(plan.confirmationMessage).toBeNull();
  });
});
