"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import TimelineQuestion from "@/components/TimelineQuestion";
import {
  formatAr,
  type ClientTimelineConfig,
  type TimelineAnswer,
  type TimelineResult,
  type TimelineUtfall,
} from "@/lib/tidslinje";
import { MAX_POANG, tolkaArtal, type KlientItem, type SpelSvar } from "@/lib/tidslinjespel";

/**
 * Tidslinjespelet för eleven: start, tio uppgifter med svar och återkoppling
 * en i taget, summering. Omgången och rättningen bor på servern - den här
 * komponenten ser aldrig facit förrän svaret på en uppgift kommit tillbaka.
 */

interface Rattning {
  poang: number;
  utfall: TimelineUtfall;
  result: TimelineResult;
  visning: ClientTimelineConfig;
  text: string | null;
  score: number;
  klar: boolean;
}

interface Props {
  slug: string;
  titel: string;
  basta: number | null;
  senaste: number | null;
  antalRundor: number;
}

const UTFALL_TEXT: Record<TimelineUtfall, string> = {
  ratt: "Rätt!",
  nara: "Nära!",
  fel: "Inte riktigt",
};
const UTFALL_KLASS: Record<TimelineUtfall, string> = {
  ratt: "text-success",
  nara: "text-accent",
  fel: "text-error",
};

