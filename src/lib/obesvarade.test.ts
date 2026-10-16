import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { obesvaradePositioner, inlamningsbeslut } from "./obesvarade";
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

describe("inlamningsbeslut", () => {
  it("skickar direkt när allt är besvarat", () => {
    expect(inlamningsbeslut(0, false)).toBe("skicka");
  });

  it("frågar först när något är obesvarat", () => {
    expect(inlamningsbeslut(5, false)).toBe("fraga");
  });

  it("lämnar inte in på Enter eller submit medan rutan visas", () => {
    // Elev 8, MSA26A: andra klicket av farten får inte bli en inlämning
    expect(inlamningsbeslut(5, true)).toBe("vanta");
  });

  it("skickar om eleven svarat på det sista medan rutan stod framme", () => {
    expect(inlamningsbeslut(0, true)).toBe("skicka");
  });
});

describe("BekraftaInlamning", () => {
  const html = renderToStaticMarkup(
    createElement(BekraftaInlamning, {
      obesvarade: 5,
      totalt: 8,
      submitting: false,
      onFortsatt: () => {},
      onLamnaIn: () => {},
    })
  );

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
