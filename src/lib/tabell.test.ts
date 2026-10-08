import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import {
  byggTabellsvar,
  formateraTabellsvar,
  lasTabellsvar,
  parseTabellConfig,
  tabellConfigSchema,
} from "./tabell";
import { toEnkatFraga } from "./enkatfraga";
import { formateraSorteringssvar } from "./formaga";
import { isBlank } from "./blank-answer";
import QuestionRenderer from "@/components/QuestionRenderer";

/**
 * Tabellfrågan: elevbladets tabell i appen. Det som måste hålla är att en
 * tom tabell är obesvarad, att svaret går att läsa utan configen, och att
 * en tabell aldrig faller igenom renderaren till en textruta.
 */
const CONFIG = {
  kind: "tabell",
  inledning: ["Läs **s. 89** i boken."],
  kolumner: ["Regel", "Vilket problem skulle den lösa?", "Vem fick vara med?"],
  bredder: [24, 38, 38],
  skrivrader: 3,
  rader: [
    ["*Exempel: lagarna skrivs ner*", "*Adeln kunde döma som den ville.*", "*Alla fria.*"],
    ["Folkförsamlingen", null, null],
    ["Rådet på 500", null, null],
  ],
  stodtabeller: [{ kolumner: ["År", "Vad hände"], rader: [["509 f.v.t.", "Kungen avsätts"]], efter: true }],
  efter: ["**Glöm inte** framstegskartan."],
};

describe("tabellconfigen", () => {
  it("godtar elevbladets tabell", () => {
    expect(parseTabellConfig(CONFIG)).not.toBeNull();
  });

  it("avvisar en tabell utan skrivrutor och rader med fel antal celler", () => {
    expect(tabellConfigSchema.safeParse({ ...CONFIG, rader: [["a", "b", "c"]] }).success).toBe(false);
    expect(tabellConfigSchema.safeParse({ ...CONFIG, rader: [["a", null]] }).success).toBe(false);
  });

  it("matchar inte en sorteringsconfig", () => {
    expect(tabellConfigSchema.safeParse({ categories: ["a", "b"], items: [] }).success).toBe(false);
  });
});

describe("tabellsvaret", () => {
  const config = parseTabellConfig(CONFIG)!;

  it("helt tom tabell är obesvarad", () => {
    expect(byggTabellsvar(config, {})).toBe("");
    expect(byggTabellsvar(config, { "1:1": "  " })).toBe("");
    expect(isBlank(byggTabellsvar(config, {}))).toBe(true);
  });

  it("bär rad- och kolumnrubriken och går att läsa tillbaka", () => {
    const v = byggTabellsvar(config, { "1:1": "Att adeln bestämde", "2:2": "Medborgare över 30" });
    expect(lasTabellsvar(v)).toEqual({ "1:1": "Att adeln bestämde", "2:2": "Medborgare över 30" });
    expect(formateraTabellsvar(v)).toBe(
      "Folkförsamlingen - Vilket problem skulle den lösa?: Att adeln bestämde\n" +
        "Rådet på 500 - Vem fick vara med?: Medborgare över 30"
    );
  });

  it("tas inte för ett sorteringssvar", () => {
    const v = byggTabellsvar(config, { "1:1": "x" });
    expect(formateraSorteringssvar(v)).toBeNull();
  });

  it("vanlig fritext är inget tabellsvar", () => {
    expect(formateraTabellsvar("Ett vanligt svar")).toBeNull();
    expect(lasTabellsvar("Ett vanligt svar")).toEqual({});
  });
});

describe("tabellfrågan i enkäten", () => {
  const fraga = toEnkatFraga({ id: 9, text: "Del 2: Spärrtabellen - Aten", type: "TABLE", config: CONFIG, options: [] });

  it("följer med till eleven", () => {
    expect(fraga.tabell?.kolumner).toHaveLength(3);
    expect(toEnkatFraga({ id: 9, text: "x", type: "TABLE", config: { kind: "tabell" }, options: [] }).tabell).toBeNull();
  });

  it("ritas som tabell med en skrivruta per tom cell", () => {
    const html = renderToStaticMarkup(
      createElement(QuestionRenderer, { questions: [fraga], answers: {}, onAnswer: () => {} })
    );
    expect(html).toContain("<table");
    expect(html).toContain("Folkförsamlingen");
    expect(html).toContain("<strong>s. 89</strong>");
    expect(html).toContain("Kungen avsätts");
    expect(html.indexOf("Kungen avsätts")).toBeGreaterThan(html.lastIndexOf("<textarea"));
    expect(html).toContain("<strong>Glöm inte</strong>");
    // 4 skrivrutor i tabellvyn + 4 i mobilvyn
    expect(html.match(/<textarea/g)).toHaveLength(8);
    expect(html).not.toContain("Skriv ditt svar...");
  });

  it("visar sparade rutor", () => {
    const config = parseTabellConfig(CONFIG)!;
    const html = renderToStaticMarkup(
      createElement(QuestionRenderer, {
        questions: [fraga],
        answers: { 9: byggTabellsvar(config, { "2:1": "Att någon tog makten" }) },
        onAnswer: () => {},
      })
    );
    expect(html).toContain("Att någon tog makten");
  });

  it("säger till om configen är trasig", () => {
    const trasig = toEnkatFraga({ id: 10, text: "x", type: "TABLE", config: null, options: [] });
    const html = renderToStaticMarkup(
      createElement(QuestionRenderer, { questions: [trasig], answers: {}, onAnswer: () => {} })
    );
    expect(html).toContain("felaktigt uppsatt");
    expect(html).not.toContain("<textarea");
  });
});
