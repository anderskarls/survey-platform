import { z } from "zod";

/**
 * Tabellfrågor - elevbladets tabell, ruta för ruta, i appen.
 *
 * På papper fyller eleven i en tabell: förtryckta celler (regeln, exemplet)
 * och tomma rutor att skriva i. Som lösa fritextfrågor blev samma blad 27
 * frågor som eleven inte kände igen. Här är en tabell en fråga: förtryckta
 * celler visas som text, varje tom cell blir en skrivruta.
 *
 * Ingen rättning - en tabellfråga är en skrivuppgift som FREE_TEXT, och
 * `isCorrect` förblir null. Läraren ger feedback på hela tabellen.
 *
 * Frågorna byggs ur elevbladets markdown (`blad2app.py` i Brain-vaultet),
 * inte för hand - så tabellen i appen är samma tabell som i Word och på
 * utskriften.
 */

const cell = z.string().max(2000);

/** En tabell som bara läses - ordlistan eller tidslinjen bredvid uppgiften. */
const stodtabellSchema = z.object({
  kolumner: z.array(cell).min(1).max(8),
  rader: z.array(z.array(cell).max(8)).min(1).max(40),
  /** Står under den ifyllbara tabellen på bladet, i stället för ovanför. */
  efter: z.boolean().optional(),
});

export const tabellConfigSchema = z
  .object({
    /** Skiljer configen från de andra typerna i questionConfigSchema-unionen. */
    kind: z.literal("tabell"),
    /** Stycken ovanför tabellen: instruktion, tips, meningsmall. */
    inledning: z.array(z.string().min(1).max(2000)).max(10).optional(),
    kolumner: z.array(cell).min(1).max(8),
    /** Kolumnbredder i procent, ur bladets `kolumner`-direktiv. */
    bredder: z.array(z.number().int().min(1).max(100)).max(8).optional(),
    /** Höjd på skrivrutorna i rader, ur bladets `skrivrader`-direktiv. */
    skrivrader: z.number().int().min(1).max(12).optional(),
    /** null = skrivruta, text = förtryckt cell. */
    rader: z.array(z.array(cell.nullable()).max(8)).min(1).max(40),
    /** Stycken under tabellen. */
    efter: z.array(z.string().min(1).max(2000)).max(10).optional(),
    /** Tabeller utan skrivrutor från samma avsnitt av bladet. */
    stodtabeller: z.array(stodtabellSchema).max(4).optional(),
  })
  .superRefine((c, ctx) => {
    for (const [i, rad] of c.rader.entries()) {
      if (rad.length !== c.kolumner.length) {
        ctx.addIssue({
          code: "custom",
          path: ["rader", i],
          message: `Rad ${i + 1} har ${rad.length} celler, tabellen har ${c.kolumner.length} kolumner`,
        });
      }
    }
    if (!c.rader.some((rad) => rad.some((x) => x === null))) {
      ctx.addIssue({ code: "custom", path: ["rader"], message: "Tabellen saknar skrivrutor" });
    }
    if (c.bredder && c.bredder.length !== c.kolumner.length) {
      ctx.addIssue({ code: "custom", path: ["bredder"], message: "En bredd per kolumn" });
    }
  });

export type TabellConfig = z.infer<typeof tabellConfigSchema>;

/** Läser configen ur Json-kolumnen; trasig config ger null. */
export function parseTabellConfig(config: unknown): TabellConfig | null {
  const parsed = tabellConfigSchema.safeParse(config);
  return parsed.success ? parsed.data : null;
}

/**
 * En ifylld ruta. Svaret bär rad- och kolumnrubriken själv, så att det går
 * att läsa överallt där råvärdet visas - lärarvyn, MCP-verktygen,
 * klassrapporten - utan att configen behöver slås upp. Rubrikerna är de
 * eleven såg när hen skrev.
 */
const tabellcellSvarSchema = z.object({
  r: z.number().int().min(0),
  k: z.number().int().min(0),
  rad: z.string(),
  kolumn: z.string(),
  text: z.string(),
});

/**
 * `{"tabell":[...]}`. Nyckeln gör att svaret aldrig kan tas för ett
 * sorteringssvar (ett platt objekt med strängvärden) i `lasbart()`-kedjorna.
 */
export const tabellSvarSchema = z.object({ tabell: z.array(tabellcellSvarSchema) });

export type TabellcellSvar = z.infer<typeof tabellcellSvarSchema>;

/** Elevens ifyllda rutor, nyckel `r:k`. Ogiltigt eller tomt ger {}. */
export function lasTabellsvar(value: string | undefined): Record<string, string> {
  if (!value) return {};
  try {
    const parsed = tabellSvarSchema.safeParse(JSON.parse(value));
    if (!parsed.success) return {};
    return Object.fromEntries(parsed.data.tabell.map((c) => [`${c.r}:${c.k}`, c.text]));
  } catch {
    return {};
  }
}

/** Radens etikett: första förtryckta cellen, annars "Rad N". */
function radetikett(config: TabellConfig, r: number): string {
  const forsta = config.rader[r]?.find((x) => x !== null && x.trim() !== "");
  return forsta ? rensa(forsta) : `Rad ${r + 1}`;
}

/** Tar bort markdownens fet/kursiv-markörer för text som inte renderas. */
function rensa(s: string): string {
  return s.replace(/\*\*(.+?)\*\*/g, "$1").replace(/\*(.+?)\*/g, "$1").trim();
}

/**
 * Bygger svarssträngen ur rutornas text. Alla rutor tomma ger "" - då är
 * frågan obesvarad för `isBlank`, räknaren och utkastet, precis som en tom
 * textruta.
 */
export function byggTabellsvar(config: TabellConfig, rutor: Record<string, string>): string {
  const celler: TabellcellSvar[] = [];
  config.rader.forEach((rad, r) =>
    rad.forEach((x, k) => {
      if (x !== null) return;
      const text = rutor[`${r}:${k}`] ?? "";
      if (text.trim() === "") return;
      celler.push({ r, k, rad: radetikett(config, r), kolumn: rensa(config.kolumner[k] ?? ""), text });
    })
  );
  return celler.length === 0 ? "" : JSON.stringify({ tabell: celler });
}

/**
 * Elevens tabellsvar som läsbar text i lärarens vyer, en ruta per rad:
 * "Folkförsamlingen - Vilket problem skulle den lösa?: ...". Null när värdet
 * inte är ett tabellsvar, så anroparen kan falla tillbaka på råtexten.
 */
export function formateraTabellsvar(value: string): string | null {
  let rått: unknown;
  try {
    rått = JSON.parse(value);
  } catch {
    return null;
  }
  const svar = tabellSvarSchema.safeParse(rått);
  if (!svar.success || svar.data.tabell.length === 0) return null;
  return svar.data.tabell.map((c) => `${c.rad} - ${c.kolumn}: ${c.text.trim()}`).join("\n");
}