export default function TidslinjespelRunner({ slug, titel, basta, senaste, antalRundor }: Props) {
  const [fas, setFas] = useState<"start" | "spel" | "summa">("start");
  const [roundId, setRoundId] = useState<number | null>(null);
  const [items, setItems] = useState<KlientItem[]>([]);
  const [index, setIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [poangLista, setPoangLista] = useState<number[]>([]);
  const [rattning, setRattning] = useState<Rattning | null>(null);
  const [laddar, setLaddar] = useState(false);
  const [fel, setFel] = useState<string | null>(null);
  const [rekord, setRekord] = useState(basta);
  const [nyttRekord, setNyttRekord] = useState(false);

  async function starta() {
    setLaddar(true);
    setFel(null);
    try {
      const res = await fetch(`/api/spel/tidslinje/${encodeURIComponent(slug)}/runda`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Kunde inte starta en omgång");
      setRoundId(data.roundId);
      setItems(data.items);
      setIndex(0);
      setScore(0);
      setPoangLista([]);
      setRattning(null);
      setFas("spel");
    } catch (e) {
      setFel(e instanceof Error ? e.message : "Något gick fel");
    } finally {
      setLaddar(false);
    }
  }

  async function svara(svar: SpelSvar) {
    if (roundId === null || laddar) return;
    setLaddar(true);
    setFel(null);
    try {
      const res = await fetch(`/api/spel/tidslinje/runda/${roundId}/svar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ index, svar }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Svaret kunde inte sparas");
      setRattning(data);
      setScore(data.score);
      setPoangLista((p) => [...p, data.poang]);
    } catch (e) {
      setFel(e instanceof Error ? e.message : "Något gick fel");
    } finally {
      setLaddar(false);
    }
  }

  function nasta() {
    if (rattning?.klar) {
      // Rekord räknas bara mot en tidigare omgång - den första är ingen bedrift att slå.
      setNyttRekord(rekord !== null && score > rekord);
      setRekord((r) => Math.max(r ?? 0, score));
      setFas("summa");
    } else {
      setIndex((i) => i + 1);
    }
    setRattning(null);
  }

  const maxScore = items.length * MAX_POANG;

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 sm:py-10">
      <div className="flex items-center justify-between gap-4 mb-6">
        <Link href="/student" className="text-sm text-primary hover:underline">
          &larr; Tillbaka
        </Link>
        {fas === "spel" && (
          <span className="text-sm font-medium tabular-nums">
            {score} poäng
          </span>
        )}
      </div>

      {fas === "start" && (
        <div className="card p-6 sm:p-8">
          <div className="font-mono text-[11px] uppercase tracking-wider text-muted mb-2">Tidslinjespelet</div>
          <h1 className="text-3xl font-bold tracking-tight">{titel}</h1>
          <p className="text-muted mt-3 max-w-prose">
            Tio uppgifter per omgång: placera händelser på tidslinjen, skriv årtalet och sätt händelser i rätt
            ordning. Ju närmare du kommer, desto fler poäng - högst {MAX_POANG} per uppgift.
          </p>
          {antalRundor > 0 && (
            <p className="text-sm text-muted mt-4">
              Ditt rekord: <strong className="text-foreground">{rekord}</strong> · senaste omgången: {senaste} ·{" "}
              {antalRundor} {antalRundor === 1 ? "omgång" : "omgångar"} spelade
            </p>
          )}
          <button type="button" onClick={starta} disabled={laddar} className="btn-primary mt-6">
            {laddar ? "Startar..." : "Starta en omgång"}
          </button>
        </div>
      )}

      {fas === "spel" && items[index] && (
        <div>
          <div className="h-1.5 bg-surface-muted rounded-full overflow-hidden mb-2">
            <div
              className="h-full bg-primary rounded-full transition-all duration-300"
              style={{ width: `${((index + (rattning ? 1 : 0)) / items.length) * 100}%` }}
            />
          </div>
          <div className="text-xs text-muted mb-5">
            Uppgift {index + 1} av {items.length}
          </div>
          <Uppgift
            key={index}
            item={items[index]}
            rattning={rattning}
            laddar={laddar}
            onSvar={svara}
          />
          {rattning && (
            <div className="card p-4 mt-4 flex items-center justify-between gap-4">
              <div>
                <span className={`font-bold ${UTFALL_KLASS[rattning.utfall]}`}>{UTFALL_TEXT[rattning.utfall]}</span>{" "}
                <span className="text-sm text-muted">+{rattning.poang} poäng</span>
                {rattning.text && <p className="text-sm mt-1">{rattning.text}</p>}
              </div>
              <button type="button" onClick={nasta} className="btn-primary shrink-0" autoFocus>
                {rattning.klar ? "Se resultatet" : "Nästa"}
              </button>
            </div>
          )}
        </div>
      )}

      {fas === "summa" && (
        <div className="card p-6 sm:p-8">
          <div className="font-mono text-[11px] uppercase tracking-wider text-muted mb-2">Omgången klar</div>
          <div className="text-5xl font-bold text-primary tabular-nums">
            {score}
            <span className="text-xl text-muted"> / {maxScore}</span>
          </div>
          {nyttRekord && (
            <p className="text-success font-medium mt-2">Nytt rekord!</p>
          )}
          <div className="flex flex-wrap gap-1.5 mt-5" aria-label="Poäng per uppgift">
            {poangLista.map((p, i) => (
              <span
                key={i}
                className={`text-xs tabular-nums px-2 py-1 rounded-md border ${
                  p === MAX_POANG ? "text-success" : p >= 50 ? "text-accent" : "text-error"
                }`}
              >
                {i + 1}: {p}
              </span>
            ))}
          </div>
          <div className="flex flex-wrap gap-3 mt-6">
            <button type="button" onClick={starta} disabled={laddar} className="btn-primary">
              {laddar ? "Startar..." : "Spela igen"}
            </button>
            <Link href="/student" className="btn-secondary">
              Tillbaka till kursen
            </Link>
          </div>
        </div>
      )}

      {fel && (
        <p className="text-sm text-error mt-4" role="alert">
          {fel}
        </p>
      )}
    </div>
  );
}

// --- En uppgift ---------------------------------------------------------------

interface UppgiftProps {
  item: KlientItem;
  rattning: Rattning | null;
  laddar: boolean;
  onSvar: (svar: SpelSvar) => void;
}

export function Uppgift({ item, rattning, laddar, onSvar }: UppgiftProps) {
  if (item.form === "placera") return <PlaceraUppgift item={item} rattning={rattning} laddar={laddar} onSvar={onSvar} />;
  if (item.form === "skriv") return <SkrivUppgift item={item} rattning={rattning} laddar={laddar} onSvar={onSvar} />;
  return <OrdnaUppgift item={item} rattning={rattning} laddar={laddar} onSvar={onSvar} />;
}

function Rubrik({ fraga, text }: { fraga: string; text?: string }) {
  return (
    <div className="mb-4">
      <div className="text-sm text-muted">{fraga}</div>
      {text && <div className="text-2xl font-bold tracking-tight mt-1">{text}</div>}
    </div>
  );
}

function Facit({ rattning, ledtext }: { rattning: Rattning; ledtext?: string }) {
  return (
    <TimelineQuestion
      config={rattning.visning}
      value={null}
      onChange={() => {}}
      disabled
      result={rattning.result}
      ledtextEfterSvar={ledtext}
    />
  );
}

function PlaceraUppgift({
  item,
  rattning,
  laddar,
  onSvar,
}: UppgiftProps & { item: Extract<KlientItem, { form: "placera" }> }) {
  const [value, setValue] = useState<TimelineAnswer | null>(null);
  return (
    <div>
      <Rubrik fraga="Var på tidslinjen hör händelsen hemma?" text={item.rubrik} />
      {rattning ? (
        <Facit rattning={rattning} />
      ) : (
        <>
          <TimelineQuestion config={item.config} value={value} onChange={setValue} disabled={laddar} result={null} />
          <button
            type="button"
            className="btn-primary mt-3"
            disabled={laddar || value?.ar === undefined}
            onClick={() => value?.ar !== undefined && onSvar({ ar: value.ar })}
          >
            Svara
          </button>
        </>
      )}
    </div>
  );
}

/** Det skrivna årtalet, med växeln som tolkning när texten inte själv säger f.Kr. */
export function skrivetAr(text: string, foreKristus: boolean): number | null {
  const ar = tolkaArtal(text);
  if (ar === null) return null;
  if (foreKristus && ar > 0) return -ar;
  return ar;
}

function SkrivUppgift({
  item,
  rattning,
  laddar,
  onSvar,
}: UppgiftProps & { item: Extract<KlientItem, { form: "skriv" }> }) {
  const [text, setText] = useState("");
  const [foreKristus, setForeKristus] = useState(false);
  const ar = skrivetAr(text, foreKristus);

  function skicka(e: FormEvent) {
    e.preventDefault();
    if (ar !== null) onSvar({ ar });
  }

  return (
    <div>
      <Rubrik fraga="Vilket år?" text={item.rubrik} />
      {rattning ? (
        <Facit
          rattning={rattning}
          ledtext={rattning.result.klick !== null ? `Du skrev ${formatAr(rattning.result.klick)}.` : ""}
        />
      ) : (
        <form onSubmit={skicka} className="flex flex-wrap items-center gap-3">
          <input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            autoFocus
            aria-label="Årtal"
            placeholder="t.ex. 1066"
            className="input-field w-40 text-lg tabular-nums"
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={laddar}
          />
          <div className="inline-flex rounded-lg border overflow-hidden" role="group" aria-label="Före eller efter Kristus">
            {[
              { varde: false, etikett: "e.Kr." },
              { varde: true, etikett: "f.Kr." },
            ].map((v) => (
              <button
                key={v.etikett}
                type="button"
                aria-pressed={foreKristus === v.varde}
                onClick={() => setForeKristus(v.varde)}
                className={`px-3 py-2 text-sm font-medium ${
                  foreKristus === v.varde ? "bg-primary text-white" : "bg-transparent"
                }`}
              >
                {v.etikett}
              </button>
            ))}
          </div>
          <button type="submit" className="btn-primary" disabled={laddar || ar === null}>
            Svara
          </button>
          <p className="w-full text-sm text-muted min-h-5">
            {text.trim() === "" ? "" : ar === null ? "Skriv ett årtal, t.ex. 1066 eller 509 f.Kr." : `Ditt svar: ${formatAr(ar)}`}
          </p>
        </form>
      )}
    </div>
  );
}

function OrdnaUppgift({
  item,
  rattning,
  laddar,
  onSvar,
}: UppgiftProps & { item: Extract<KlientItem, { form: "ordna" }> }) {
  const [valda, setValda] = useState<number[]>([]);
  const klart = valda.length === item.kort.length;

  return (
    <div>
      <Rubrik
        fraga={
          item.kort.length === 2
            ? "Vilken kom först? Tryck på den äldsta händelsen först."
            : "Sätt händelserna i ordning. Tryck på dem en i taget, äldst först."
        }
      />
      {rattning ? (
        <Facit rattning={rattning} />
      ) : (
        <>
          <div className="grid gap-2 sm:grid-cols-2">
            {item.kort.map((k) => {
              const plats = valda.indexOf(k.id);
              return (
                <button
                  key={k.id}
                  type="button"
                  disabled={laddar || plats >= 0}
                  onClick={() => setValda((v) => [...v, k.id])}
                  className={`card p-4 text-left flex items-center gap-3 ${plats >= 0 ? "opacity-60" : "card-hover"}`}
                >
                  <span
                    className={`w-7 h-7 shrink-0 rounded-full border-2 flex items-center justify-center text-sm font-bold ${
                      plats >= 0 ? "bg-primary text-white border-primary" : "text-muted"
                    }`}
                  >
                    {plats >= 0 ? plats + 1 : ""}
                  </span>
                  <span className="font-medium">{k.rubrik}</span>
                </button>
              );
            })}
          </div>
          <div className="flex gap-3 mt-3">
            <button type="button" className="btn-primary" disabled={laddar || !klart} onClick={() => onSvar({ ordning: valda })}>
              Svara
            </button>
            {valda.length > 0 && (
              <button type="button" className="btn-secondary" disabled={laddar} onClick={() => setValda((v) => v.slice(0, -1))}>
                Ångra
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
