/**
 * Tabellfrågans svar som läsbar text - kopia av formateraTabellsvar i
 * webbappens src/lib/tabell.ts, som är kanonisk (MCP-servern bygger separat
 * och kan inte importera därifrån, som tidslinjesvar() i get-results).
 *
 * Svaret är `{"tabell":[{r,k,rad,kolumn,text}]}`. Allt annat lämnas orört,
 * så funktionen kan läggas på varje elevsvar oavsett frågetyp.
 */
export function lasbartSvar(value: string): string {
  if (!value.startsWith("{\"tabell\"")) return value;
  try {
    const parsed = JSON.parse(value) as { tabell?: unknown };
    if (!Array.isArray(parsed.tabell) || parsed.tabell.length === 0) return value;
    return parsed.tabell
      .map((c: { rad?: string; kolumn?: string; text?: string }) =>
        `${c.rad ?? "?"} - ${c.kolumn ?? "?"}: ${(c.text ?? "").trim()}`
      )
      .join("\n");
  } catch {
    return value;
  }
}
