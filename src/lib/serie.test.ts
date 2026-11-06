import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import {
  arBesvarad,
  flikEtikett,
  forvaldFlik,
  lasUtkast,
  serieHref,
  serieKlar,
  serieuppgifter,
  sidnamn,
} from "./serie";
import { byggTabellsvar, parseTabellConfig } from "./tabell";
import { buildMomentState } from "./moment-status";
import { toEnkatFraga } from "./enkatfraga";
import SerieVy, { type SerieFlik } from "@/components/SerieVy";

/**
 * Serien (kartvyn): sidorna lämnas aldrig in, så "klar" måste avgöras ur
 * utkastet - och en karta med en tom rad är inte klar. Momentets mätare och
 * länkar måste följa med, annars står kartan som "Pågår" för evigt.
 */
const KARTA = {
  kind: "tabell",
  kolumner: ["Fråga", "Ditt svar"],
  rader: [
    ["Vem bestämde - och med vilken rätt?", null],
    ["Vem betalade - och med vad?", null],
    ["Vem kunde säga nej - och hur?", null],
  ],
};
const config = parseTabellConfig(KARTA)!;
const fraga = { id: 7, type: "TABLE", config: KARTA };

function utkast(rutor: Record<string, string>): string {
  return JSON.stringify({ "7": byggTabellsvar(config, rutor) });
}

describe("klar ur utkastet", () => {
  it("en tabell är klar först när varje skrivruta är ifylld", () => {
    expect(serieKlar([fraga], utkast({ "0:1": "Kungen", "1:1": "Bönderna" }))).toBe(false);
    expect(serieKlar([fraga], utkast({ "0:1": "Kungen", "1:1": "Bönderna", "2:1": "Adeln" }))).toBe(true);
  });

  it("blanksteg räknas inte som ifyllt", () => {
    expect(serieKlar([fraga], utkast({ "0:1": "Kungen", "1:1": "Bönderna", "2:1": "   " }))).toBe(false);
  });

  it("inget utkast, trasigt utkast och inga frågor är inte klart", () => {
    expect(serieKlar([fraga], null)).toBe(false);
    expect(serieKlar([fraga], "{inte json")).toBe(false);
    expect(serieKlar([], utkast({ "0:1": "x" }))).toBe(false);
    expect(lasUtkast("[1,2]")).toEqual({});
  });

  it("fritext är besvarad när något står där", () => {
    expect(arBesvarad({ id: 1, type: "FREE_TEXT", config: null }, "Svar")).toBe(true);
    expect(arBesvarad({ id: 1, type: "FREE_TEXT", config: null }, " ")).toBe(false);
  });
});

describe("namn och länkar", () => {
  it("tar bort seriens numrering och kortar fliken", () => {
    expect(sidnamn("Kartan 3. Canossa 1077 - påven mot kungen")).toBe("Canossa 1077 - påven mot kungen");
    expect(flikEtikett("Kartan 3. Canossa 1077 - påven mot kungen")).toBe("Canossa 1077");
    expect(flikEtikett("Kartan 2. Feodalismen, omkring år 1000")).toBe("Feodalismen");
    expect(flikEtikett("Kartan 5. Sverige på 1200-talet - tinget och Alsnö stadga")).toBe("Sverige på 1200-talet");
    expect(sidnamn("Utan nummer")).toBe("Utan nummer");
  });

  it("länken kodar seriens namn", () => {
    expect(serieHref(23, "Kartan - makt och skatt", 476)).toBe(
      "/student/moment/23/serie/Kartan%20-%20makt%20och%20skatt?flik=476"
    );
  });
});

