"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { EnkatFraga } from "@/lib/enkatfraga";
import { byggTabellsvar, lasTabellsvar, type TabellConfig } from "@/lib/tabell";
import { arBesvarad } from "@/lib/serie";
import { useLattlast } from "@/lib/lattlast-val";
import TableQuestion from "@/components/TableQuestion";
import { LattlastVaxel } from "@/components/QuestionRenderer";

/**
 * Kartvyn på klientsidan: flikarna, skrivandet och autosparningen.
 *
 * Varje flik är en momentuppgift och sparas till dess eget utkast via samma
 * route som formulären (`/api/surveys/[id]/draft`). Sparningen väntar tills
 * eleven slutat skriva en stund, och skickas direkt när eleven byter flik eller
 * lämnar sidan - så att inget som syns som sparat ligger kvar i webbläsaren.
 */

export interface SerieFlik {
  surveyId: number;
  lesson: number | null;
  titel: string;
  etikett: string;
  beskrivning: string;
  fragor: EnkatFraga[];
  svar: Record<string, string>;
  klar: boolean;
}

type Status = "idle" | "saving" | "saved" | "error";

const VANTA_MS = 800;

function arFlikKlar(flik: SerieFlik, svar: Record<string, string>): boolean {
  return (
    flik.fragor.length > 0 &&
    flik.fragor.every((q) =>
      arBesvarad({ id: q.id, type: q.type, config: q.tabell ?? null }, svar[String(q.id)])
    )
  );
}

/** Förra sidans svar, läsbart: radens fråga och det eleven skrev. */
function TidigareSvar({ flik, svar }: { flik: SerieFlik; svar: Record<string, string> }) {
  const rader: { fraga: string; text: string }[] = [];
  for (const q of flik.fragor) {
    const v = svar[String(q.id)] ?? "";
    if (q.type === "TABLE" && q.tabell) {
      const rutor = lasTabellsvar(v);
      q.tabell.rader.forEach((rad, r) => {
        if (!rad.some((x) => x === null)) return;
        const fraga = (rad.find((x) => x !== null) ?? `Rad ${r + 1}`).replace(/\*/g, "");
        const text = rad
          .map((x, k) => (x === null ? (rutor[`${r}:${k}`] ?? "").trim() : ""))
          .filter(Boolean)
          .join(" / ");
        rader.push({ fraga, text });
      });
    } else {
      rader.push({ fraga: q.text, text: v.trim() });
    }
  }
  return (
    <dl className="text-sm">
      {rader.map((r, i) => (
        <div key={i} className="py-1.5 border-b border-border-light last:border-0">
          <dt className="font-semibold">{r.fraga}</dt>
          <dd className={r.text ? "whitespace-pre-wrap" : "text-muted italic"}>{r.text || "Inte ifyllt än"}</dd>
        </div>
      ))}
    </dl>
  );
}

