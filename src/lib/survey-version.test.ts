import { describe, expect, it } from "vitest";
import {
  nextVersionNumber,
  planVersion,
  versionCandidates,
  versionsLeft,
  type VersionSource,
} from "@/lib/survey-version";

const now = new Date("2026-09-24T10:00:00Z");

function cloze(answer: string, variants: string[], extra: Record<string, unknown> = {}) {
  return {
    type: "CLOZE",
    text: `Original sentence with ___ for ${answer}.`,
    config: { answer, hint: "glosa", ...extra, variants },
    topicId: 7,
  };
}

function source(over: Partial<VersionSource> = {}): VersionSource {
  return {
    title: "Veckotest 03",
    openAt: null,
    versionOfId: null,
    questions: [
      cloze("attitude", ["A ___ one.", "A ___ two."]),
      cloze("behavior", ["B ___ one.", "B ___ two."], { accept: ["behaviour"] }),
    ],
    ...over,
  };
}

describe("nextVersionNumber", () => {
  it("börjar på 2 - originalet är version 1", () => {
    expect(nextVersionNumber([])).toBe(2);
  });
  it("räknar på det högsta numret, inte antalet", () => {
    // version 2 borttagen, 3 står kvar: nästa får inte krocka med 3
    expect(nextVersionNumber([3])).toBe(4);
  });
});

describe("versionsLeft", () => {
  it("två meningar per ord ger två versioner", () => {
    expect(versionsLeft(source().questions, [])).toBe(2);
    expect(versionsLeft(source().questions, [2])).toBe(1);
    expect(versionsLeft(source().questions, [2, 3])).toBe(0);
  });
  it("ordet med minst meningar bestämmer", () => {
    const qs = [cloze("a", ["x ___", "y ___"]), cloze("b", ["z ___"])];
    expect(versionsLeft(qs, [])).toBe(1);
  });
  it("en fråga som inte är luckfråga stoppar versioner", () => {
    const qs = [cloze("a", ["x ___"]), { type: "MULTIPLE_CHOICE", config: null }];
    expect(versionsLeft(qs, [])).toBe(0);
  });
  it("ett test utan frågor har inga versioner", () => {
    expect(versionsLeft([], [])).toBe(0);
  });
});

describe("planVersion", () => {
  it("version 2 tar första meningen, behåller facit, accept och ledtråd", () => {
    const plan = planVersion(source(), [], now);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.title).toBe("Veckotest 03 - version 2");
    expect(plan.versionNumber).toBe(2);
    expect(plan.questions.map((q) => q.text)).toEqual(["A ___ one.", "B ___ one."]);
    expect(plan.questions[1].config).toEqual({
      answer: "behavior",
      accept: ["behaviour"],
      hint: "glosa",
    });
    expect(plan.questions[0].topicId).toBe(7);
  });

  it("version 3 tar andra meningen", () => {
    const plan = planVersion(source(), [2], now);
    expect(plan.ok && plan.questions.map((q) => q.text)).toEqual([
      "A ___ two.",
      "B ___ two.",
    ]);
  });

  it("variantlistan följer inte med - en version kan inte bli källa", () => {
    const plan = planVersion(source(), [], now);
    expect(plan.ok && "variants" in plan.questions[0].config).toBe(false);
  });

  it("vägrar när meningarna tagit slut och namnger orden", () => {
    const plan = planVersion(source(), [2, 3], now);
    expect(plan.ok).toBe(false);
    if (plan.ok) return;
    expect(plan.status).toBe(409);
    expect(plan.error).toContain("attitude");
    expect(plan.error).toContain("behavior");
  });

  it("vägrar en version av en version", () => {
    const plan = planVersion(source({ versionOfId: 5 }), [], now);
    expect(plan.ok).toBe(false);
  });

  it("vägrar ett test som inte är öppnat", () => {
    const manuellt = new Date("2099-01-01T00:00:00Z");
    expect(planVersion(source({ openAt: manuellt }), [], now).ok).toBe(false);
  });

  it("vägrar en mening utan lucka", () => {
    const s = source({ questions: [cloze("a", ["no gap here"])] });
    expect(planVersion(s, [], now).ok).toBe(false);
  });
});

describe("versionCandidates", () => {
  const qs = source().questions;
  it("släppta original med meningar kvar, versionernas nummer räknade", () => {
    const list = versionCandidates(
      [
        { id: 1, title: "Veckotest 10", openAt: null, versionOfId: null, versionNumber: null, questions: qs },
        { id: 2, title: "Veckotest 2", openAt: null, versionOfId: null, versionNumber: null, questions: qs },
        { id: 3, title: "Veckotest 2 - version 2", openAt: null, versionOfId: 2, versionNumber: 2, questions: [] },
        { id: 4, title: "Veckotest 11", openAt: new Date("2099-01-01T00:00:00Z"), versionOfId: null, versionNumber: null, questions: qs },
      ],
      now
    );
    expect(list).toEqual([
      { id: 2, title: "Veckotest 2", nextVersion: 3, left: 1 },
      { id: 1, title: "Veckotest 10", nextVersion: 2, left: 2 },
    ]);
  });
  it("ett test vars meningar tagit slut faller bort", () => {
    const list = versionCandidates(
      [
        { id: 1, title: "V1", openAt: null, versionOfId: null, versionNumber: null, questions: qs },
        { id: 2, title: "V1 - version 2", openAt: null, versionOfId: 1, versionNumber: 2, questions: [] },
        { id: 3, title: "V1 - version 3", openAt: null, versionOfId: 1, versionNumber: 3, questions: [] },
      ],
      now
    );
    expect(list).toEqual([]);
  });
});
