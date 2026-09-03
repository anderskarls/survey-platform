import { describe, expect, it } from "vitest";
import { optionCreateData, parseQuestionRow } from "./csv-question.js";

/**
 * Regressionsskydd för MCP-vägens CSV-parser.
 *
 * Buggklassen som täcks: en frågetyp utanför KNOWN_TYPES föll tyst igenom
 * till MULTIPLE_CHOICE och tappade config, subskill och exemplars - alltså
 * alternativlösa flervalsfrågor i en live-kurs, fullt synliga för eleven och
 * omöjliga att svara på. Det hände först för luckfrågorna och sedan igen för
 * SORTING. Nästa typ som läggs till hör hemma här innan den importeras.
 */

/** Sorteringsfacit i samma form som fragor/l3-kedjan.csv använder. */
const SORTING_CONFIG = {
  categories: ["Steg 1", "Steg 2", "Steg 3"],
  items: [
    { text: "Jordbruk", category: "Steg 1" },
    { text: "Överskott som går att lagra", category: "Steg 2" },
    { text: "Arbetsdelning", category: "Steg 3" },
  ],
};

const EXEMPLARS = [
  { level: "E", text: "Ett enkelt svar.", kommentar: "Nämner ett led." },
  { level: "C", text: "Ett utvecklat svar.", kommentar: "Binder ihop två led." },
];

function sortingRow(overrides: Record<string, string> = {}) {
  return {
    topic: "Lektion 3: Kedjan",
    type: "SORTING",
    text: "Lägg leden i rätt ordning, från jordbruk till stat.",
    subskill: "kedjor",
    config: JSON.stringify(SORTING_CONFIG),
    ...overrides,
  };
}

describe("parseQuestionRow - SORTING", () => {
  it("behåller typen i stället för att falla igenom till MULTIPLE_CHOICE", () => {
    const parsed = parseQuestionRow(sortingRow());
    expect(parsed?.type).toBe("SORTING");
    expect(parsed?.config).toEqual(SORTING_CONFIG);
    expect(parsed?.options).toEqual([]);
  });

  it("ger inga alternativ till databasen - en sortering är ingen flervalsfråga", () => {
    const parsed = parseQuestionRow(sortingRow())!;
    expect(optionCreateData(parsed)).toBeUndefined();
  });

  it("behåller angiven subskill", () => {
    expect(parseQuestionRow(sortingRow())?.subskill).toBe("kedjor");
  });

  it("faller tillbaka på kategorisera när subskill saknas", () => {
    const parsed = parseQuestionRow(sortingRow({ subskill: "" }));
    expect(parsed?.subskill).toBe("kategorisera");
  });

  it("kastar när config saknas - facit ligger där", () => {
    expect(() => parseQuestionRow(sortingRow({ config: "" }))).toThrow(
      /saknar config/
    );
  });

  it("kastar vid ogiltig JSON i config", () => {
    expect(() => parseQuestionRow(sortingRow({ config: "{trasig" }))).toThrow(
      /Ogiltig JSON/
    );
  });

  it("kastar när ett objekt har en kategori som inte finns i categories", () => {
    const config = {
      ...SORTING_CONFIG,
      items: [...SORTING_CONFIG.items, { text: "Stat", category: "Steg 9" }],
    };
    expect(() =>
      parseQuestionRow(sortingRow({ config: JSON.stringify(config) }))
    ).toThrow(/Steg 9/);
  });

  it("kastar vid färre än två kategorier", () => {
    const config = { categories: ["Enda"], items: SORTING_CONFIG.items };
    expect(() =>
      parseQuestionRow(sortingRow({ config: JSON.stringify(config) }))
    ).toThrow(/Ogiltig config/);
  });
});

describe("parseQuestionRow - exemplars", () => {
  it("läser exempelsvar i nivåer", () => {
    const parsed = parseQuestionRow({
      topic: "Lektion 3: Kedjan",
      type: "FREE_TEXT",
      text: "Motivera ditt osäkraste ordval.",
      exemplars: JSON.stringify(EXEMPLARS),
    });
    expect(parsed?.exemplars).toEqual(EXEMPLARS);
  });

  it("kastar vid ogiltig JSON i exemplars", () => {
    expect(() =>
      parseQuestionRow({
        type: "FREE_TEXT",
        text: "Motivera ditt osäkraste ordval.",
        exemplars: "[{trasig",
      })
    ).toThrow(/Ogiltig JSON i exemplars/);
  });

  it("kastar vid en nivå utanför E, C och A", () => {
    expect(() =>
      parseQuestionRow({
        type: "FREE_TEXT",
        text: "Motivera ditt osäkraste ordval.",
        exemplars: JSON.stringify([{ level: "B", text: "Ett svar." }]),
      })
    ).toThrow(/Ogiltiga exemplars/);
  });
});

describe("parseQuestionRow - subskill", () => {
  it("kastar vid okänd subskill i stället för att importera den", () => {
    expect(() => parseQuestionRow(sortingRow({ subskill: "gissa" }))).toThrow(
      /Okänd subskill/
    );
  });

  it("normaliserar versaler", () => {
    expect(parseQuestionRow(sortingRow({ subskill: "Kedjor" }))?.subskill).toBe(
      "kedjor"
    );
  });
});

describe("parseQuestionRow - övriga typer opåverkade", () => {
  it("läser flervalsfrågan med alternativ och facit", () => {
    const parsed = parseQuestionRow({
      topic: "Lektion 3: Öppning",
      type: "MULTIPLE_CHOICE",
      text: "Vad kom först?",
      option1: "Jordbruket",
      option2: "Staten",
      correctAnswer: "Jordbruket",
    })!;
    expect(parsed.type).toBe("MULTIPLE_CHOICE");
    expect(parsed.options).toEqual(["Jordbruket", "Staten"]);
    expect(parsed.subskill).toBeUndefined();
    expect(optionCreateData(parsed)).toEqual({
      create: [
        { text: "Jordbruket", isCorrect: true },
        { text: "Staten", isCorrect: false },
      ],
    });
  });

  it("kastar för luckfrågan utan facit", () => {
    expect(() =>
      parseQuestionRow({
        type: "CLOZE",
        text: "Jordbruket gav ett ___ som gick att lagra.",
        config: "{}",
      })
    ).toThrow(/saknar facit/);
  });

  it("kastar för luckfrågan utan markör i texten", () => {
    expect(() =>
      parseQuestionRow({
        type: "CLOZE",
        text: "Jordbruket gav ett överskott.",
        config: JSON.stringify({ answer: "överskott" }),
      })
    ).toThrow(/saknar markören/);
  });

  it("okänd typ blir fortfarande flervalsfråga", () => {
    const parsed = parseQuestionRow({
      type: "TIDSLINJE",
      text: "En typ som inte finns än.",
      option1: "Ett alternativ",
    });
    expect(parsed?.type).toBe("MULTIPLE_CHOICE");
  });

  it("hoppar över rader utan frågetext", () => {
    expect(parseQuestionRow({ type: "SORTING", text: "   " })).toBeNull();
  });

  it("lägger frågor utan topic i Övrigt", () => {
    expect(parseQuestionRow({ type: "FREE_TEXT", text: "En fråga." })?.topicName).toBe(
      "Övrigt"
    );
  });
});
