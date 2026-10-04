import { describe, expect, it } from "vitest";
import { timelineConfigSchema } from "./tidslinje";
import {
  MAX_POANG,
  genereraRunda,
  klientItem,
  lasRunda,
  nyckel,
  poangForAvstand,
  poangOrdna,
  rattaItem,
  svarasteHandelser,
  tidslinjespelDataSchema,
  toleransFor,
  tolkaArtal,
  type TidslinjespelData,
} from "./tidslinjespel";

// Formad som hi1b: fem epoker, händelser i alla.
const HI1B: TidslinjespelData = tidslinjespelDataSchema.parse({
  epoker: [
    { namn: "Forntiden", fran: -13000, till: -3000 },
    { namn: "Antiken", fran: -3000, till: 476 },
    { namn: "Medeltiden", fran: 476, till: 1492 },
    { namn: "Tidigmodern tid", fran: 1492, till: 1789 },
    { namn: "Modern tid", fran: 1789, till: 2030 },
  ],
  handelser: [
    { ar: -10000, rubrik: "Jordbruksrevolutionen börjar", cirka: true, kommentar: "En process." },
    { ar: -3000, rubrik: "Skriften uppfinns", cirka: true },
    { ar: -509, rubrik: "Romerska republiken utropas" },
    { ar: -44, rubrik: "Caesar mördas" },
    { ar: 476, rubrik: "Västrom faller" },
    { ar: 800, rubrik: "Karl den store kröns" },
    { ar: 1066, rubrik: "Slaget vid Hastings" },
    { ar: 1347, rubrik: "Digerdöden" },
    { ar: 1492, rubrik: "Columbus når Amerika" },
    { ar: 1517, rubrik: "Reformationen" },
    { ar: 1648, rubrik: "Westfaliska freden" },
    { ar: 1789, rubrik: "Franska revolutionen" },
    { ar: 1914, rubrik: "Första världskriget", niva: 2 },
    { ar: 1945, rubrik: "Andra världskriget slutar" },
  ],
});

// Formad som israel-palestina: kort axel, två händelser samma år.
const IP: TidslinjespelData = tidslinjespelDataSchema.parse({
  epoker: [
    { namn: "Före 1948", fran: 1900, till: 1948 },
    { namn: "1948-1967", fran: 1948, till: 1967 },
    { namn: "Efter 1967", fran: 1967, till: 2030 },
  ],
  handelser: [
    { ar: 1917, rubrik: "Balfourdeklarationen" },
    { ar: 1947, rubrik: "FN:s delningsplan" },
    { ar: 1948, rubrik: "Israel utropas" },
    { ar: 1948, rubrik: "Nakba" },
    { ar: 1956, rubrik: "Suezkrisen" },
    { ar: 1967, rubrik: "Sexdagarskriget" },
    { ar: 1973, rubrik: "Oktoberkriget" },
    { ar: 1987, rubrik: "Första intifadan" },
    { ar: 1993, rubrik: "Osloavtalet" },
  ],
});

const SEEDS = Array.from({ length: 60 }, (_, i) => i * 7919 + 1);

describe("tidslinjespelDataSchema", () => {
  it("avvisar glapp mellan epoker", () => {
    const r = tidslinjespelDataSchema.safeParse({
      ...HI1B,
      epoker: [
        { namn: "A", fran: -100, till: 0 },
        { namn: "B", fran: 10, till: 2030 },
      ],
    });
    expect(r.success).toBe(false);
  });

  it("avvisar samma händelse två gånger", () => {
    const r = tidslinjespelDataSchema.safeParse({
      ...HI1B,
      handelser: [...HI1B.handelser, HI1B.handelser[3]],
    });
    expect(r.success).toBe(false);
  });

  it("avvisar för få händelser", () => {
    const r = tidslinjespelDataSchema.safeParse({ ...HI1B, handelser: HI1B.handelser.slice(0, 5) });
    expect(r.success).toBe(false);
  });
});

describe("genereraRunda", () => {
  it("ger samma omgång för samma seed", () => {
    expect(genereraRunda(HI1B, 42)).toEqual(genereraRunda(HI1B, 42));
    expect(genereraRunda(HI1B, 42)).not.toEqual(genereraRunda(HI1B, 43));
  });

  it.each([
    ["hi1b", HI1B],
    ["israel-palestina", IP],
  ])("ger fyra placera, tre skriv och tre ordna med giltiga configer (%s)", (_, data) => {
    for (const seed of SEEDS) {
      const items = genereraRunda(data, seed);
      const antal = (f: string) => items.filter((i) => i.form === f).length;
      expect(antal("placera")).toBe(4);
      expect(antal("skriv")).toBe(3);
      expect(antal("ordna")).toBe(3);
      for (const item of items) {
        expect(timelineConfigSchema.safeParse(item.config).success).toBe(true);
      }
      // Hela omgången överlever att sparas som JSON och läsas tillbaka.
      expect(lasRunda(JSON.parse(JSON.stringify(items)))).toEqual(items);
    }
  });

  it("upprepar inget mål bland placera och skriv", () => {
    for (const seed of SEEDS) {
      const mal = genereraRunda(HI1B, seed)
        .filter((i) => i.form !== "ordna")
        .map((i) => nyckel(i.config.mal[0]));
      expect(new Set(mal).size).toBe(mal.length);
    }
  });

  it("ger ordna-uppgifter med olika år och kort i fel ordning", () => {
    for (const seed of SEEDS) {
      for (const item of genereraRunda(IP, seed).filter((i) => i.form === "ordna")) {
        const ar = item.config.mal.map((m) => m.ar);
        expect(new Set(ar).size).toBe(ar.length);
        expect(item.visningsordning).not.toEqual(ar);
        expect([...(item.visningsordning ?? [])].sort((a, b) => a - b)).toEqual(ar);
      }
    }
  });

  it("lägger inget ankare på målets år", () => {
    for (const seed of SEEDS) {
      for (const item of genereraRunda(IP, seed).filter((i) => i.form !== "ordna")) {
        const mal = item.config.mal[0];
        expect(item.config.handelser.some((h) => h.ar === mal.ar)).toBe(false);
      }
    }
  });
});

