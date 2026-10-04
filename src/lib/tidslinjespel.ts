import { z } from "zod";
import { shuffle } from "./shuffle";
import {
  NARA_FAKTOR,
  epokFor,
  epokSchema,
  gradeTimeline,
  handelseSchema,
  stripTimelineFacit,
  timelineConfigSchema,
  type ClientTimelineConfig,
  type TimelineConfig,
  type TimelineEpok,
  type TimelineResult,
  type TimelineUtfall,
} from "./tidslinje";

/**
 * Tidslinjespelet: ett fristående spel där eleven spelar omgångar mot hela
 * tidslinjekorpusen för sin kurs, i stället för att möta enstaka
 * tidslinjefrågor i ett quiz.
 *
 * Korpusen kommer från tidslinjerepots `spel.py` (samma CSV-filer som
 * tidslinjen ritas ur) och laddas upp med `scripts/ladda-tidslinjespel.mts`.
 * En omgång är tio uppgifter i tre former:
 *
 *   placera  tryck på axeln där händelsen hör hemma (tidslinjefrågans placera)
 *   skriv    skriv årtalet
 *   ordna    sätt två till fyra händelser i kronologisk ordning
 *
 * Omgången genereras och rättas på servern. Facit ligger i omgångsraden
 * (TimelineGameRound.items) och lämnar servern först i svaret på en uppgift -
 * klienten får bara det klientItem() släpper igenom. Varje uppgift sparar en
 * egen kopia av facit, så att en senare ändring i korpusen inte ändrar gamla
 * resultat.
 *
 * Allt här är rena funktioner utan I/O; slumpen kommer från en seed så att
 * samma seed ger samma omgång.
 */

export const SPEL_FORMER = ["placera", "skriv", "ordna"] as const;
export type SpelForm = (typeof SPEL_FORMER)[number];

/** Poäng för en uppgift med fullt rätt svar. */
export const MAX_POANG = 100;
/** Högsta poäng för ett svar utanför toleransen. Rätt ska kännas som rätt. */
const NARA_TAK = 80;
/** Färre händelser än så här räcker inte till en omgång med unika mål. */
export const MIN_HANDELSER = 8;

const ANTAL_PLACERA = 4;
const ANTAL_SKRIV = 3;
const ORDNA_STORLEKAR = [2, 3, 4];

// --- Korpusen ---------------------------------------------------------------

export const spelHandelseSchema = handelseSchema.extend({
  spar: z.string().max(60).optional(),
  /** 1 = alltid synlig i tidslinjen, 2 = bara i inzoomade vyer. Lottas mer sällan. */
  niva: z.union([z.literal(1), z.literal(2)]).default(1),
  kommentar: z.string().max(500).optional(),
});
export type SpelHandelse = z.infer<typeof spelHandelseSchema>;

export function nyckel(h: { ar: number; rubrik: string }): string {
  return `${h.ar}|${h.rubrik}`;
}

export const tidslinjespelDataSchema = z
  .object({
    epoker: z.array(epokSchema).min(1).max(12),
    handelser: z.array(spelHandelseSchema).min(MIN_HANDELSER).max(1000),
  })
  .superRefine((d, ctx) => {
    const fel = (message: string) => ctx.addIssue({ code: "custom", message });
    // Epokerna ska ligga kant i kant, precis som tidslinjens bygg.py kräver.
    // Ett glapp skulle ge händelser utan epok och därmed utan fönster.
    const epoker = [...d.epoker].sort((a, b) => a.fran - b.fran);
    for (const [i, e] of epoker.entries()) {
      if (e.till <= e.fran) fel(`Epoken ${e.namn} slutar innan den börjar`);
      const nasta = epoker[i + 1];
      if (nasta && nasta.fran !== e.till) {
        fel(`Glapp eller överlapp mellan ${e.namn} och ${nasta.namn}`);
      }
    }
    const sedda = new Set<string>();
    const forst = epoker[0]?.fran ?? 0;
    const sist = epoker[epoker.length - 1]?.till ?? 0;
    for (const h of d.handelser) {
      const k = nyckel(h);
      if (sedda.has(k)) fel(`Händelsen "${h.rubrik}" (${h.ar}) finns två gånger`);
      sedda.add(k);
      if (h.ar < forst || h.ar >= sist) {
        fel(`Händelsen "${h.rubrik}" (${h.ar}) ligger utanför epokerna`);
      }
    }
  });
