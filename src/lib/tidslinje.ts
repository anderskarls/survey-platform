import { z } from "zod";

/**
 * Tidslinjefrågor: eleven svarar genom att klicka i en tidslinje.
 *
 * Frågorna genereras av tidslinjerepots `quiz.py --klick` ur samma CSV-filer
 * som tidslinjen ritas ur, och skrivs aldrig för hand. Fyra former:
 *
 *   placera  klicka på axeln där händelsen hör hemma. Rättas som år med
 *            tolerans. Målets prick finns INTE bland handelser (den skulle
 *            avslöja svaret); ankare står kvar med rubrik som stödpunkter.
 *   peka     vilken prick är händelsen? Alla prickar syns utan rubrik och
 *            målet är en av dem. Pricken identifieras av sitt år.
 *   ordna    klicka prickarna i kronologisk ordning, äldst först. `mal` är
 *            facitordningen.
 *   epok     klicka i epokbandet. Rättas som epoken klickets år hör till.
 *
 * Facit (`mal`) lämnar aldrig servern före svar - se stripTimelineFacit.
 * Toleransen anges i år, inte pixlar, så samma fråga rättas lika på en
 * telefon och en projektor.
 */

export const TIMELINE_FORMS = ["placera", "peka", "ordna", "epok"] as const;
export type TimelineForm = (typeof TIMELINE_FORMS)[number];

/** Nära = inom så här många toleranser. Räknas som fel i schemat men sägs. */
export const NARA_FAKTOR = 3;

const handelseSchema = z.object({
  ar: z.number().int().min(-10000).max(3000),
  rubrik: z.string().min(1).max(200),
  cirka: z.boolean().optional(),
});
export type TimelineHandelse = z.infer<typeof handelseSchema>;

const malSchema = handelseSchema.extend({
  /** Tidslinjens kommentar - visas efter svaret som förklaring. */
  kommentar: z.string().max(500).optional(),
});
export type TimelineMal = z.infer<typeof malSchema>;

const epokSchema = z.object({
  namn: z.string().min(1).max(60),
  fran: z.number().int(),
  till: z.number().int(),
});
export type TimelineEpok = z.infer<typeof epokSchema>;

function nyckel(h: { ar: number; rubrik: string }): string {
  return `${h.ar}|${h.rubrik}`;
}

export const timelineConfigSchema = z
  .object({
    form: z.enum(TIMELINE_FORMS),
    /** Axelns spann. Negativa år är f.Kr. */
    fran: z.number().int(),
    till: z.number().int(),
    epoker: z.array(epokSchema).max(12).default([]),
    /** Prickarna som ritas: ankare, kontext och (för peka/ordna) målen. */
    handelser: z.array(handelseSchema).max(60).default([]),
    /** Rubriker bland handelser som visas med etikett före svar. */
    ankare: z.array(z.string().min(1).max(200)).max(4).default([]),
    /** Facit. Ett mål för placera/peka/epok, facitordningen för ordna. */
    mal: z.array(malSchema).min(1).max(8),
    /** placera: rätt om |klick - mal.ar| <= tolerans. */
    tolerans: z.number().int().min(0).max(5000).optional(),
  })
  .superRefine((c, ctx) => {
    const fel = (message: string) => ctx.addIssue({ code: "custom", message });
    if (c.till <= c.fran) fel("till måste vara större än fran");
    if (c.form !== "ordna" && c.mal.length !== 1) {
      fel(`${c.form} ska ha exakt ett mål`);
    }
    if (c.form === "ordna" && c.mal.length < 2) fel("ordna behöver minst två mål");
    if (c.form === "placera" && c.tolerans === undefined) {
      fel("placera kräver tolerans (år)");
    }
    if (c.form === "epok" && c.epoker.length === 0) fel("epok kräver epoker");

    const finns = new Set(c.handelser.map(nyckel));
    for (const m of c.mal) {
      if (m.ar < c.fran || m.ar > c.till) {
        fel(`Målet "${m.rubrik}" ligger utanför spannet`);
      }
      const bland = finns.has(nyckel(m));
      if ((c.form === "peka" || c.form === "ordna") && !bland) {
        fel(`Målet "${m.rubrik}" måste finnas bland handelser`);
      }
      if ((c.form === "placera" || c.form === "epok") && bland) {
        fel(`Målet "${m.rubrik}" får inte finnas bland handelser - pricken skulle avslöja svaret`);
      }
    }
    for (const a of c.ankare) {
      if (!c.handelser.some((h) => h.rubrik === a)) {
        fel(`Ankaret "${a}" finns inte bland handelser`);
      }
    }
    // Peka och ordna identifierar pricken på dess år; två prickar på samma
    // år går inte att skilja åt, varken för eleven eller rättningen.
    if (c.form === "peka" || c.form === "ordna") {
      const ar = c.handelser.map((h) => h.ar);
      if (new Set(ar).size !== ar.length) {
        fel(`${c.form} kräver att alla handelser har olika år`);
      }
    }
  });
