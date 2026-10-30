import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import LedtradPanel from "./LedtradPanel";
import type { TidigareLedtrad } from "@/lib/ledtrad";

function render(tidigare: TidigareLedtrad[] = []) {
  return renderToStaticMarkup(
    <LedtradPanel surveyId={385} questionId={6629} utkast="" tidigare={tidigare} onNy={() => {}} />
  );
}

describe("LedtradPanel", () => {
  it("visar knappen och AI-raden innan någon ledtråd getts", () => {
    const html = render();
    expect(html).toContain("Jag behöver en ledtråd");
    expect(html).toContain("skrivs av en AI");
    expect(html).not.toContain("<ol");
  });

  it("numrerar ledtrådarna från 1 och skiljer ut förklaringar av frågan", () => {
    const html = render([
      { kind: "FORKLARING", rung: null, hint: "Frihet betyder här att få välja själv." },
      { kind: "LEDTRAD", rung: 1, hint: "Frågan gäller medborgaren själv." },
      { kind: "LEDTRAD", rung: 2, hint: "Läs meningen om rådet." },
    ]);
    expect(html).toContain("Om frågan");
    expect(html).toContain("Ledtråd 1");
    expect(html).toContain("Ledtråd 2");
    expect(html).not.toContain("Ledtråd 3");
  });

  it("byter knappen mot ett slutbesked när R4 är given", () => {
    const html = render([1, 2, 3, 4].map((rung) => ({ kind: "LEDTRAD" as const, rung, hint: `steg ${rung}` })));
    expect(html).toContain("Nu har du fått alla ledtrådar");
    expect(html).not.toContain("<button");
  });

  it("knappen skickar aldrig formuläret", () => {
    expect(render()).toContain('type="button"');
  });
});
