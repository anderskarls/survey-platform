import { describe, expect, it } from "vitest";
import { lattlastText, medLattlast, visarLattlast } from "./lattlast";
import { parseCsvContent, questionCreateData, validateCsvRows } from "./csv";
import { toEnkatFraga } from "./enkatfraga";

/**
 * Lättläst formulering: en fråga kan ha en andra, lättläst frågetext som eleven
 * slår på. Det som måste hålla: den följer med från CSV till config till
 * eleven, den rör aldrig typens egen konfiguration (sorteringens facit), och
 * den visas aldrig för luckor och kort, där meningen är själva uppgiften.
 */

const SORTING = {
  categories: ["Antiken", "Medeltiden"],
  items: [
    { text: "Caesar mördas", category: "Antiken" },
    { text: "Västrom faller", category: "Antiken" },
  ],
};

describe("lattlastText och medLattlast", () => {
  it("läser formuleringen ur config och ignorerar tomt och fel typ", () => {
    expect(lattlastText({ lattlast: "  Varför föll Rom?  " })).toBe("Varför föll Rom?");
    expect(lattlastText({ lattlast: "  " })).toBeNull();
    expect(lattlastText({ lattlast: 3 })).toBeNull();
    expect(lattlastText(null)).toBeNull();
    expect(lattlastText(["lattlast"])).toBeNull();
  });

  it("lägger formuleringen bredvid typens config utan att röra den", () => {
    expect(medLattlast(SORTING, "Sortera.")).toEqual({ ...SORTING, lattlast: "Sortera." });
    expect(medLattlast(undefined, "Varför?")).toEqual({ lattlast: "Varför?" });
    expect(medLattlast(SORTING, undefined)).toBe(SORTING);
    expect(medLattlast(undefined, undefined)).toBeUndefined();
  });

  it("gäller inte luckor och kort", () => {
    expect(visarLattlast("MULTIPLE_CHOICE")).toBe(true);
    expect(visarLattlast("FREE_TEXT")).toBe(true);
    expect(visarLattlast("CLOZE")).toBe(false);
    expect(visarLattlast("CLOZE_CARD")).toBe(false);
    expect(visarLattlast("CONCEPT_CARD")).toBe(false);
  });
});

describe("kolumnen lattlast i CSV-importen", () => {
  const CSV = `topic,type,text,option1,option2,correctAnswer,config,lattlast
Rom,MULTIPLE_CHOICE,Vilken faktor var avgörande för republikens fall?,Arméns lojalitet mot fältherrarna,Senatens storlek,Arméns lojalitet mot fältherrarna,,Varför tog republiken slut? Vad var viktigast?
Rom,FREE_TEXT,Resonera om orsakerna till republikens fall.,,,,,
Rom,SORTING,Placera händelserna i rätt epok,,,,"${JSON.stringify(SORTING).replace(/"/g, '""')}",Sortera händelserna. Hände de under antiken eller medeltiden?
`;

  it("flervalsfrågan får formuleringen som hela sin config, alternativen orörda", () => {
    const [mc] = parseCsvContent(CSV);
    expect(mc.lattlast).toBe("Varför tog republiken slut? Vad var viktigast?");
    const data = questionCreateData(mc);
    expect(data.config).toEqual({ lattlast: "Varför tog republiken slut? Vad var viktigast?" });
    expect(data.options?.create).toHaveLength(2);
  });

  it("en rad utan formulering får ingen config", () => {
    const fritext = parseCsvContent(CSV)[1];
    expect(fritext.lattlast).toBeUndefined();
    expect(questionCreateData(fritext).config).toBeUndefined();
  });

  it("sorteringsfrågan behåller sitt facit bredvid formuleringen", () => {
    const sortering = parseCsvContent(CSV)[2];
    expect(validateCsvRows([sortering])).toEqual([]);
    expect(questionCreateData(sortering).config).toEqual({
      ...SORTING,
      lattlast: "Sortera händelserna. Hände de under antiken eller medeltiden?",
    });
  });

  it("avvisar formulering på en luckfråga och en som är för lång", () => {
    const rader = parseCsvContent(`topic,type,text,config,lattlast
Glosor,CLOZE,I ___ the book,"{""answer"":""read""}",Skriv ordet
Rom,FREE_TEXT,Förklara.,,${"x".repeat(1001)}
`);
    const fel = validateCsvRows(rader);
    expect(fel.some((f) => f.includes("ingen lättläst formulering"))).toBe(true);
    expect(fel.some((f) => f.includes("längre än 1000 tecken"))).toBe(true);
  });
});

describe("toEnkatFraga och den lättlästa formuleringen", () => {
  const db = (type: string, config: unknown) => ({
    id: 1,
    text: "Vilken faktor var avgörande?",
    type,
    config,
    options: [
      { text: "Armén", isCorrect: true },
      { text: "Senaten", isCorrect: false },
    ],
  });

  it("skickar med formuleringen till eleven", () => {
    expect(toEnkatFraga(db("MULTIPLE_CHOICE", { lattlast: "Vad var viktigast?" })).lattlast).toBe("Vad var viktigast?");
    expect(toEnkatFraga(db("MULTIPLE_CHOICE", null)).lattlast).toBeNull();
  });

  it("sorteringsfrågan läses som vanligt med formuleringen i configen", () => {
    const f = toEnkatFraga(db("SORTING", { ...SORTING, lattlast: "Sortera." }));
    expect(f.lattlast).toBe("Sortera.");
    expect(f.sorting?.categories).toEqual(SORTING.categories);
  });

  it("visar den inte när flervalsfrågan är ett kort (flashcardläge) eller en lucka", () => {
    expect(toEnkatFraga(db("MULTIPLE_CHOICE", { lattlast: "Vad?" }), true).lattlast).toBeNull();
    expect(toEnkatFraga(db("CLOZE", { answer: "x", lattlast: "Vad?" })).lattlast).toBeNull();
  });
});
