import { describe, it, expect } from "vitest";
import { toPracticeQuestion } from "./practice-question";
import {
  CLOZE_GAP,
  toClientClozeConfig,
  clozeConfigSchema,
  editDistance,
  fillGap,
  gradeCloze,
  hasGap,
  isClozeType,
  normalizeCloze,
  parseClozeConfig,
  splitAtGap,
  type ClozeConfig,
} from "./cloze";

function config(over: Partial<ClozeConfig> = {}): ClozeConfig {
  return clozeConfigSchema.parse({ answer: "influence", ...over });
}

describe("normalizeCloze", () => {
  it("tar bort versaler, kantblanksteg och dubbla mellanslag", () => {
    expect(normalizeCloze("  Influence  ")).toBe("influence");
    expect(normalizeCloze("take   care")).toBe("take care");
  });

  it("normaliserar mobilens krusiga apostrofer", () => {
    expect(normalizeCloze("don’t")).toBe("don't");
  });

  it("rör inte bokstäverna", () => {
    expect(normalizeCloze("recieve")).toBe("recieve");
  });
});

describe("gradeCloze", () => {
  it("godkänner exakt svar oavsett versaler", () => {
    expect(gradeCloze("Influence", config()).isCorrect).toBe(true);
  });

  it("godkänner en angiven variantstavning", () => {
    const c = config({ answer: "behavior", accept: ["behaviour"] });
    expect(gradeCloze("behaviour", c).isCorrect).toBe(true);
  });

  it("underkänner felstavning men flaggar den som nära-miss", () => {
    const v = gradeCloze("influense", config());
    expect(v.isCorrect).toBe(false);
    expect(v.nearMiss).toBe(true);
    expect(v.answer).toBe("influence");
  });

  it("underkänner ett helt annat ord utan att kalla det nästan", () => {
    const v = gradeCloze("behaviour", config());
    expect(v.isCorrect).toBe(false);
    expect(v.nearMiss).toBe(false);
  });

  it("kallar inte tomt svar för nästan", () => {
    const v = gradeCloze("   ", config());
    expect(v.isCorrect).toBe(false);
    expect(v.nearMiss).toBe(false);
  });

  it("håller korta ord hårt - ett fel på fyra bokstäver är inte nästan-samma-ord", () => {
    // "cost" mot "cast" är en bokstav, och tröskeln för fyra bokstäver är 1.
    expect(gradeCloze("cast", config({ answer: "cost" })).nearMiss).toBe(true);
    // Två fel på ett kort ord är ett annat ord.
    expect(gradeCloze("case", config({ answer: "cost" })).nearMiss).toBe(false);
  });

  it("mäter nära-miss mot närmaste accepterade variant", () => {
    const c = config({ answer: "behavior", accept: ["behaviour"] });
    const v = gradeCloze("behavour", c);
    expect(v.isCorrect).toBe(false);
    expect(v.nearMiss).toBe(true);
  });
});

describe("splitAtGap", () => {
  it("delar meningen vid markören", () => {
    const { before, after } = splitAtGap(`Her ${CLOZE_GAP} on me was huge.`);
    expect(before).toBe("Her ");
    expect(after).toBe(" on me was huge.");
  });

  it("lägger luckan sist om markören saknas", () => {
    const { before, after } = splitAtGap("Ingen markör här");
    expect(before).toBe("Ingen markör här");
    expect(after).toBe("");
    expect(hasGap("Ingen markör här")).toBe(false);
  });
});

describe("parseClozeConfig", () => {
  it("returnerar null för trasig config i stället för att kasta", () => {
    expect(parseClozeConfig(null)).toBeNull();
    expect(parseClozeConfig({ hint: "utan facit" })).toBeNull();
  });

  it("läser facit, varianter och ledtråd", () => {
    const c = parseClozeConfig({
      answer: " influence ",
      accept: ["influences"],
      hint: "Inflytande / Påverkan",
    });
    expect(c?.answer).toBe("influence");
    expect(c?.accept).toEqual(["influences"]);
    expect(c?.hint).toBe("Inflytande / Påverkan");
  });
});

describe("editDistance", () => {
  it("räknar insättning, borttagning och byte", () => {
    expect(editDistance("kitten", "sitting")).toBe(3);
    expect(editDistance("", "abc")).toBe(3);
    expect(editDistance("abc", "abc")).toBe(0);
  });
});

describe("configen som når klienten", () => {
  const raw = {
    answer: "influence",
    accept: ["influences"],
    hint: "Inflytande / Påverkan",
  };

  it("skickar ledtråden men aldrig facit", () => {
    const client = toClientClozeConfig("CLOZE", raw);
    expect(client).toEqual({ hint: "Inflytande / Påverkan" });
    expect(JSON.stringify(client)).not.toContain("influence");
  });

  it("ger null för andra frågetyper och för trasig config", () => {
    expect(toClientClozeConfig("MULTIPLE_CHOICE", raw)).toBeNull();
    expect(toClientClozeConfig("CLOZE", { hint: "utan facit" })).toBeNull();
  });

  it("läcker inte facit till övningsläget", () => {
    const q = toPracticeQuestion(
      {
        id: 1,
        text: "Her ___ was obvious.",
        type: "CLOZE",
        config: raw,
        options: [],
      },
      null,
      true
    );
    expect(q).not.toBeNull();
    // Kortläget gäller bara flerval - luckan förblir en lucka
    expect(q!.flashcard).toBe(false);
    expect(q!.cloze).toEqual({ hint: "Inflytande / Påverkan" });
    expect(JSON.stringify(q)).not.toContain("influence");
  });
});

describe("luckmeningskortet (CLOZE_CARD)", () => {
  const text = "Her ___ on the whole group was obvious.";

  it("räknas som en luckform, till skillnad från flerval", () => {
    expect(isClozeType("CLOZE")).toBe(true);
    expect(isClozeType("CLOZE_CARD")).toBe(true);
    expect(isClozeType("MULTIPLE_CHOICE")).toBe(false);
  });

  it("fyller luckan utan att sätta ihop meningen till en sträng", () => {
    expect(fillGap(text, "influence")).toEqual({
      before: "Her ",
      answer: "influence",
      after: " on the whole group was obvious.",
    });
  });

  it("lägger ordet sist när markören saknas - meningen går inte förlorad", () => {
    expect(fillGap("Ingen markör här.", "influence")).toEqual({
      before: "Ingen markör här.",
      answer: "influence",
      after: "",
    });
  });

  it("skickar ledtråden men aldrig facit till klienten", () => {
    const config = { answer: "influence", hint: "Inflytande / Påverkan" };
    const client = toClientClozeConfig("CLOZE_CARD", config);
    expect(client).toEqual({ hint: "Inflytande / Påverkan" });
    expect(JSON.stringify(client)).not.toContain("influence");
  });

  it("blir ett kort i övningen även utan flashcardläge på kursen", () => {
    const q = toPracticeQuestion(
      {
        id: 11,
        text,
        type: "CLOZE_CARD",
        config: { answer: "influence" },
        options: [],
      },
      null,
      false
    );
    expect(q).not.toBeNull();
    expect(q!.flashcard).toBe(true);
    // Baksidan hämtas först när kortet vänds - den får inte ligga i sidan
    expect(JSON.stringify(q)).not.toContain("influence");
  });
});
