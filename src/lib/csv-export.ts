/**
 * CSV-generering för export.
 *
 * Två saker skiljer detta från en rak `join(",")`:
 *
 * 1. **Formelinjektion.** Excel, LibreOffice och Google Sheets tolkar en cell
 *    som börjar med `=`, `+`, `-`, `@`, tab eller CR som en formel. Elever
 *    kontrollerar innehållet i fritextsvaren, så ett svar som `=HYPERLINK(...)`
 *    blir en klickbar formel i lärarens kalkylark. Citering räcker inte -
 *    `"=1+1"` är fortfarande en formel efter att arket parsat CSV:n. Fixen är
 *    att prefixa cellen med en apostrof, vilket tvingar textläge.
 * 2. **Negativa tal ska förbli tal.** `-3` är inte ett angrepp, så rena tal
 *    undantas från apostrofen och kan fortfarande summeras i arket.
 */

const FORMEL_PREFIX = /^[=+\-@\t\r]/;
const RENT_TAL = /^-?\d+([.,]\d+)?$/;
const BEHOVER_CITAT = /[",\r\n]/;

/** Escapar en cell: formelneutralisering först, sedan CSV-citering. */
export function escapeCsvCell(value: unknown): string {
  let s = String(value ?? "");

  if (FORMEL_PREFIX.test(s) && !RENT_TAL.test(s)) {
    s = `'${s}`;
  }

  return BEHOVER_CITAT.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Bygger en CSV-sträng av rader (första raden är rubrikraden). */
export function toCsv(rows: unknown[][]): string {
  return rows.map((row) => row.map(escapeCsvCell).join(",")).join("\r\n");
}

/** BOM (U+FEFF) så att Excel läser UTF-8 rätt (å/ä/ö). */
export const CSV_BOM = String.fromCharCode(0xfeff);