export default function SerieVy({
  flikar,
  start,
}: {
  flikar: SerieFlik[];
  start: number;
}) {
  const [aktiv, setAktiv] = useState(start);
  const [svar, setSvar] = useState<Record<number, Record<string, string>>>(() =>
    Object.fromEntries(flikar.map((f) => [f.surveyId, f.svar]))
  );
  const [status, setStatus] = useState<Record<number, Status>>({});
  const [fel, setFel] = useState("");
  const lattlast = useLattlast();

  // Det som väntar på att sparas, per uppgift. Ref, inte state: timern och
  // sidbytet måste se det senaste värdet utan att vänta på en rendering.
  const vantar = useRef<Map<number, Record<string, string>>>(new Map());
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const spara = useCallback(async (surveyId: number, keepalive = false) => {
    const t = timers.current.get(surveyId);
    if (t) clearTimeout(t);
    timers.current.delete(surveyId);
    const answers = vantar.current.get(surveyId);
    if (!answers) return;
    vantar.current.delete(surveyId);
    setStatus((s) => ({ ...s, [surveyId]: "saving" }));
    try {
      const res = await fetch(`/api/surveys/${surveyId}/draft`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers }),
        keepalive,
      });
      if (res.ok) {
        setStatus((s) => ({ ...s, [surveyId]: "saved" }));
        setFel("");
        return;
      }
      const data = await res.json().catch(() => null);
      setFel(
        data?.error === "Valideringsfel"
          ? "Ett av dina svar är för långt för att sparas - korta ner det."
          : data?.error || ""
      );
    } catch {
      setFel("");
    }
    // Misslyckat: lägg tillbaka svaren så att nästa ändring eller flikbyte försöker igen.
    if (!vantar.current.has(surveyId)) vantar.current.set(surveyId, answers);
    setStatus((s) => ({ ...s, [surveyId]: "error" }));
  }, []);

  const sparaAllt = useCallback(
    (keepalive = false) => {
      for (const id of [...vantar.current.keys()]) void spara(id, keepalive);
    },
    [spara]
  );

  useEffect(() => {
    const dold = () => {
      if (document.visibilityState === "hidden") sparaAllt(true);
    };
    const lamnar = () => sparaAllt(true);
    document.addEventListener("visibilitychange", dold);
    window.addEventListener("pagehide", lamnar);
    return () => {
      document.removeEventListener("visibilitychange", dold);
      window.removeEventListener("pagehide", lamnar);
    };
  }, [sparaAllt]);

  function andra(surveyId: number, questionId: number, value: string) {
    const nya = { ...(svar[surveyId] ?? {}), [String(questionId)]: value };
    setSvar((s) => ({ ...s, [surveyId]: nya }));
    vantar.current.set(surveyId, nya);
    setStatus((s) => ({ ...s, [surveyId]: "idle" }));
    const t = timers.current.get(surveyId);
    if (t) clearTimeout(t);
    timers.current.set(
      surveyId,
      setTimeout(() => void spara(surveyId), VANTA_MS)
    );
  }

  function byt(surveyId: number) {
    sparaAllt();
    setAktiv(surveyId);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("flik", String(surveyId));
      window.history.replaceState(null, "", url);
    } catch {
      // bara en bekvämlighet - vyn fungerar utan
    }
  }

  const index = Math.max(
    0,
    flikar.findIndex((f) => f.surveyId === aktiv)
  );
  const flik = flikar[index];
  const forra = index > 0 ? flikar[index - 1] : null;
  const nasta = index < flikar.length - 1 ? flikar[index + 1] : null;
  const flikSvar = svar[flik.surveyId] ?? {};
  const st = status[flik.surveyId] ?? "idle";
  const harLattlast = flik.fragor.some((q) => q.lattlast);

  return (
    <div>
      {/* flikarna - scrollar i sidled på mobil i stället för att radbrytas */}
      <div role="tablist" aria-label="Kartans sidor" className="flex gap-2 overflow-x-auto pb-2 mb-4 -mx-1 px-1">
        {flikar.map((f) => {
          const vald = f.surveyId === flik.surveyId;
          const klar = arFlikKlar(f, svar[f.surveyId] ?? {});
          return (
            <button
              key={f.surveyId}
              type="button"
              role="tab"
              aria-selected={vald}
              onClick={() => byt(f.surveyId)}
              className={`shrink-0 text-left rounded-xl border px-3 py-2 transition-colors ${
                vald
                  ? "border-primary bg-primary text-white"
                  : "border-border bg-surface hover:border-primary"
              }`}
            >
              <span className={`block font-mono text-[10px] uppercase tracking-wider ${vald ? "text-white/80" : "text-muted"}`}>
                {f.lesson != null ? `Lektion ${f.lesson}` : "Sida"}
                {klar && <span aria-label="klar"> · ✓</span>}
              </span>
              <span className="block text-sm font-semibold whitespace-nowrap">{f.etikett}</span>
            </button>
          );
        })}
      </div>

      <div role="tabpanel">
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
          <h2 className="text-xl font-bold tracking-tight">{flik.titel}</h2>
          <span
            className={`text-xs ${st === "error" ? "text-error" : "text-muted"}`}
            aria-live="polite"
          >
            {st === "saving" && "Sparar…"}
            {st === "saved" && "Sparat"}
            {st === "error" && (fel || "Kunde inte spara - försöker igen när du skriver")}
          </span>
        </div>

        {flik.beskrivning && (
          <p className="text-sm text-muted leading-relaxed mb-4 max-w-prose">{flik.beskrivning}</p>
        )}

        {forra && (
          <details className="card p-4 mb-4">
            <summary className="cursor-pointer text-sm font-semibold">
              Din förra sida: {forra.etikett}
              {forra.lesson != null && <span className="text-muted font-normal"> (lektion {forra.lesson})</span>}
            </summary>
            <div className="mt-3">
              <TidigareSvar flik={forra} svar={svar[forra.surveyId] ?? {}} />
            </div>
          </details>
        )}

        {harLattlast && <LattlastVaxel pa={lattlast} />}

        {flik.fragor.map((q) => (
          <div key={q.id} className="card p-5 sm:p-6 mb-4">
            <p className="font-semibold tracking-tight mb-3 whitespace-pre-line">
              {lattlast && q.lattlast ? q.lattlast : q.text}
            </p>
            {q.type === "TABLE" ? (
              q.tabell ? (
                <TableQuestion
                  config={q.tabell as TabellConfig}
                  rutor={lasTabellsvar(flikSvar[String(q.id)])}
                  onChange={(rutor) => andra(flik.surveyId, q.id, byggTabellsvar(q.tabell!, rutor))}
                />
              ) : (
                <p className="text-sm text-error">
                  Den här tabellen är felaktigt uppsatt och går inte att visa. Säg till din lärare.
                </p>
              )
            ) : (
              <textarea
                value={flikSvar[String(q.id)] ?? ""}
                onChange={(e) => andra(flik.surveyId, q.id, e.target.value)}
                rows={5}
                aria-label={q.text}
                className="input-field text-sm"
              />
            )}
          </div>
        ))}

        <div className="flex items-center justify-between gap-3 mt-2">
          {forra ? (
            <button type="button" className="btn-secondary text-sm" onClick={() => byt(forra.surveyId)}>
              ← {forra.etikett}
            </button>
          ) : (
            <span />
          )}
          {nasta && (
            <button type="button" className="btn-secondary text-sm" onClick={() => byt(nasta.surveyId)}>
              {nasta.etikett} →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
