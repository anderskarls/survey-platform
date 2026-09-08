import { describe, expect, it } from "vitest";
import { toEnkatFraga } from "./enkatfraga";

/**
 * Enkätfrågans kontrakt: vad som får lämna servern före elevens svar.
 *
 * Tidslinjefrågan var länge spärrad i enkätflödet - renderaren sa rakt ut att
 * den bara kunde övas i förmågeträningen. När spärren öppnades blev det här
 * det ställe som håller isär de två sakerna: eleven ska få axeln, epokerna och
 * prickarna, men aldrig målets år eller de rubriker som inte är ankare.
 */
const TIMELINE_CONFIG = {
  form: "placera",
  fran: -10500,
  till: 1900,
  epoker: [
    { namn: "Antiken", fran: -3000, till: 476 },
    { namn: "Medeltiden", fran: 476, till: 1492 },
  ],
  handelser: [
    { ar: -3000, rubrik: "Antiken börjar" },
    { ar: 476, rubrik: "Västroms siste kejsare avsätts" },
    { ar: 1492, rubrik: "Columbus korsar Atlanten" },
  ],
  ankare: ["Västroms siste kejsare avsätts"],
  mal: [
    {
      ar: -10000,
      rubrik: "Jordbruksrevolutionen",
      cirka: true,
      kommentar: "Övergången till jordbruk.",
    },
  ],
  tolerans: 1200,
};

function tidslinjefraga(config: unknown = TIMELINE_CONFIG) {
  return toEnkatFraga({
    id: 1,
    text: "Placera jordbruksrevolutionen på axeln",
    type: "TIMELINE",
    config,
    options: [],
  });
}

describe("toEnkatFraga för TIMELINE", () => {
  it("skickar med axel, epoker och prickar", () => {
    const q = tidslinjefraga();
    expect(q.timeline?.form).toBe("placera");
    expect(q.timeline?.fran).toBe(-10500);
    expect(q.timeline?.epoker.map((e) => e.namn)).toEqual(["Antiken", "Medeltiden"]);
    expect(q.timeline?.handelser).toHaveLength(3);
    expect(q.timeline?.antal).toBe(1);
  });

  it("håller tillbaka målet och de rubriker som inte är ankare", () => {
    const q = tidslinjefraga();
    const serialiserad = JSON.stringify(q);
    expect(serialiserad).not.toContain("Jordbruksrevolutionen");
    expect(serialiserad).not.toContain("Antiken börjar");
    expect(serialiserad).not.toContain("Övergången till jordbruk");
    expect(serialiserad).not.toContain("-10000");
    // Ankaret är hela poängen med ankare - det ska stå kvar med rubrik.
    expect(q.timeline?.handelser.find((h) => h.ar === 476)?.etikett).toBe(
      "Västroms siste kejsare avsätts"
    );
    expect(q.timeline?.handelser.find((h) => h.ar === 1492)?.etikett).toBeNull();
  });

  it("trasig konfiguration ger null, inte en halv tidslinje", () => {
    expect(tidslinjefraga({ form: "placera" }).timeline).toBeNull();
    expect(tidslinjefraga(null).timeline).toBeNull();
  });

  it("andra typer får timeline null", () => {
    const q = toEnkatFraga({
      id: 2,
      text: "Vilket årtal?",
      type: "MULTIPLE_CHOICE",
      config: null,
      options: [{ text: "1492", isCorrect: true }],
    });
    expect(q.timeline).toBeNull();
    expect(q.sorting).toBeNull();
  });
});