export type TimelineConfig = z.infer<typeof timelineConfigSchema>;

/** Konfiguration som kan skickas till klienten före svar - utan facit. */
export interface ClientTimelineConfig {
  form: TimelineForm;
  fran: number;
  till: number;
  epoker: TimelineEpok[];
  /** Prickarna. `etikett` bara för ankare - övriga rubriker hålls tillbaka. */
  handelser: { ar: number; etikett: string | null; cirka?: boolean }[];
  /** ordna: hur många prickar som ska klickas. Annars 1. */
  antal: number;
}

export function stripTimelineFacit(config: TimelineConfig): ClientTimelineConfig {
  const ankare = new Set(config.ankare);
  return {
    form: config.form,
    fran: config.fran,
    till: config.till,
    epoker: config.epoker,
    handelser: config.handelser
      .slice()
      .sort((a, b) => a.ar - b.ar)
      .map((h) => ({
        ar: h.ar,
        etikett: ankare.has(h.rubrik) ? h.rubrik : null,
        ...(h.cirka ? { cirka: true } : {}),
      })),
    antal: config.form === "ordna" ? config.mal.length : 1,
  };
}

/** Elevens svar: ett år (placera/epok/peka) eller en följd av år (ordna). */
export const timelineAnswerSchema = z.object({
  ar: z.number().int().optional(),
  ordning: z.array(z.number().int()).max(8).optional(),
});
export type TimelineAnswer = z.infer<typeof timelineAnswerSchema>;

export type TimelineUtfall = "ratt" | "nara" | "fel";

export interface TimelineResult {
  form: TimelineForm;
  utfall: TimelineUtfall;
  isCorrect: boolean;
  /** Facit, i rätt ordning för ordna. Lämnar servern först nu. */
  mal: TimelineMal[];
  /** placera/epok/peka: året eleven valde. */
  klick: number | null;
  /** placera: |klick - mal.ar| i år. */
  avstand: number | null;
  /** epok: epoken eleven klickade i respektive facit. */
  epokVald: string | null;
  epokRatt: string | null;
  /** peka: pricken eleven valde, med rubriken avslöjad. */
  klickad: TimelineHandelse | null;
  /** ordna: elevens följd med rätt/fel per plats. */
  ordning: { ar: number; rubrik: string; ratt: boolean }[] | null;
  rattPlats: number | null;
}

/** Epoken ett år hör till. Gränsen hör till epoken som börjar där. */
export function epokFor(ar: number, epoker: TimelineEpok[]): string | null {
  let traff: TimelineEpok | null = null;
  for (const e of [...epoker].sort((a, b) => a.fran - b.fran)) {
    if (ar >= e.fran) traff = e;
  }
  return traff ? traff.namn : null;
}

/** Avslutar en mening utan att dubblera punkten efter "f.Kr.". */
export function mening(s: string): string {
  return s.endsWith(".") ? s : s + ".";
}

/** -509 blir "509 f.Kr.", 1066 blir "1066", cirka-år får "ca". */
export function formatAr(ar: number, cirka?: boolean): string {
  const bas = ar < 0 ? `${Math.abs(ar)} f.Kr.` : String(ar);
  return cirka ? `ca ${bas}` : bas;
}

/** Meningen eleven får läsa när svaret inte var rätt. Rätt svar behöver ingen. */
export function beskrivTimelineResultat(r: TimelineResult): string {
  const m = r.mal[0];
  const ar = (x: { ar: number; cirka?: boolean }) => formatAr(x.ar, x.cirka);
  switch (r.form) {
    case "placera":
      return r.utfall === "nara"
        ? `Nära! ${m.rubrik} var ${ar(m)} - ${r.avstand} år från ditt val.`
        : `${m.rubrik} var ${ar(m)} - ${r.avstand ?? "?"} år från ditt val.`;
    case "epok":
      return `${m.rubrik} (${ar(m)}) hör till ${r.epokRatt ?? "?"}${r.epokVald ? ` - du valde ${r.epokVald}` : ""}.`;
    case "peka":
      return r.klickad
        ? `Det var ${r.klickad.rubrik} (${ar(r.klickad)}). ${mening(`${m.rubrik} är ${ar(m)}`)}`
        : mening(`${m.rubrik} är ${ar(m)}`);
    case "ordna":
      return `${r.rattPlats ?? 0} av ${r.mal.length} på rätt plats. Rätt ordning: ${r.mal
        .map((x) => `${x.rubrik} (${ar(x)})`)
        .join(" · ")}.`;
  }
}

