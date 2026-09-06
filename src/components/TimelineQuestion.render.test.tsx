import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import PracticeRunner, { type PracticeQuestion } from "./PracticeRunner";
import type { ClientTimelineConfig } from "@/lib/tidslinje";

/**
 * Tidslinjefrågan i övningen: tidslinjen ritas, ankarna står med rubrik,
 * och ingenting i markupen avslöjar målet - klientkonfigurationen saknar
 * det, och det ska synas i det som faktiskt skickas till webbläsaren.
 */
const config: ClientTimelineConfig = {
  form: "placera",
  fran: -520,
  till: 500,
  epoker: [{ namn: "Antiken", fran: -800, till: 500 }],
  handelser: [
    { ar: -509, etikett: null },
    { ar: -338, etikett: "Filip II besegrar de grekiska stadsstaterna" },
    { ar: -44, etikett: null },
    { ar: 476, etikett: "Västroms siste kejsare avsätts" },
  ],
  antal: 1,
};

const fraga: PracticeQuestion = {
  id: 7,
  text: "Placera på axeln: Augustus blir ensam härskare",
  type: "TIMELINE",
  options: [],
  timeline: config,
};

describe("TimelineQuestion i PracticeRunner", () => {
  it("ritar tidslinjen med ankare och epokband, utan att avslöja de andra prickarna", () => {
    const html = renderToStaticMarkup(<PracticeRunner questions={[fraga]} />);
    expect(html).toContain("<svg");
    expect(html).toContain("ANTIKEN");
    expect(html).toContain("Filip II besegrar de grekiska stadsstaterna");
    expect(html).toContain("338 f.Kr.");
    expect(html).toContain('data-ar="-44"');
    expect(html).not.toContain("Caesar");
    expect(html).toContain("Tryck på axeln där händelsen hör hemma.");
    // Svara-knappen finns men är avstängd tills eleven valt ett år.
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Svara<\/button>/);
  });

  it("ordna visar hur många prickar som ska väljas", () => {
    const ordna: PracticeQuestion = {
      ...fraga,
      text: "Klicka prickarna i kronologisk ordning",
      timeline: { ...config, form: "ordna", antal: 3 },
    };
    const html = renderToStaticMarkup(<PracticeRunner questions={[ordna]} />);
    expect(html).toContain("Tryck på prickarna i tur och ordning, äldst först.");
  });
});
