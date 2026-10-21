import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { obesvaradePositioner } from "./obesvarade";
import BekraftaInlamning from "@/components/BekraftaInlamning";

describe("obesvaradePositioner", () => {
  it("ger positionerna i visningsordning, inte fråge-id:n", () => {
    expect(obesvaradePositioner([70, 71, 72, 73], { 71: "svar" })).toEqual([0, 2, 3]);
  });

  it("räknar blanksteg som obesvarat", () => {
    expect(obesvaradePositioner([1, 2], { 1: "   ", 2: "x" })).toEqual([0]);
  });

  it("räknar ett tabellsvar som besvarat - tom tabell sparas som tom sträng", () => {
    const tabell = JSON.stringify({ tabell: [{ r: 0, k: 1, rad: "Ostracism", kolumn: "Problem", text: "en blev för mäktig" }] });
    expect(obesvaradePositioner([1, 2], { 1: tabell, 2: "" })).toEqual([1]);
  });

  it("ger tom lista när allt är besvarat", () => {
    expect(obesvaradePositioner([1, 2], { 1: "a", 2: "b" })).toEqual([]);
  });
});

function ruta(obesvarade: number, totalt: number) {
  return renderToStaticMarkup(
    createElement(BekraftaInlamning, {
      obesvarade,
      totalt,
      submitting: false,
      onFortsatt: () => {},
      onLamnaIn: () => {},
    })
  );
}

describe("BekraftaInlamning med obesvarade frågor", () => {
  const html = ruta(5, 8);

  it("säger hur många som är obesvarade", () => {
    expect(html).toContain("Du har inte svarat på 5 av 8 frågor.");
  });

  it("har Fortsätt svara sist - på Skicka svar-knappens plats", () => {
    expect(html.indexOf("Lämna in ändå")).toBeGreaterThan(-1);
    expect(html.indexOf("Fortsätt svara")).toBeGreaterThan(html.indexOf("Lämna in ändå"));
  });

  it("har ingen submit-knapp - bara ett uttryckligt klick lämnar in", () => {
    expect(html).not.toContain('type="submit"');
  });
});

describe("BekraftaInlamning när allt är besvarat", () => {
  const html = ruta(0, 8);

  it("frågar ändå om eleven vill lämna in", () => {
    expect(html).toContain("Vill du lämna in?");
    expect(html).toContain("Du kan inte ändra dina svar efteråt.");
    expect(html).not.toContain("Du har inte svarat");
  });

  it("har Gå tillbaka sist - på Skicka svar-knappens plats", () => {
    expect(html.indexOf("Lämna in<")).toBeGreaterThan(-1);
    expect(html.indexOf("Gå tillbaka")).toBeGreaterThan(html.indexOf("Lämna in<"));
  });

  it("har ingen submit-knapp", () => {
    expect(html).not.toContain('type="submit"');
  });
});