/**
 * Rättar ett tidslinjesvar rakt ur det som ligger i databasen; null om frågan
 * eller svaret inte går att tolka.
 *
 * Motsvarigheten för sortering är `rattaSortering` i respond-routen. Den här
 * ligger i biblioteket i stället, eftersom tre ställen behöver den: enkätens
 * inlämning och de två resultatrouterna (som är två kopior av samma vy). När
 * rättningen bodde i routen var det just kopieringen som gjorde att en typ
 * kunde vara rättad i det ena flödet och orättad i det andra.
 */
export function rattaTidslinje(
  config: unknown,
  value: string
): TimelineResult | null {
  const parsedConfig = timelineConfigSchema.safeParse(config);
  if (!parsedConfig.success) return null;
  let rått: unknown;
  try {
    rått = JSON.parse(value);
  } catch {
    return null;
  }
  const answer = timelineAnswerSchema.safeParse(rått);
  if (!answer.success) return null;
  return gradeTimeline(parsedConfig.data, answer.data);
}

/**
 * Elevens tidslinjesvar som läsbar text i lärarens vyer.
 *
 * Rådatan är JSON - `{"ar":-3000}` eller `{"ordning":[...]}` - och utan den
 * här skulle läraren få sin egen datastruktur uppläst som elevens svar, vilket
 * är precis felet `formateraSorteringssvar` finns till för att undvika.
 * Returnerar null när värdet inte är ett tidslinjesvar, så anroparen kan falla
 * tillbaka på råtexten.
 */
export function formateraTidslinjesvar(value: string): string | null {
  let rått: unknown;
  try {
    rått = JSON.parse(value);
  } catch {
    return null;
  }
  const answer = timelineAnswerSchema.safeParse(rått);
  if (!answer.success) return null;
  if (answer.data.ordning !== undefined) {
    if (answer.data.ordning.length === 0) return null;
    return answer.data.ordning.map((ar) => formatAr(ar)).join(" · ");
  }
  if (answer.data.ar === undefined) return null;
  return formatAr(answer.data.ar);
}

/**
 * Facit som en rad i lärarens resultatvy: "Antiken börjar (3000 f.Kr.)".
 * Null när configen inte går att tolka - då har frågan inget facit att visa.
 * Bara för lärarvyer; det här får aldrig med i det eleven ser före svaret.
 */
export function beskrivTimelineFacit(config: unknown): string | null {
  const parsed = timelineConfigSchema.safeParse(config);
  if (!parsed.success) return null;
  return parsed.data.mal
    .map((m) => `${m.rubrik} (${formatAr(m.ar, m.cirka)})`)
    .join(" · ");
}

export function gradeTimeline(
  config: TimelineConfig,
  answer: TimelineAnswer
): TimelineResult {
  const tomt: TimelineResult = {
    form: config.form,
    utfall: "fel",
    isCorrect: false,
    mal: config.mal,
    klick: null,
    avstand: null,
    epokVald: null,
    epokRatt: null,
    klickad: null,
    ordning: null,
    rattPlats: null,
  };
  const mal = config.mal[0];

  if (config.form === "placera") {
    if (answer.ar === undefined) return tomt;
    const avstand = Math.abs(answer.ar - mal.ar);
    const tolerans = config.tolerans ?? 0;
    const utfall: TimelineUtfall =
      avstand <= tolerans ? "ratt" : avstand <= tolerans * NARA_FAKTOR ? "nara" : "fel";
    return { ...tomt, utfall, isCorrect: utfall === "ratt", klick: answer.ar, avstand };
  }

  if (config.form === "epok") {
    if (answer.ar === undefined) return tomt;
    const epokVald = epokFor(answer.ar, config.epoker);
    const epokRatt = epokFor(mal.ar, config.epoker);
    const ratt = epokVald !== null && epokVald === epokRatt;
    return {
      ...tomt,
      utfall: ratt ? "ratt" : "fel",
      isCorrect: ratt,
      klick: answer.ar,
      epokVald,
      epokRatt,
    };
  }

  if (config.form === "peka") {
    if (answer.ar === undefined) return tomt;
    const klickad = config.handelser.find((h) => h.ar === answer.ar) ?? null;
    const ratt = answer.ar === mal.ar;
    return {
      ...tomt,
      utfall: ratt ? "ratt" : "fel",
      isCorrect: ratt,
      klick: answer.ar,
      klickad,
    };
  }

  // ordna
  const valda = answer.ordning ?? [];
  const ordning = valda.map((ar, i) => {
    const h = config.handelser.find((x) => x.ar === ar);
    return {
      ar,
      rubrik: h?.rubrik ?? formatAr(ar),
      ratt: config.mal[i] !== undefined && config.mal[i].ar === ar,
    };
  });
  const rattPlats = ordning.filter((o) => o.ratt).length;
  const ratt = valda.length === config.mal.length && rattPlats === config.mal.length;
  return {
    ...tomt,
    utfall: ratt ? "ratt" : "fel",
    isCorrect: ratt,
    ordning,
    rattPlats,
  };
}