export type TidslinjespelData = z.infer<typeof tidslinjespelDataSchema>;

// --- Omgången som den sparas -------------------------------------------------

export const spelSvarSchema = z.object({
  ar: z.number().int().min(-100000).max(100000).optional(),
  /** ordna: kortens id i den ordning eleven valde dem, äldst först. */
  ordning: z.array(z.number().int().min(0).max(7)).max(8).optional(),
});
export type SpelSvar = z.infer<typeof spelSvarSchema>;

const utfallSchema = z.enum(["ratt", "nara", "fel"]);

export const rundaItemSchema = z.object({
  form: z.enum(SPEL_FORMER),
  /** Facit och axel. placera och skriv: en placera-config; ordna: en ordna-config. */
  config: timelineConfigSchema,
  /** ordna: korten i den ordning de visas, som år (åren är unika i uppgiften). */
  visningsordning: z.array(z.number().int()).optional(),
  svar: spelSvarSchema.optional(),
  poang: z.number().int().min(0).max(MAX_POANG).optional(),
  utfall: utfallSchema.optional(),
});
export type RundaItem = z.infer<typeof rundaItemSchema>;

export function lasRunda(items: unknown): RundaItem[] {
  return z.array(rundaItemSchema).parse(items);
}

// --- Det klienten får se ----------------------------------------------------

export type KlientItem =
  | { form: "placera"; rubrik: string; config: ClientTimelineConfig }
  | { form: "skriv"; rubrik: string }
  | { form: "ordna"; kort: { id: number; rubrik: string }[] };

/** Uppgiften utan facit. Det enda av en uppgift som får lämna servern före svar. */
export function klientItem(item: RundaItem): KlientItem {
  const mal = item.config.mal[0];
  if (item.form === "placera") {
    return { form: "placera", rubrik: mal.rubrik, config: stripTimelineFacit(item.config) };
  }
  if (item.form === "skriv") return { form: "skriv", rubrik: mal.rubrik };
  return {
    form: "ordna",
    kort: (item.visningsordning ?? []).map((ar, id) => ({
      id,
      rubrik: item.config.handelser.find((h) => h.ar === ar)?.rubrik ?? "?",
    })),
  };
}

// --- Slump --------------------------------------------------------------------

/** mulberry32: liten, snabb och tillräcklig för att lotta uppgifter. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const vikt = (h: SpelHandelse) => (h.niva === 2 ? 1 : 3);

/** Viktat urval utan återläggning. */
function viktatUrval<T extends SpelHandelse>(
  kandidater: readonly T[],
  antal: number,
  random: () => number
): T[] {
  const kvar = [...kandidater];
  const valda: T[] = [];
  while (valda.length < antal && kvar.length > 0) {
    const summa = kvar.reduce((s, h) => s + vikt(h), 0);
    let r = random() * summa;
    let i = 0;
    for (; i < kvar.length - 1; i++) {
      r -= vikt(kvar[i]);
      if (r < 0) break;
    }
    valda.push(kvar.splice(i, 1)[0]);
  }
  return valda;
}

// --- Poäng och tolerans -------------------------------------------------------

/**
 * Toleransen i år. Den växer med avståndet till nutid: ett århundrade fel om
 * forntiden är bättre än tio år fel om 1900-talet. Cirka-år får dubbel
 * tolerans. `spann` (axelns bredd i år) ger ett golv för placera, så att
 * målet går att träffa med en tumme även på en kort axel.
 */
export function toleransFor(ar: number, cirka?: boolean, spann?: number): number {
  let tol = Math.max(1, Math.round(Math.abs(2000 - ar) * 0.03));
  if (spann !== undefined) tol = Math.max(tol, Math.round(spann * 0.025));
  if (cirka) tol *= 2;
  return Math.min(tol, 5000);
}

/** Fullt inom toleransen, sedan linjärt ner till noll. */
export function poangForAvstand(avstand: number, tolerans: number): number {
  if (avstand <= tolerans) return MAX_POANG;
  const noll = Math.max(tolerans * NARA_FAKTOR * 1.5, tolerans + 1);
  if (avstand >= noll) return 0;
  return Math.round((NARA_TAK * (noll - avstand)) / (noll - tolerans));
}

