import { describe, expect, it } from "vitest";
import { escapeCsvCell, toCsv } from "./csv-export";

describe("escapeCsvCell", () => {
  it("lämnar vanlig text orörd", () => {
    expect(escapeCsvCell("Napoleon förlorade vid Waterloo")).toBe(
      "Napoleon förlorade vid Waterloo"
    );
  });

  it("citerar komma, citattecken och radbrytning", () => {
    expect(escapeCsvCell("ja, kanske")).toBe('"ja, kanske"');
    expect(escapeCsvCell('han sa "nej"')).toBe('"han sa ""nej"""');
    expect(escapeCsvCell("rad1\nrad2")).toBe('"rad1\nrad2"');
  });

  it("neutraliserar formler oavsett inledande tecken", () => {
    expect(escapeCsvCell("=1+1")).toBe("'=1+1");
    expect(escapeCsvCell("+SUM(A1)")).toBe("'+SUM(A1)");
    expect(escapeCsvCell("@import")).toBe("'@import");
    expect(escapeCsvCell("\tstart med tab")).toBe("'\tstart med tab");
  });

  it("neutraliserar formeln även när den också måste citeras", () => {
    expect(escapeCsvCell('=HYPERLINK("http://ond.se","klicka")')).toBe(
      '"\'=HYPERLINK(""http://ond.se"",""klicka"")"'
    );
  });

  it("låter rena tal förbli tal, även negativa", () => {
    expect(escapeCsvCell(-3)).toBe("-3");
    expect(escapeCsvCell("-3.5")).toBe("-3.5");
    expect(escapeCsvCell(0)).toBe("0");
    // decimalkomma citeras som vanligt, men får ingen apostrof
    expect(escapeCsvCell("-3,5")).toBe('"-3,5"');
  });

  it("skyddar text som börjar med bindestreck", () => {
    expect(escapeCsvCell("-cmd|' /C calc'!A0")).toBe("'-cmd|' /C calc'!A0");
  });

  it("gör null och undefined till tom cell", () => {
    expect(escapeCsvCell(null)).toBe("");
    expect(escapeCsvCell(undefined)).toBe("");
  });
});

describe("toCsv", () => {
  it("bygger rader med CRLF och escapar varje cell", () => {
    const csv = toCsv([
      ["Elevnummer", "Svar"],
      [3, "=2+2"],
      [4, "ja, precis"],
    ]);
    expect(csv).toBe('Elevnummer,Svar\r\n3,\'=2+2\r\n4,"ja, precis"');
  });
});
