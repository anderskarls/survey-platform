/**
 * Lättläst formulering: samma fråga skriven för elever vars svenska ännu är
 * begränsad. Läraren skriver den (momentplaneringens nivåmaterial), eleven slår
 * på den med växeln Ordinarie / Lättläst ovanför frågorna.
 *
 * Den ligger i frågans config under nyckeln `lattlast`, bredvid den
 * typspecifika konfigurationen, så att ingen migrering behövs och MCP-servern
 * kan skriva den med sin befintliga klient. Bara frågetexten har en lättläst
 * form: svarsalternativen lagras som text i Answer.value och rättas på texten,
 * så de är desamma på båda nivåerna.
 *
 * Samma regel finns i mcp-server/src/lib/csv-question.ts - paketen delar
 * inte kod; ändras den här ska den följa med.
 */

export const LATTLAST_MAX = 1000;

/** Den lättlästa formuleringen ur en frågas config, eller null. */
export function lattlastText(config: unknown): string | null {
  if (!config || typeof config !== "object" || Array.isArray(config)) return null;
  const v = (config as Record<string, unknown>).lattlast;
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

/**
 * Lägger den lättlästa formuleringen i en config utan att röra resten.
 * Utan formulering returneras configen orörd (undefined förblir undefined -
 * en import utan kolumnen ska inte skriva över en formulering som finns).
 */
export function medLattlast(config: unknown, lattlast: string | undefined): unknown {
  if (!lattlast) return config;
  const bas =
    config && typeof config === "object" && !Array.isArray(config)
      ? (config as Record<string, unknown>)
      : {};
  return { ...bas, lattlast };
}

/** Frågetyper där en lättläst formulering visas. Korten och luckorna är ordträning - där är meningen själva uppgiften. */
export function visarLattlast(type: string): boolean {
  return !["CLOZE", "CLOZE_CARD", "CONCEPT_CARD"].includes(type);
}
