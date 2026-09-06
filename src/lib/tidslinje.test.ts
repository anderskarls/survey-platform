import { describe, expect, it } from "vitest";
import {
  epokFor,
  formatAr,
  gradeTimeline,
  stripTimelineFacit,
  timelineConfigSchema,
  type TimelineConfig,
} from "./tidslinje";

const EPOKER = [
  { namn: "Antiken", fran: -800, till: 500 },
  { namn: "Medeltiden", fran: 500, till: 1500 },
];

const HANDELSER = [
  { ar: -509, rubrik: "Romerska republiken utropas" },
  { ar: -338, rubrik: "Filip II besegrar de grekiska stadsstaterna" },
  { ar: -44, rubrik: "Caesar mördas" },
  { ar: 476, rubrik: "Västroms siste kejsare avsätts" },
];

const PLACERA: TimelineConfig = {
  form: "placera",
  fran: -520,
  till: 500,
  epoker: EPOKER,
  handelser: HANDELSER,
  ankare: ["Filip II besegrar de grekiska stadsstaterna", "Västroms siste kejsare avsätts"],
  mal: [{ ar: -27, rubrik: "Augustus blir ensam härskare", kommentar: "Kejsartiden börjar." }],
  tolerans: 31,
};

describe("timelineConfigSchema", () => {
  it("accepterar en placera-fråga", () => {
    expect(timelineConfigSchema.safeParse(PLACERA).success).toBe(true);
  });

  it("avvisar placera vars mål ligger bland prickarna - det avslöjar svaret", () => {
    const bad = { ...PLACERA, handelser: [...HANDELSER, { ar: -27, rubrik: "Augustus blir ensam härskare" }] };
    expect(timelineConfigSchema.safeParse(bad).success).toBe(false);
  });

  it("avvisar placera utan tolerans", () => {
    const { tolerans: _t, ...utan } = PLACERA;
    void _t;
    expect(timelineConfigSchema.safeParse(utan).success).toBe(false);
  });

  it("avvisar peka vars mål inte är en prick", () => {
    const bad = { ...PLACERA, form: "peka", mal: [{ ar: -27, rubrik: "Augustus blir ensam härskare" }] };
    expect(timelineConfigSchema.safeParse(bad).success).toBe(false);
  });

  it("avvisar ankare som inte finns bland prickarna", () => {
    const bad = { ...PLACERA, ankare: ["Okänd händelse"] };
    expect(timelineConfigSchema.safeParse(bad).success).toBe(false);
  });

  it("avvisar epok utan epoker", () => {
    const bad = { ...PLACERA, form: "epok", epoker: [], tolerans: undefined };
    expect(timelineConfigSchema.safeParse(bad).success).toBe(false);
  });

  it("avvisar peka med två prickar på samma år", () => {
    const bad = {
      ...PLACERA,
      form: "peka",
      handelser: [...HANDELSER, { ar: -44, rubrik: "Något annat samma år" }],
      mal: [{ ar: -44, rubrik: "Caesar mördas" }],
    };
    expect(timelineConfigSchema.safeParse(bad).success).toBe(false);
  });
});

describe("stripTimelineFacit", () => {
  it("tar bort målet och alla rubriker utom ankarnas", () => {
    const klient = stripTimelineFacit(PLACERA);
    expect(JSON.stringify(klient)).not.toContain("Augustus");
    expect(JSON.stringify(klient)).not.toContain("Caesar");
    expect(klient.handelser.find((h) => h.ar === -338)?.etikett).toBe(
      "Filip II besegrar de grekiska stadsstaterna"
    );
    expect(klient.handelser.find((h) => h.ar === -44)?.etikett).toBeNull();
    expect(klient.antal).toBe(1);
  });

  it("sorterar prickarna på år och sätter antal för ordna", () => {
    const ordna: TimelineConfig = {
      ...PLACERA,
      form: "ordna",
      tolerans: undefined,
      handelser: [HANDELSER[2], HANDELSER[0], HANDELSER[3]],
      ankare: [],
      mal: [HANDELSER[0], HANDELSER[2], HANDELSER[3]],
    };
    const klient = stripTimelineFacit(ordna);
    expect(klient.handelser.map((h) => h.ar)).toEqual([-509, -44, 476]);
    expect(klient.antal).toBe(3);
  });
});