describe("klientItem", () => {
  it("släpper inte igenom facit", () => {
    for (const seed of SEEDS.slice(0, 20)) {
      for (const item of genereraRunda(HI1B, seed)) {
        const ut = JSON.stringify(klientItem(item));
        expect(ut).not.toContain('"mal"');
        expect(ut).not.toContain("tolerans");
        expect(ut).not.toContain("kommentar");
        if (item.form === "skriv") {
          expect(ut).not.toMatch(/"ar"/);
        }
        if (item.form === "placera") {
          const mal = item.config.mal[0];
          expect(ut).not.toContain(`"ar":${mal.ar},`);
        }
        if (item.form === "ordna") {
          expect(ut).not.toMatch(/"ar"/);
        }
      }
    }
  });
});

describe("poäng", () => {
  it("ger fullt inom toleransen och sjunker sedan till noll", () => {
    expect(poangForAvstand(0, 10)).toBe(MAX_POANG);
    expect(poangForAvstand(10, 10)).toBe(MAX_POANG);
    expect(poangForAvstand(11, 10)).toBeLessThanOrEqual(80);
    expect(poangForAvstand(11, 10)).toBeGreaterThan(70);
    expect(poangForAvstand(30, 10)).toBeGreaterThan(0);
    expect(poangForAvstand(45, 10)).toBe(0);
    expect(poangForAvstand(1000, 10)).toBe(0);
  });

  it("ger delpoäng för en nästan rätt ordning", () => {
    expect(poangOrdna([1, 2, 3, 4], [1, 2, 3, 4])).toBe(100);
    expect(poangOrdna([2, 1, 3, 4], [1, 2, 3, 4])).toBe(83);
    expect(poangOrdna([4, 3, 2, 1], [1, 2, 3, 4])).toBe(0);
    expect(poangOrdna([1, 2], [1, 2, 3])).toBe(0);
  });

  it("ger större tolerans långt bak i tiden och för cirka-år", () => {
    expect(toleransFor(1945)).toBe(2);
    expect(toleransFor(-509)).toBe(75);
    expect(toleransFor(-509, true)).toBe(150);
    expect(toleransFor(1945, false, 400)).toBe(10);
  });
});

describe("tolkaArtal", () => {
  it.each([
    ["1066", 1066],
    ["1066 e.Kr.", 1066],
    ["ca 1066", 1066],
    ["509 f.Kr.", -509],
    ["509 f.kr", -509],
    ["509 fKr", -509],
    ["-509", -509],
    ["−509", -509],
    ["10 000 f.Kr.", -10000],
    [" 1945 ", 1945],
  ])("%s -> %s", (text, ar) => {
    expect(tolkaArtal(text)).toBe(ar);
  });

  it.each(["", "abc", "0", "1066-talet", "12.5"])("avvisar %j", (text) => {
    expect(tolkaArtal(text)).toBeNull();
  });
});

describe("rattaItem", () => {
  const items = genereraRunda(HI1B, 7);
  const placera = items.find((i) => i.form === "placera")!;
  const skriv = items.find((i) => i.form === "skriv")!;
  const ordna = items.find((i) => i.form === "ordna")!;

  it("rättar placera på avståndet", () => {
    const mal = placera.config.mal[0];
    const r = rattaItem(placera, { ar: mal.ar })!;
    expect(r.poang).toBe(MAX_POANG);
    expect(r.utfall).toBe("ratt");
    expect(rattaItem(placera, { ordning: [0, 1] })).toBeNull();
  });

  it("vidgar axeln för skriv så att elevens år syns", () => {
    const mal = skriv.config.mal[0];
    const langtBort = mal.ar > 0 ? -2000 : 1900;
    const r = rattaItem(skriv, { ar: langtBort })!;
    expect(r.utfall).toBe("fel");
    expect(r.poang).toBe(0);
    expect(r.visning.fran).toBeLessThanOrEqual(Math.min(langtBort, mal.ar));
    expect(r.visning.till).toBeGreaterThanOrEqual(Math.max(langtBort, mal.ar));
  });

  it("rättar ordna på kortens id", () => {
    const visning = ordna.visningsordning!;
    const facit = ordna.config.mal.map((m) => m.ar);
    const rattIds = facit.map((ar) => visning.indexOf(ar));
    expect(rattaItem(ordna, { ordning: rattIds })!.poang).toBe(MAX_POANG);
    expect(rattaItem(ordna, { ordning: [...rattIds].reverse() })!.poang).toBe(0);
    expect(rattaItem(ordna, { ordning: [0] })).toBeNull();
    expect(rattaItem(ordna, { ordning: rattIds.map(() => 0) })).toBeNull();
  });
});

describe("svarasteHandelser", () => {
  it("sorterar på snittpoäng och hoppar över ordna", () => {
    const a = genereraRunda(HI1B, 1).map((i) => ({ ...i, poang: i.form === "ordna" ? 0 : 50 }));
    const b = a.map((i, n) => ({ ...i, poang: n === 0 && i.form !== "ordna" ? 10 : i.poang }));
    const s = svarasteHandelser([a, b]);
    expect(s.length).toBe(7);
    expect(s.every((x) => x.forsok === 2)).toBe(true);
    if (a[0].form !== "ordna") expect(s[0].rubrik).toBe(a[0].config.mal[0].rubrik);
  });
});
