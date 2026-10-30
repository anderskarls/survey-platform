"use client";

import { useEffect, useState } from "react";
import { MIN_RUNG, nastaRung, type TidigareLedtrad } from "@/lib/ledtrad";
import { VANTETID_MS } from "@/lib/ledtrad-sparr";

interface Props {
  surveyId: number;
  questionId: number;
  /** Det eleven har i svarsrutan just nu - skickas med vid klicket. */
  utkast: string;
  /**
   * Ledtrådar eleven redan fått på frågan. Formuläret äger listan: det visar
   * en fråga i taget, och panelen monteras om när eleven bläddrar.
   */
  tidigare: TidigareLedtrad[];
  onNy: (ledtrad: TidigareLedtrad) => void;
}

/**
 * Ledtrådsknappen under en fritextfråga, för elever som läraren slagit på
 * stödet för. Ett steg per klick; servern bestämmer steget och spärrarna.
 * Det eleven ser är bara ledtråden - lärarens diagnos når aldrig hit.
 */
export default function LedtradPanel({ surveyId, questionId, utkast, tidigare: lista, onNy }: Props) {
  const [laddar, setLaddar] = useState(false);
  const [fel, setFel] = useState("");
  const [vantaTill, setVantaTill] = useState(0);
  const [kvarSek, setKvarSek] = useState(0);
  const [taketNatt, setTaketNatt] = useState(false);
  const slut = taketNatt || nastaRung(lista) === null;

  // Nedräkningen när servern sagt "skriv vidare en stund"
  useEffect(() => {
    if (vantaTill === 0) return;
    const tick = () => {
      const s = Math.max(0, Math.ceil((vantaTill - Date.now()) / 1000));
      setKvarSek(s);
      if (s === 0) setVantaTill(0);
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [vantaTill]);

  async function bePaLedtrad() {
    setLaddar(true);
    setFel("");
    const avbryt = new AbortController();
    const timer = setTimeout(() => avbryt.abort(), 25_000);
    try {
      const res = await fetch(`/api/surveys/${surveyId}/ledtrad`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId, utkast }),
        signal: avbryt.signal,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.kod === "tak") setTaketNatt(true);
        else if (data.sekunderKvar) setVantaTill(Date.now() + data.sekunderKvar * 1000);
        else setFel(data.error ?? "Det gick inte att ta fram en ledtråd just nu.");
        return;
      }
      onNy({ kind: data.kind, rung: data.rung, hint: data.hint });
      if (data.kvar === 0) setTaketNatt(true);
      else setVantaTill(Date.now() + VANTETID_MS);
    } catch {
      setFel("Det tog för lång tid. Försök igen om en stund.");
    } finally {
      clearTimeout(timer);
      setLaddar(false);
    }
  }

  return (
    <div className="mt-3 rounded-lg border border-border-light bg-surface-muted/40 p-3">
      {lista.length > 0 && (
        <ol aria-live="polite" className="space-y-2 mb-3">
          {lista.map((l, i) => (
            <li key={i} className="text-sm">
              <span className="block text-xs font-semibold uppercase tracking-wider text-muted">
                {l.kind === "FORKLARING" ? "Om frågan" : `Ledtråd ${(l.rung ?? MIN_RUNG) - MIN_RUNG + 1}`}
              </span>
              <p>{l.hint}</p>
            </li>
          ))}
        </ol>
      )}
      {slut ? (
        <p className="text-sm text-muted">Nu har du fått alla ledtrådar. Resten klarar du själv.</p>
      ) : (
        <button
          type="button"
          onClick={bePaLedtrad}
          disabled={laddar || kvarSek > 0}
          className="btn-secondary text-sm"
        >
          {laddar ? "Tänker..." : kvarSek > 0 ? `Skriv vidare innan du ber om nästa (${kvarSek} s)` : "Jag behöver en ledtråd"}
        </button>
      )}
      {fel && (
        <p role="alert" className="text-sm text-error mt-2">
          {fel}
        </p>
      )}
      <p className="text-xs text-muted mt-2">Ledtrådarna skrivs av en AI. De ger dig nästa steg, inte svaret.</p>
    </div>
  );
}