/**
 * Delpoäng för en ordning: andelen par som står i rätt inbördes ordning
 * (Kendalls överensstämmelse). Byter eleven plats på två grannar i en
 * fyrkortsuppgift blir det 5 av 6 par rätt, inte noll.
 */
export function poangOrdna(valda: number[], facit: number[]): number {
  if (valda.length !== facit.length || valda.length < 2) return 0;
  const plats = new Map(facit.map((ar, i) => [ar, i]));
  let ratt = 0;
  let par = 0;
  for (let i = 0; i < valda.length; i++) {
    for (let j = i + 1; j < valda.length; j++) {
      par++;
      if ((plats.get(valda[i]) ?? -1) < (plats.get(valda[j]) ?? -1)) ratt++;
    }
  }
  return Math.round((MAX_POANG * ratt) / par);
}

/**
 * Tolkar ett skrivet årtal: "509 f.Kr.", "509 fkr", "-509", "ca 1066",
 * "1066 e.Kr.". Null om texten inte är ett årtal. År 0 finns inte.
 */
export function tolkaArtal(text: string): number | null {
  let s = text.trim().toLowerCase().replace(/\s+/g, " ");
  s = s.replace(/^(ca|c:a|cirka|omkring)\.?\s*/, "");
  let fore = false;
  const fKr = /\s*(f\.?\s*kr\.?|f\.?v\.?t\.?|bc|bce)$/;
  const eKr = /\s*(e\.?\s*kr\.?|e\.?v\.?t\.?|ad|ce)$/;
  if (fKr.test(s)) {
    fore = true;
    s = s.replace(fKr, "");
  } else {
    s = s.replace(eKr, "");
  }
  s = s.replace(/\s/g, "");
  const m = /^(-|−)?(\d{1,5})$/.exec(s);
  if (!m) return null;
  const tal = Number(m[2]);
  if (tal === 0) return null;
  const negativ = fore || m[1] !== undefined;
  return negativ ? -tal : tal;
}

// --- Generering ---------------------------------------------------------------

function sorteradeEpoker(epoker: TimelineEpok[]): TimelineEpok[] {
  return [...epoker].sort((a, b) => a.fran - b.fran);
}

function axel(epoker: TimelineEpok[]): { fran: number; till: number } {
  const s = sorteradeEpoker(epoker);
  return { fran: s[0].fran, till: s[s.length - 1].till };
}

function epokIndex(ar: number, epoker: TimelineEpok[]): number {
  const namn = epokFor(ar, epoker);
  return sorteradeEpoker(epoker).findIndex((e) => e.namn === namn);
}

/** Fönstret för placera och skriv: målets epok plus en fjärdedel åt var håll. */
function fonster(ar: number, epoker: TimelineEpok[]): { fran: number; till: number } {
  const s = sorteradeEpoker(epoker);
  const e = s[Math.max(0, epokIndex(ar, epoker))];
  const marg = Math.round((e.till - e.fran) * 0.25);
  const a = axel(epoker);
  return { fran: Math.max(a.fran, e.fran - marg), till: Math.min(a.till, e.till + marg) };
}

/** Händelsen utan spelets extrafält, som tidslinjefrågans schema vill ha den. */
function somHandelse(h: SpelHandelse) {
  return { ar: h.ar, rubrik: h.rubrik, ...(h.cirka ? { cirka: true } : {}) };
}

function somMal(h: SpelHandelse) {
  return { ...somHandelse(h), ...(h.kommentar ? { kommentar: h.kommentar } : {}) };
}

/**
 * Ankarna: upp till tre händelser i fönstret, utspridda. Inget ankare får
 * ligga på målets år - pricken skulle avslöja svaret.
 */