describe("gradeTimeline placera", () => {
  it("rätt inom toleransen", () => {
    const r = gradeTimeline(PLACERA, { ar: -50 });
    expect(r.utfall).toBe("ratt");
    expect(r.isCorrect).toBe(true);
    expect(r.avstand).toBe(23);
    expect(r.mal[0].kommentar).toBe("Kejsartiden börjar.");
  });

  it("nära inom tre toleranser men räknas som fel", () => {
    const r = gradeTimeline(PLACERA, { ar: -100 });
    expect(r.utfall).toBe("nara");
    expect(r.isCorrect).toBe(false);
  });

  it("fel längre bort, och utan år", () => {
    expect(gradeTimeline(PLACERA, { ar: 300 }).utfall).toBe("fel");
    expect(gradeTimeline(PLACERA, {}).utfall).toBe("fel");
  });
});

describe("gradeTimeline epok", () => {
  const EPOK: TimelineConfig = {
    ...PLACERA,
    form: "epok",
    tolerans: undefined,
    mal: [{ ar: 622, rubrik: "Muhammed lämnar Mekka" }],
    till: 800,
  };
  it("rättas på epoken klicket hamnar i, gränsen hör till nästa epok", () => {
    expect(gradeTimeline(EPOK, { ar: 500 }).isCorrect).toBe(true);
    expect(gradeTimeline(EPOK, { ar: 499 }).isCorrect).toBe(false);
    const r = gradeTimeline(EPOK, { ar: 100 });
    expect(r.epokVald).toBe("Antiken");
    expect(r.epokRatt).toBe("Medeltiden");
  });
});

describe("gradeTimeline peka", () => {
  const PEKA: TimelineConfig = {
    ...PLACERA,
    form: "peka",
    tolerans: undefined,
    ankare: [],
    mal: [{ ar: -44, rubrik: "Caesar mördas" }],
  };
  it("avslöjar vilken prick eleven valde när det blev fel", () => {
    const r = gradeTimeline(PEKA, { ar: -338 });
    expect(r.isCorrect).toBe(false);
    expect(r.klickad?.rubrik).toBe("Filip II besegrar de grekiska stadsstaterna");
    expect(gradeTimeline(PEKA, { ar: -44 }).isCorrect).toBe(true);
  });
});

describe("gradeTimeline ordna", () => {
  const ORDNA: TimelineConfig = {
    ...PLACERA,
    form: "ordna",
    tolerans: undefined,
    ankare: [],
    mal: [HANDELSER[0], HANDELSER[2], HANDELSER[3]],
  };
  it("rätt bara när hela följden stämmer, annars antal på rätt plats", () => {
    expect(gradeTimeline(ORDNA, { ordning: [-509, -44, 476] }).isCorrect).toBe(true);
    const r = gradeTimeline(ORDNA, { ordning: [-509, 476, -44] });
    expect(r.isCorrect).toBe(false);
    expect(r.rattPlats).toBe(1);
    expect(r.ordning?.map((o) => o.ratt)).toEqual([true, false, false]);
    expect(r.ordning?.[1].rubrik).toBe("Västroms siste kejsare avsätts");
  });

  it("ofullständig följd är fel", () => {
    expect(gradeTimeline(ORDNA, { ordning: [-509] }).isCorrect).toBe(false);
  });
});

describe("hjälpare", () => {
  it("formaterar år före Kristus och cirka", () => {
    expect(formatAr(-509)).toBe("509 f.Kr.");
    expect(formatAr(1066)).toBe("1066");
    expect(formatAr(1252, true)).toBe("ca 1252");
  });
  it("epokFor ger null före första epoken", () => {
    expect(epokFor(-900, EPOKER)).toBeNull();
    expect(epokFor(1500, EPOKER)).toBe("Medeltiden");
  });
});
