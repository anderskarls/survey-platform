import { describe, it, expect } from "vitest";
import { OSAKER, arOsaker, raknaSvarsalternativ } from "./svarsvarden";

describe("raknaSvarsalternativ", () => {
  it("nollställer alternativ som ingen valde", () => {
    const { optionCounts } = raknaSvarsalternativ(["A", "B", "C"], ["A", "A"]);
    expect(optionCounts).toEqual({ A: 2, B: 0, C: 0 });
  });

  it("håller 'Jag är osäker' utanför fördelningen", () => {
    const { optionCounts, osakra } = raknaSvarsalternativ(
      ["RATT", "FEL"],
      ["RATT", "RATT", "RATT", "FEL", "FEL", OSAKER]
    );
    expect(optionCounts).toEqual({ RATT: 3, FEL: 2 });
    expect(optionCounts).not.toHaveProperty(OSAKER);
    expect(osakra).toBe(1);
  });

  it("räknar procenten på avgivna svar, inte på alla inlämnade", () => {
    // Fyndet: 3 rätt av 6 rader blev 50 % fast tre av fem som faktiskt
    // svarade hade rätt. Nämnaren ska vara 5, inte 6.
    const { optionCounts, avgivna } = raknaSvarsalternativ(
      ["RATT", "FEL"],
      ["RATT", "RATT", "RATT", "FEL", "FEL", OSAKER]
    );
    expect(avgivna).toBe(5);
    expect(Math.round((optionCounts.RATT / avgivna) * 100)).toBe(60);
  });

  it("klarar en fråga där alla var osäkra", () => {
    const { optionCounts, osakra, avgivna } = raknaSvarsalternativ(
      ["A", "B"],
      [OSAKER, OSAKER]
    );
    expect(optionCounts).toEqual({ A: 0, B: 0 });
    expect(osakra).toBe(2);
    expect(avgivna).toBe(0);
  });

  it("räknar svar som inte är ett av alternativen (t.ex. borttaget alternativ)", () => {
    const { optionCounts, avgivna } = raknaSvarsalternativ(["A"], ["A", "B"]);
    expect(optionCounts).toEqual({ A: 1, B: 1 });
    expect(avgivna).toBe(2);
  });

  it("ger tom fördelning utan svar", () => {
    expect(raknaSvarsalternativ([], [])).toEqual({
      optionCounts: {},
      osakra: 0,
      avgivna: 0,
    });
  });
});

describe("arOsaker", () => {
  it("känner igen sentinelvärdet och bara det", () => {
    expect(arOsaker(OSAKER)).toBe(true);
    expect(arOsaker("__unsure__")).toBe(false);
    expect(arOsaker("osäker")).toBe(false);
    expect(arOsaker("")).toBe(false);
  });
});