function valjAnkare(
  mal: SpelHandelse,
  data: TidslinjespelData,
  f: { fran: number; till: number },
  random: () => number
): SpelHandelse[] {
  const rubriker = new Set<string>([mal.rubrik]);
  const ar = new Set<number>([mal.ar]);
  const kandidater = shuffle(
    data.handelser.filter((h) => h.ar > f.fran && h.ar < f.till),
    random
  );
  const valda: SpelHandelse[] = [];
  // Tre fack över fönstret, högst ett ankare per fack, så att de sprids.
  const fack = new Set<number>();
  for (const h of kandidater) {
    if (valda.length >= 3) break;
    if (ar.has(h.ar) || rubriker.has(h.rubrik)) continue;
    const i = Math.min(2, Math.floor(((h.ar - f.fran) / (f.till - f.fran)) * 3));
    if (fack.has(i)) continue;
    fack.add(i);
    ar.add(h.ar);
    rubriker.add(h.rubrik);
    valda.push(h);
  }
  return valda.sort((a, b) => a.ar - b.ar);
}

function placeraConfig(
  mal: SpelHandelse,
  data: TidslinjespelData,
  random: () => number,
  medSpannGolv: boolean
): TimelineConfig {
  const f = fonster(mal.ar, data.epoker);
  const ankare = valjAnkare(mal, data, f, random);
  return {
    form: "placera",
    fran: f.fran,
    till: f.till,
    epoker: data.epoker,
    handelser: ankare.map(somHandelse),
    ankare: ankare.map((h) => h.rubrik),
    mal: [somMal(mal)],
    tolerans: toleransFor(mal.ar, mal.cirka, medSpannGolv ? f.till - f.fran : undefined),
  };
}

/**
 * En ordna-uppgift: n händelser med olika år, helst ur samma eller
 * angränsande epok så att uppgiften inte blir trivial ("forntid före
 * moderna tiden"). Oanvända händelser går före; räcker de inte får en
 * händelse som redan varit mål vara med igen.
 */
function ordnaItem(
  n: number,
  data: TidslinjespelData,
  anvanda: Set<string>,
  random: () => number
): RundaItem | null {
  const oanvanda = data.handelser.filter((h) => !anvanda.has(nyckel(h)));
  const [start] = viktatUrval(oanvanda.length ? oanvanda : data.handelser, 1, random);
  if (!start) return null;
  const startEpok = epokIndex(start.ar, data.epoker);
  const nara = (h: SpelHandelse) => Math.abs(epokIndex(h.ar, data.epoker) - startEpok) <= 1;

  const valda: SpelHandelse[] = [start];
  const ar = new Set<number>([start.ar]);
  const prioritet = [
    (h: SpelHandelse) => nara(h) && !anvanda.has(nyckel(h)),
    (h: SpelHandelse) => nara(h),
    (h: SpelHandelse) => !anvanda.has(nyckel(h)),
    () => true,
  ];
  for (const filter of prioritet) {
    for (const h of shuffle(data.handelser.filter(filter), random)) {
      if (valda.length >= n) break;
      if (ar.has(h.ar)) continue;
      ar.add(h.ar);
      valda.push(h);
    }
  }
  if (valda.length < 2) return null;
  for (const h of valda) anvanda.add(nyckel(h));

  const facit = [...valda].sort((a, b) => a.ar - b.ar);
  const min = facit[0].ar;
  const max = facit[facit.length - 1].ar;
  const marg = Math.max(1, Math.round((max - min) * 0.1));
  const config: TimelineConfig = {
    form: "ordna",
    fran: min - marg,
    till: max + marg,
    epoker: data.epoker,
    handelser: facit.map(somHandelse),
    ankare: [],
    mal: facit.map(somMal),
  };
  // Korten får inte visas i rätt ordning från början.
  let visning = shuffle(
    facit.map((h) => h.ar),
    random
  );
  if (visning.every((a, i) => a === facit[i].ar)) visning = [...visning.slice(1), visning[0]];
  return { form: "ordna", config, visningsordning: visning };
}

/**
 * En omgång: fyra placera, tre skriv och tre ordna (två, tre och fyra kort),
 * blandade. Ingen händelse är mål i mer än en placera- eller skrivuppgift.
 */
export function genereraRunda(data: TidslinjespelData, seed: number): RundaItem[] {
  const random = rng(seed);
  const anvanda = new Set<string>();
  const enkla = viktatUrval(data.handelser, ANTAL_PLACERA + ANTAL_SKRIV, random);
  for (const h of enkla) anvanda.add(nyckel(h));

  const items: RundaItem[] = [
    ...enkla.slice(0, ANTAL_PLACERA).map(
      (h): RundaItem => ({ form: "placera", config: placeraConfig(h, data, random, true) })
    ),
    ...enkla.slice(ANTAL_PLACERA).map(
      (h): RundaItem => ({ form: "skriv", config: placeraConfig(h, data, random, false) })
    ),
  ];
  for (const n of ORDNA_STORLEKAR) {
    const item = ordnaItem(n, data, anvanda, random);
    if (item) items.push(item);
  }
  return shuffle(items, random);
}

