import { describe, expect, it } from "vitest";
import {
  exemplarsSchema,
  gradeSorting,
  sortingConfigSchema,
  stripSortingFacit,
  type SortingConfig,
} from "./formaga";
import { parseCsvContent, validateCsvRows, questionCreateData } from "./csv";

const CONFIG: SortingConfig = {
  categories: ["Utlösande", "Underliggande"],
  items: [
    { text: "Skotten i Sarajevo", category: "Utlösande" },
    { text: "Allianssystemet", category: "Underliggande" },
    { text: "Kapprustningen", category: "Underliggande" },
  ],
};

describe("sortingConfigSchema", () => {
  it("accepterar giltig konfiguration", () => {
    expect(sortingConfigSchema.safeParse(CONFIG).success).toBe(true);
  });

  it("avvisar item med kategori utanför categories", () => {
    const bad = {
      ...CONFIG,
      items: [...CONFIG.items, { text: "Nationalismen", category: "Okänd" }],
    };
    const result = sortingConfigSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("avvisar färre än två kategorier", () => {
    const bad = { categories: ["Ensam"], items: CONFIG.items };
    expect(sortingConfigSchema.safeParse(bad).success).toBe(false);
  });
});

describe("gradeSorting", () => {
  it("rättar alla placeringar korrekt", () => {
    const result = gradeSorting(CONFIG, {
      "Skotten i Sarajevo": "Utlösande",
      Allianssystemet: "Underliggande",
      Kapprustningen: "Underliggande",
    });
    expect(result.allCorrect).toBe(true);
    expect(result.correctCount).toBe(3);
    expect(result.total).toBe(3);
  });

  it("markerar fel placering med rätt facit", () => {
    const result = gradeSorting(CONFIG, {
      "Skotten i Sarajevo": "Underliggande",
      Allianssystemet: "Underliggande",
      Kapprustningen: "Underliggande",
    });
    expect(result.allCorrect).toBe(false);
    expect(result.correctCount).toBe(2);
    const missed = result.perItem.find((i) => i.text === "Skotten i Sarajevo");
    expect(missed?.isCorrect).toBe(false);
    expect(missed?.correct).toBe("Utlösande");
  });

  it("räknar oplacerade items som fel", () => {
    const result = gradeSorting(CONFIG, {
      "Skotten i Sarajevo": "Utlösande",
    });
    expect(result.correctCount).toBe(1);
    expect(result.perItem.find((i) => i.text === "Allianssystemet")?.chosen).toBe(
      null
    );
  });
});

describe("stripSortingFacit", () => {
  it("tar bort kategorifacit ur klientkonfigurationen", () => {
    const stripped = stripSortingFacit(CONFIG);
    expect(stripped.items).toEqual([
      "Skotten i Sarajevo",
      "Allianssystemet",
      "Kapprustningen",
    ]);
    expect(JSON.stringify(stripped)).not.toContain('"category"');
  });
});

describe("exemplarsSchema", () => {
  it("accepterar exempelsvar i tre nivåer", () => {
    const result = exemplarsSchema.safeParse([
      { level: "E", text: "Enkelt svar", kommentar: "Saknar mekanism" },
      { level: "C", text: "Utvecklat svar", kommentar: "Mekanism i varje led" },
      { level: "A", text: "Nyanserat svar", kommentar: "Kalibrerad styrka" },
    ]);
    expect(result.success).toBe(true);
  });

  it("avvisar okänd nivå", () => {
    expect(
      exemplarsSchema.safeParse([{ level: "B", text: "x", kommentar: "" }])
        .success
    ).toBe(false);
  });
});

describe("CSV med förmågefält", () => {
  const header = "topic,type,text,subskill,config,exemplars";
  const sortingConfig = JSON.stringify(CONFIG).replace(/"/g, '""');
  const exemplars = JSON.stringify([
    { level: "E", text: "svar", kommentar: "k" },
  ]).replace(/"/g, '""');

  it("parsar SORTING-rad med config och exemplars", () => {
    const csv = `${header}\nVärldskrigen,SORTING,Sortera orsakerna,kategorisera,"${sortingConfig}","${exemplars}"`;
    const rows = parseCsvContent(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe("SORTING");
    expect(rows[0].subskill).toBe("kategorisera");
    expect(validateCsvRows(rows)).toEqual([]);
    const data = questionCreateData(rows[0]);
    expect(data.subskill).toBe("kategorisera");
    expect(data.config).toEqual(CONFIG);
  });

  it("sätter kategorisera som default-delfärdighet för SORTING", () => {
    const csv = `topic,type,text,config\nVärldskrigen,SORTING,Sortera orsakerna,"${sortingConfig}"`;
    const rows = parseCsvContent(csv);
    expect(questionCreateData(rows[0]).subskill).toBe("kategorisera");
  });

  it("avvisar trasig JSON i config i stället för att tappa raden tyst", () => {
    const csv = `${header}\nVärldskrigen,SORTING,Sortera orsakerna,kategorisera,"{trasig",""`;
    const rows = parseCsvContent(csv);
    expect(rows).toHaveLength(1);
    const errors = validateCsvRows(rows);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain("Ogiltig JSON");
  });

  it("avvisar okänd delfärdighet", () => {
    const csv = `topic,type,text,subskill\nVärldskrigen,FREE_TEXT,Bygg en kedja,felstavat`;
    const errors = validateCsvRows(parseCsvContent(csv));
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain("Okänd delfärdighet");
  });

  it("hanterar vanliga flervalsrader som tidigare", () => {
    const csv = `topic,type,text,option1,option2,correctAnswer\nMatematik,MULTIPLE_CHOICE,Vad är 2+2?,3,4,4`;
    const rows = parseCsvContent(csv);
    expect(validateCsvRows(rows)).toEqual([]);
    const data = questionCreateData(rows[0]);
    expect(data.type).toBe("MULTIPLE_CHOICE");
    expect(data.subskill).toBeUndefined();
  });
});