describe("förvald flik", () => {
  const flikar = [
    { surveyId: 1, klar: true },
    { surveyId: 2, klar: false },
    { surveyId: 3, klar: false },
  ];

  it("utan datum: första sidan som inte är klar", () => {
    expect(forvaldFlik(flikar)).toBe(2);
  });

  it("allt klart: sista sidan", () => {
    expect(forvaldFlik(flikar.map((f) => ({ ...f, klar: true })))).toBe(3);
  });

  it("med datum: dagens (senast påbörjade) lektion, oavsett vad som är klart", () => {
    const daterade = [
      { surveyId: 1, klar: false, datum: "2026-11-09" },
      { surveyId: 2, klar: false, datum: "2026-11-11" },
      { surveyId: 3, klar: false, datum: "2026-11-16" },
    ];
    expect(forvaldFlik(daterade, new Date(2026, 10, 11, 9, 0))).toBe(2);
    expect(forvaldFlik(daterade, new Date(2026, 10, 1))).toBe(1);
  });
});

describe("momentsidan", () => {
  const surveys = [
    { id: 10, series: "Kartan", questions: [{ question: fraga }] },
    { id: 11, series: "Kartan", questions: [{ question: fraga }] },
    { id: 12, series: null, questions: [] },
  ];
  const drafts = [
    { surveyId: 10, answers: utkast({ "0:1": "a", "1:1": "b", "2:1": "c" }) },
    { surveyId: 11, answers: utkast({ "0:1": "a" }) },
  ];

  it("en komplett serieuppgift räknas som klar utan inlämning, en halvfärdig som pågående", () => {
    const serie = serieuppgifter(23, surveys, drafts);
    expect(serie.has(12)).toBe(false);
    const state = buildMomentState({
      lessons: [
        { n: 2, title: "Feodalismen" },
        { n: 3, title: "Canossa" },
      ],
      surveys: [10, 11].map((id, i) => ({
        id,
        title: `Kartan ${i + 2}`,
        lesson: i + 2,
        questionCount: 1,
        complete: serie.get(id)?.complete,
        href: serie.get(id)?.href,
      })),
      submittedSurveyIds: [],
      draftSurveyIds: [10, 11],
    });
    const [l2, l3] = state.lessons;
    expect(l2.tasks[0].status).toBe("done");
    expect(l2.tasks[0].href).toBe("/student/moment/23/serie/Kartan?flik=10");
    expect(l3.tasks[0].status).toBe("active");
    expect(state.stats.done).toBe(1);
  });
});

describe("kartvyn", () => {
  const dbFraga = { id: 7, text: "Fyll i under lektionen.", type: "TABLE", config: KARTA, options: [] };
  const flik = (surveyId: number, lesson: number, titel: string, svar: Record<string, string>): SerieFlik => ({
    surveyId,
    lesson,
    titel: sidnamn(titel),
    etikett: flikEtikett(titel),
    beskrivning: "Skriv konkret: vilka personer eller grupper.",
    fragor: [toEnkatFraga(dbFraga)],
    svar,
    klar: false,
  });
  const flikar = [
    flik(10, 2, "Kartan 2. Feodalismen, omkring år 1000", JSON.parse(utkast({ "0:1": "Kungen och herrarna" }))),
    flik(11, 3, "Kartan 3. Canossa 1077 - påven mot kungen", {}),
  ];

  it("visar alla flikar, tabellen och förra sidans svar", () => {
    const html = renderToStaticMarkup(createElement(SerieVy, { flikar, start: 11 }));
    expect(html).toContain("Feodalismen");
    expect(html).toContain("Canossa 1077");
    expect(html).toContain("Lektion 2");
    expect(html).toContain("Din förra sida: Feodalismen");
    expect(html).toContain("Kungen och herrarna");
    expect(html).toContain("<textarea");
    expect(html).toContain("Skriv konkret");
    // ingen inlämning i kartvyn
    expect(html).not.toMatch(/Skicka|Lämna in/);
  });

  it("första fliken har ingen förra sida", () => {
    const html = renderToStaticMarkup(createElement(SerieVy, { flikar, start: 10 }));
    expect(html).not.toContain("Din förra sida");
  });
});