// --- Rättning -----------------------------------------------------------------

export interface ItemRattning {
  poang: number;
  utfall: TimelineUtfall;
  result: TimelineResult;
  /** Axeln att visa facit på. För skriv vidgad så att elevens år syns. */
  visning: ClientTimelineConfig;
}

/** Rättar ett svar på en uppgift. Null om svaret inte passar uppgiften. */
export function rattaItem(item: RundaItem, svar: SpelSvar): ItemRattning | null {
  const config = item.config;

  if (item.form === "placera") {
    if (svar.ar === undefined) return null;
    // Klicket kan inte hamna utanför axeln; ett värde utanför är manipulerat.
    const ar = Math.min(config.till, Math.max(config.fran, svar.ar));
    const result = gradeTimeline(config, { ar });
    return {
      poang: poangForAvstand(result.avstand ?? Infinity, config.tolerans ?? 0),
      utfall: result.utfall,
      result,
      visning: stripTimelineFacit(config),
    };
  }

  if (item.form === "skriv") {
    if (svar.ar === undefined) return null;
    const result = gradeTimeline(config, { ar: svar.ar });
    // Vidga axeln så att både elevens år och facit syns, men aldrig utanför
    // korpusens epoker.
    const a = axel(config.epoker);
    let fran = Math.max(a.fran, Math.min(config.fran, svar.ar));
    let till = Math.min(a.till, Math.max(config.till, svar.ar));
    const marg = Math.round((till - fran) * 0.05);
    fran = Math.max(a.fran, fran - marg);
    till = Math.min(a.till, till + marg);
    return {
      poang: poangForAvstand(result.avstand ?? Infinity, config.tolerans ?? 0),
      utfall: result.utfall,
      result,
      visning: stripTimelineFacit({ ...config, fran, till }),
    };
  }

  // ordna: kortens id -> år
  const visning = item.visningsordning ?? [];
  const ids = svar.ordning;
  if (!ids || ids.length !== visning.length || new Set(ids).size !== ids.length) return null;
  if (ids.some((id) => visning[id] === undefined)) return null;
  const valdaAr = ids.map((id) => visning[id]);
  const result = gradeTimeline(config, { ordning: valdaAr });
  const poang = poangOrdna(
    valdaAr,
    config.mal.map((m) => m.ar)
  );
  return {
    poang,
    utfall: poang === MAX_POANG ? "ratt" : poang >= 50 ? "nara" : "fel",
    result,
    visning: stripTimelineFacit(config),
  };
}

// --- Lärarens sammanställning ------------------------------------------------

export interface HandelseStatistik {
  rubrik: string;
  ar: number;
  cirka?: boolean;
  forsok: number;
  snitt: number;
}

/**
 * Händelserna eleverna missar mest, ur placera- och skrivuppgifterna (där en
 * uppgift är en händelse). Ordna räknas inte: poängen där hör till paret,
 * inte till en enskild händelse.
 */
export function svarasteHandelser(rundor: unknown[], minForsok = 2): HandelseStatistik[] {
  const per = new Map<string, HandelseStatistik & { summa: number }>();
  for (const r of rundor) {
    const parsed = z.array(rundaItemSchema).safeParse(r);
    if (!parsed.success) continue;
    for (const item of parsed.data) {
      if (item.form === "ordna" || item.poang === undefined) continue;
      const m = item.config.mal[0];
      const k = nyckel(m);
      const s = per.get(k) ?? { rubrik: m.rubrik, ar: m.ar, cirka: m.cirka, forsok: 0, snitt: 0, summa: 0 };
      s.forsok++;
      s.summa += item.poang;
      per.set(k, s);
    }
  }
  return [...per.values()]
    .filter((s) => s.forsok >= minForsok)
    .map(({ summa, ...s }) => ({ ...s, snitt: Math.round(summa / s.forsok) }))
    .sort((a, b) => a.snitt - b.snitt || b.forsok - a.forsok);
}
