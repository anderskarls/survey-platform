import { describe, expect, it } from "vitest";
import { ledtradEtikett, ledtradNyckel, postEtikett, sammanfattaLedtradar, type LedtradRad } from "./ledtrad-rapport";

const t = (min: number) => new Date(Date.UTC(2026, 9, 30, 10, min));

const rad = (over: Partial<LedtradRad>): LedtradRad => ({
  surveyId: 3,
  studentId: 1,
  questionId: 7,
  kind: "LEDTRAD",
  rung: 1,
  hint: "h",
  diagnosis: "d",
  createdAt: t(0),
  ...over,
});

describe("sammanfattaLedtradar", () => {
  it("grupperar per elev och fråga och sorterar i tidsordning", () => {
    const m = sammanfattaLedtradar([
      rad({ rung: 2, createdAt: t(5) }),
      rad({ rung: 1, createdAt: t(1) }),
      rad({ studentId: 2, rung: 1 }),
    ]);
    const s = m.get(ledtradNyckel(3, 1, 7))!;
    expect(s.poster.map((p) => p.rung)).toEqual([1, 2]);
    expect(s.hogstaRung).toBe(2);
    expect(m.get(ledtradNyckel(3, 2, 7))!.antal).toBe(1);
  });

  it("räknar förklaringar för sig, utan att de höjer steget", () => {
    const s = sammanfattaLedtradar([
      rad({ kind: "FORKLARING", rung: null }),
      rad({ rung: 1, createdAt: t(2) }),
    ]).get(ledtradNyckel(3, 1, 7))!;
    expect(s).toMatchObject({ antal: 1, forklaringar: 1, hogstaRung: 1 });
  });

  it("behåller diagnosen - rapporten är lärarens", () => {
    const s = sammanfattaLedtradar([rad({ diagnosis: "Blandar ihop orsak och följd." })]).get(ledtradNyckel(3, 1, 7))!;
    expect(s.poster[0].diagnosis).toBe("Blandar ihop orsak och följd.");
  });
});

describe("ledtradEtikett", () => {
  it("skriver antal, högsta steg och förklaringar", () => {
    expect(ledtradEtikett({ antal: 3, forklaringar: 1, hogstaRung: 3, poster: [] })).toBe(
      "3 ledtrådar, högst R3 · 1 förklaring"
    );
    expect(ledtradEtikett({ antal: 1, forklaringar: 0, hogstaRung: 1, poster: [] })).toBe("1 ledtråd, högst R1");
    expect(ledtradEtikett({ antal: 0, forklaringar: 2, hogstaRung: null, poster: [] })).toBe("2 förklaringar");
  });
});

describe("postEtikett", () => {
  it("namnger steg och förklaring", () => {
    expect(postEtikett({ kind: "LEDTRAD", rung: 4 })).toBe("R4");
    expect(postEtikett({ kind: "FORKLARING", rung: null })).toBe("Förklaring");
  });
});
