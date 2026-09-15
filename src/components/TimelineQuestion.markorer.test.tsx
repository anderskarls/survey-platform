import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import TimelineQuestion from "./TimelineQuestion";
import type { ClientTimelineConfig, TimelineResult } from "@/lib/tidslinje";

/**
 * Markörerna är det eleven läser svaret ur: en linje med namnplatta för
 * valet och en för facit, i tidslinjens rätt- och felfärger. Rubrikerna som
 * hölls tillbaka före svar ska synas efteråt.
 */
const bas: ClientTimelineConfig = {
  form: "placera",
  fran: -600,
  till: 600,
  epoker: [
    { namn: "Antiken", fran: -3000, till: 476 },
    { namn: "Medeltiden", fran: 476, till: 1492 },
  ],
  handelser: [
    { ar: -509, etikett: null },
    { ar: -338, etikett: "Filip II besegrar de grekiska stadsstaterna" },
    { ar: -44, etikett: null },
  ],
  antal: 1,
};

const tomt: TimelineResult = {
  form: "placera",
  utfall: "fel",
  isCorrect: false,
  mal: [],
  klick: null,
  avstand: null,
  epokVald: null,
  epokRatt: null,
  klickad: null,
  ordning: null,
  rattPlats: null,
};

const rita = (props: Partial<Parameters<typeof TimelineQuestion>[0]>) =>
  renderToStaticMarkup(
    <TimelineQuestion config={bas} value={null} onChange={() => {}} disabled={false} result={null} {...props} />
  );

describe("TimelineQuestion: markörer", () => {
  it("placera före svar visar valet som grå markör", () => {
    const html = rita({ value: { ar: -200 } });
    expect(html).toContain("Du: 200 f.Kr.");
    expect(html).toContain("background:#6b6558");
  });

  it("placera fel: valet i rött, facit i svart, målets rubrik avslöjad", () => {
    const html = rita({
      result: {
        ...tomt,
        mal: [{ ar: -27, rubrik: "Augustus blir ensam härskare" }],
        klick: -200,
        avstand: 173,
      },
    });
    expect(html).toContain("Du: 200 f.Kr.");
    expect(html).toContain("background:#b0452c");
    expect(html).toContain(">27 f.Kr.<");
    expect(html).toContain("Augustus blir ensam härskare");
  });

  it("ordna efter svar numrerar valen och färgar dem efter rätt plats", () => {
    const html = rita({
      config: { ...bas, form: "ordna", antal: 3 },
      result: {
        ...tomt,
        form: "ordna",
        mal: [
          { ar: -509, rubrik: "Romerska republiken grundas" },
          { ar: -338, rubrik: "Filip II besegrar de grekiska stadsstaterna" },
          { ar: -44, rubrik: "Caesar mördas" },
        ],
        ordning: [
          { ar: -338, rubrik: "Filip II besegrar de grekiska stadsstaterna", ratt: false },
          { ar: -509, rubrik: "Romerska republiken grundas", ratt: false },
          { ar: -44, rubrik: "Caesar mördas", ratt: true },
        ],
        rattPlats: 1,
      },
    });
    expect(html).toMatch(/background:#b0452c[^>]*>1</);
    expect(html).toMatch(/background:#4f7d55[^>]*>3</);
    expect(html).toContain("Romerska republiken grundas");
    expect(html).toContain("Caesar mördas");
  });

  it("epok fel ramar in vald epok i rött och rätt epok i grönt i bandet", () => {
    const html = rita({
      // Spannet räcker in i medeltiden så att epoknamnet ryms i bandet.
      config: { ...bas, form: "epok", till: 1000 },
      result: {
        ...tomt,
        form: "epok",
        mal: [{ ar: 300, rubrik: "Konstantin blir kejsare" }],
        klick: 550,
        epokVald: "Medeltiden",
        epokRatt: "Antiken",
      },
    });
    expect(html).toContain('stroke="#4f7d55"');
    expect(html).toContain('stroke="#b0452c"');
    expect(html).toContain("MEDELTIDEN");
    expect(html).toContain("Konstantin blir kejsare");
  });
});
