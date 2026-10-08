"use client";

import type { ReactNode } from "react";
import type { TabellConfig } from "@/lib/tabell";

/**
 * Elevbladets tabell i appen: förtryckta celler som text, tomma celler som
 * skrivrutor. På bred skärm ser den ut som tabellen på papperet; på mobil
 * staplas varje rad som ett kort med kolumnrubriken ovanför varje ruta, så
 * att ingenting kräver sidscroll.
 *
 * Rutornas text bärs som `{ "r:k": text }`; anroparen bygger svarssträngen
 * med byggTabellsvar.
 */

/** **fet** och *kursiv* ur bladets markdown - inget annat tolkas. */
function inline(text: string): ReactNode[] {
  const delar = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).filter(Boolean);
  return delar.map((d, i) =>
    d.startsWith("**") && d.endsWith("**") && d.length > 4 ? (
      <strong key={i}>{d.slice(2, -2)}</strong>
    ) : d.startsWith("*") && d.endsWith("*") && d.length > 2 ? (
      <em key={i}>{d.slice(1, -1)}</em>
    ) : (
      <span key={i}>{d}</span>
    )
  );
}

function Stodtabell({ kolumner, rader }: { kolumner: string[]; rader: string[][] }) {
  return (
    <div className="overflow-x-auto mb-4">
      <table className="w-full text-sm border-collapse">
        {kolumner.some((k) => k.trim() !== "") && (
          <thead>
            <tr>
              {kolumner.map((k, i) => (
                <th key={i} className="text-left font-semibold border-b border-border px-2 py-1.5">
                  {inline(k)}
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {rader.map((rad, r) => (
            <tr key={r} className="border-b border-border-light">
              {rad.map((c, k) => (
                <td key={k} className="px-2 py-1.5 align-top">
                  {inline(c)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function TableQuestion({
  config,
  rutor,
  onChange,
  disabled = false,
}: {
  config: TabellConfig;
  rutor: Record<string, string>;
  onChange: (rutor: Record<string, string>) => void;
  disabled?: boolean;
}) {
  // Minst två rader: en rad blir för trång i smala kolumner, där svaret radbryts.
  const rows = Math.max(config.skrivrader ?? 2, 2);
  // En rad utan skrivrutor är förtryckt i sin helhet - exempelraden.
  const arExempel = (rad: (string | null)[]) => rad.every((x) => x !== null);

  function skriv(r: number, k: number, text: string) {
    onChange({ ...rutor, [`${r}:${k}`]: text });
  }

  function ruta(r: number, k: number, etikett: string) {
    return (
      <textarea
        value={rutor[`${r}:${k}`] ?? ""}
        onChange={(e) => skriv(r, k, e.target.value)}
        rows={rows}
        disabled={disabled}
        aria-label={etikett}
        className="input-field text-sm min-h-0 resize-y"
      />
    );
  }

  const rensad = (s: string) => s.replace(/\*/g, "").trim();

  return (
    <div>
      {config.inledning?.map((p, i) => (
        <p key={i} className="text-sm text-muted mb-2 last:mb-4">
          {inline(p)}
        </p>
      ))}
      {config.stodtabeller
        ?.filter((t) => !t.efter)
        .map((t, i) => <Stodtabell key={i} kolumner={t.kolumner} rader={t.rader} />)}

      {/* Bred skärm: tabellen som på papperet. */}
      <div className="hidden md:block">
        <table className="w-full border-collapse table-fixed">
          {config.bredder && (
            <colgroup>
              {config.bredder.map((b, i) => (
                <col key={i} style={{ width: `${b}%` }} />
              ))}
            </colgroup>
          )}
          <thead>
            <tr>
              {config.kolumner.map((k, i) => (
                <th
                  key={i}
                  className="text-left text-sm font-semibold bg-surface-muted border border-border px-2 py-2 align-bottom"
                >
                  {inline(k)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {config.rader.map((rad, r) => (
              <tr key={r} className={arExempel(rad) ? "text-muted italic" : ""}>
                {rad.map((c, k) =>
                  c === null ? (
                    <td key={k} className="border border-border p-1 align-top">
                      {ruta(r, k, `${rensad(rad.find((x) => x) ?? `Rad ${r + 1}`)} - ${rensad(config.kolumner[k])}`)}
                    </td>
                  ) : (
                    <td
                      key={k}
                      className={`border border-border px-2 py-2 align-top text-sm ${
                        k === 0 && !arExempel(rad) ? "font-semibold" : ""
                      }`}
                    >
                      {inline(c)}
                    </td>
                  )
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobil: en rad = ett kort. */}
      <div className="md:hidden flex flex-col gap-3">
        {config.rader.map((rad, r) => {
          const forsta = rad.findIndex((x) => x !== null);
          return (
            <div
              key={r}
              className={`border border-border rounded-xl p-3 ${arExempel(rad) ? "text-muted italic" : ""}`}
            >
              {forsta >= 0 && <p className="font-semibold text-sm mb-2">{inline(rad[forsta] as string)}</p>}
              {rad.map((c, k) =>
                k === forsta ? null : (
                  <div key={k} className="mb-2 last:mb-0">
                    <p className="text-xs font-semibold text-muted mb-1">{inline(config.kolumner[k])}</p>
                    {c === null ? (
                      ruta(r, k, `${rensad(rad[forsta] ?? `Rad ${r + 1}`)} - ${rensad(config.kolumner[k])}`)
                    ) : (
                      <p className="text-sm">{inline(c)}</p>
                    )}
                  </div>
                )
              )}
            </div>
          );
        })}
      </div>
      {(config.efter?.length || config.stodtabeller?.some((t) => t.efter)) && (
        <div className="mt-4">
          {config.efter?.map((p, i) => (
            <p key={i} className="text-sm text-muted mb-2">
              {inline(p)}
            </p>
          ))}
          {config.stodtabeller
            ?.filter((t) => t.efter)
            .map((t, i) => <Stodtabell key={i} kolumner={t.kolumner} rader={t.rader} />)}
        </div>
      )}
    </div>
  );
}
