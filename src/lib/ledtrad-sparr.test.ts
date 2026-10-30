import { describe, expect, it } from "vitest";
import { kanFaLedtrad, kanVisaLedtrad, VANTETID_MS, type KlickKontext } from "./ledtrad-sparr";

const nu = new Date("2026-10-28T10:00:00Z");

const ctx = (over: Partial<KlickKontext> = {}): KlickKontext => ({
  survey: { mode: "SURVEY", lockMode: false, courseId: 10, slappt: true },
  sessionCourseId: 10,
  hintsEnabled: true,
  fraga: { type: "FREE_TEXT", iSurvey: true, hintBasis: { facit: "Godtagbara svar." } },
  inlamnad: false,
  tidigare: [],
  nu,
  ...over,
});

const steg = (rung: number, sekunderSedan = 60) => ({
  kind: "LEDTRAD" as const,
  rung,
  hint: "x",
  createdAt: new Date(nu.getTime() - sekunderSedan * 1000),
});

const kod = (r: ReturnType<typeof kanFaLedtrad>) => (r.ok ? "ok" : r.kod);

describe("kanVisaLedtrad", () => {
  it("släpper igenom en elev med stödet på en reflektionsuppgift med underlag", () => {
    const r = kanVisaLedtrad(ctx());
    expect(r.ok && r.underlag.facit).toBe("Godtagbara svar.");
  });
  it("ger samma svar för fel kurs och fråga utanför uppgiften", () => {
    expect(kod(kanVisaLedtrad(ctx({ sessionCourseId: 12 })))).toBe("finns-inte");
    expect(kod(kanVisaLedtrad(ctx({ fraga: { ...ctx().fraga, iSurvey: false } })))).toBe("finns-inte");
  });
  it("stänger av på quiz och i låst läge", () => {
    expect(kod(kanVisaLedtrad(ctx({ survey: { ...ctx().survey, mode: "QUIZ" } })))).toBe("prov");
    expect(kod(kanVisaLedtrad(ctx({ survey: { ...ctx().survey, lockMode: true } })))).toBe("prov");
  });
  it("väntar på släpptiden", () => {
    expect(kod(kanVisaLedtrad(ctx({ survey: { ...ctx().survey, slappt: false } })))).toBe("ej-slappt");
  });
  it("kräver att läraren slagit på stödet för eleven", () => {
    expect(kod(kanVisaLedtrad(ctx({ hintsEnabled: false })))).toBe("av");
  });
  it("gäller bara fritext och reflektion", () => {
    expect(kod(kanVisaLedtrad(ctx({ fraga: { ...ctx().fraga, type: "MULTIPLE_CHOICE" } })))).toBe("fel-typ");
    expect(kanVisaLedtrad(ctx({ fraga: { ...ctx().fraga, type: "REFLECTION" } })).ok).toBe(true);
  });
  it("kräver giltigt underlag", () => {
    expect(kod(kanVisaLedtrad(ctx({ fraga: { ...ctx().fraga, hintBasis: null } })))).toBe("inget-underlag");
    expect(kod(kanVisaLedtrad(ctx({ fraga: { ...ctx().fraga, hintBasis: { facit: "  " } } })))).toBe("inget-underlag");
  });
});

describe("kanFaLedtrad", () => {
  it("släpper igenom första klicket", () => {
    expect(kanFaLedtrad(ctx()).ok).toBe(true);
  });
  it("stänger efter inlämning", () => {
    expect(kod(kanFaLedtrad(ctx({ inlamnad: true })))).toBe("inlamnad");
  });
  it("stänger när R4 är given", () => {
    expect(kod(kanFaLedtrad(ctx({ tidigare: [steg(1), steg(2), steg(3), steg(4)] })))).toBe("tak");
  });
  it("tillåter två förklaringar av frågan men inte fler", () => {
    const f = (s: number) => ({ kind: "FORKLARING" as const, rung: null, hint: "x", createdAt: new Date(nu.getTime() - s * 1000) });
    expect(kanFaLedtrad(ctx({ tidigare: [f(90), f(60)] })).ok).toBe(true);
    expect(kod(kanFaLedtrad(ctx({ tidigare: [f(120), f(90), f(60)] })))).toBe("tak");
  });
  it("kräver väntetid mellan klicken och säger hur länge", () => {
    const r = kanFaLedtrad(ctx({ tidigare: [steg(1, 5)] }));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(429);
      expect(r.sekunderKvar).toBe(VANTETID_MS / 1000 - 5);
    }
    expect(kanFaLedtrad(ctx({ tidigare: [steg(1, 21)] })).ok).toBe(true);
  });
  it("prövar de grundläggande spärrarna före taket", () => {
    expect(kod(kanFaLedtrad(ctx({ hintsEnabled: false, inlamnad: true })))).toBe("av");
  });
});
