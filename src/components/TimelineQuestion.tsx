"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";
import {
  epokFor,
  formatAr,
  mening,
  type ClientTimelineConfig,
  type TimelineAnswer,
  type TimelineResult,
} from "@/lib/tidslinje";

/**
 * Tidslinjen eleven klickar i. Ritas som SVG i pixelmått (inte viewBox), så
 * att texten är lika stor på en telefon som på en projektor - bredden mäts
 * från behållaren, höjden är fast.
 *
 * Före svar visas bara ankarnas rubriker; efter svar ritas facit in och
 * rubrikerna avslöjas. Toleransen sitter i år på servern, så eleven kan
 * trycka, se sitt val och trycka igen innan hen svarar.
 */

interface Props {
  config: ClientTimelineConfig;
  value: TimelineAnswer | null;
  onChange: (value: TimelineAnswer | null) => void;
  disabled: boolean;
  result: TimelineResult | null;
}

// Lodrät layout, uppifrån: epokband, remsa för markörpiller (två rader),
// två etikettrader ovanför baslinjen, baslinjen, två etikettrader nedanför,
// årsstrecken. Etikettraderna ligger 36 px isär så år och rubrik får plats.
const HOJD = 288;
const BAND = 26; // epokbandets höjd
const EPOKNAMN_Y = BAND + 12; // epoknamn som inte får plats i bandet skrivs under det
const PILL_Y = BAND + 30; // första pillraden
const BAS = 180; // baslinjen
const AXEL_TEXT = 280;
const RAD_AVSTAND = 36;
const KANT = 12; // marginal i sidled så en prick vid spannets ände inte klipps
const PRICK_RACKVIDD = 22; // px i sidled inom vilka ett tryck räknas som en prick

interface Etikett {
  x: number;
  ar: string;
  rubrik: string;
  ton: "ankare" | "ratt" | "fel" | "neutral";
}

/** Fyra rader: ovanför nära, nedanför nära, ovanför långt, nedanför långt. */
const RADER: { sida: -1 | 1; rad: number }[] = [
  { sida: -1, rad: 0 },
  { sida: 1, rad: 0 },
  { sida: -1, rad: 1 },
  { sida: 1, rad: 1 },
];

function textBredd(s: string, px: number): number {
  return s.length * px * 0.56;
}

/** Etikettens mittpunkt hålls inom ytan så rubriken inte klipps vid kanten. */
function klamd(x: number, w: number, W: number): number {
  return Math.min(Math.max(x, w / 2 + 4), Math.max(W - w / 2 - 4, w / 2 + 4));
}

/** Ger varje etikett en rad utan överlapp i sidled, i x-ordning. Samma
 * algoritm som tidslinjens egen: den som inte får plats ritas utan text.
 * Räknar på den klämda positionen - två etiketter vid samma kant hamnar
 * annars på samma rad och ovanpå varandra. */
function fordelaRader(etiketter: Etikett[], W: number): (number | null)[] {
  const upptaget: [number, number][][] = RADER.map(() => []);
  return etiketter.map((e) => {
    const w = Math.max(textBredd(e.rubrik, 13), textBredd(e.ar, 12)) + 12;
    const cx = klamd(e.x, w, W);
    const v = cx - w / 2;
    const h = cx + w / 2;
    for (let i = 0; i < RADER.length; i++) {
      if (upptaget[i].every(([a, b]) => h < a || v > b)) {
        upptaget[i].push([v, h]);
        return i;
      }
    }
    return null;
  });
}

function stegval(spann: number, bredd: number): number {
  const kandidater = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000];
  const max = Math.max(3, Math.floor(bredd / 90));
  for (const s of kandidater) if (spann / s <= max) return s;
  return 5000;
}

export default function TimelineQuestion({
  config,
  value,
  onChange,
  disabled,
  result,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(640);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const uppdatera = () => setW(Math.max(280, el.clientWidth));
    uppdatera();
    const ro = new ResizeObserver(uppdatera);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { fran, till, form } = config;
  const spann = till - fran;
  const inre = W - KANT * 2;
  const X = (ar: number) => KANT + ((ar - fran) / spann) * inre;
  const arVid = (x: number) =>
    Math.round(Math.min(till, Math.max(fran, fran + ((x - KANT) / inre) * spann)));

  const enPrick = form === "peka" || form === "ordna";
  const valdOrdning = value?.ordning ?? [];
  const svarat = result !== null;

  function klick(e: MouseEvent<SVGSVGElement>) {
    if (disabled || svarat) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    if (enPrick) {
      // Närmaste prick i sidled avgör, inte DOM-träffen: två prickar nära
      // varandra har överlappande träffytor, och den som ritats sist skulle
      // annars ta båda klicken. Utanför räckhåll räknas klicket inte.
      let ar: number | null = null;
      let narmast = PRICK_RACKVIDD;
      for (const h of config.handelser) {
        const d = Math.abs(X(h.ar) - x);
        if (d < narmast) {
          narmast = d;
          ar = h.ar;
        }
      }
      if (ar === null) return;
      if (form === "peka") {
        onChange({ ar });
      } else {
        if (valdOrdning.includes(ar) || valdOrdning.length >= config.antal) return;
        onChange({ ordning: [...valdOrdning, ar] });
      }
      return;
    }
    onChange({ ar: arVid(x) });
  }

  function angra() {
    if (valdOrdning.length === 0) return;
    const rest = valdOrdning.slice(0, -1);
    onChange(rest.length ? { ordning: rest } : null);
  }

  // --- Vad som ska ritas ---
  const epoker = config.epoker
    .filter((e) => e.till > fran && e.fran < till)
    .sort((a, b) => a.fran - b.fran);

  const steg = stegval(spann, inre);
  const ticks: number[] = [];
  for (let a = Math.ceil(fran / steg) * steg; a <= till; a += steg) ticks.push(a);

  // Prickar: handelser plus, efter svar, målen som inte fanns bland dem.
  const prickar = config.handelser.map((h) => ({ ...h, mal: false }));
  const malPrickar =
    result && (form === "placera" || form === "epok")
      ? result.mal.map((m) => ({ ar: m.ar, etikett: m.rubrik, cirka: m.cirka, mal: true }))
      : [];

  const etiketter: Etikett[] = [];
  for (const h of config.handelser) {
    if (h.etikett) {
      etiketter.push({ x: X(h.ar), ar: formatAr(h.ar, h.cirka), rubrik: h.etikett, ton: "ankare" });
    }
  }
  if (result) {
    const avslojade = new Set(etiketter.map((e) => e.x));
    const lagg = (ar: number, rubrik: string, cirka: boolean | undefined, ton: Etikett["ton"]) => {
      const x = X(ar);
      if (avslojade.has(x)) return;
      avslojade.add(x);
      etiketter.push({ x, ar: formatAr(ar, cirka), rubrik, ton });
    };
    for (const m of result.mal) lagg(m.ar, m.rubrik, m.cirka, "ratt");
    if (result.klickad && !result.isCorrect) {
      lagg(result.klickad.ar, result.klickad.rubrik, result.klickad.cirka, "fel");
    }
    if (result.ordning) {
      for (const o of result.ordning) lagg(o.ar, o.rubrik, undefined, o.ratt ? "ratt" : "fel");
    }
  }
  etiketter.sort((a, b) => a.x - b.x);
  const rader = fordelaRader(etiketter, W);

  // Markörer: lodräta linjer med en liten pil för valt år och facit.
  const markorer: { ar: number; text: string; ton: "val" | "ratt" | "fel" }[] = [];
  if (form === "placera") {
    const valt = result ? result.klick : value?.ar;
    if (valt !== undefined && valt !== null) {
      const ton = !result ? "val" : result.isCorrect ? "ratt" : "fel";
      markorer.push({ ar: valt, text: `Du: ${formatAr(valt)}`, ton });
    }
    if (result && !result.isCorrect) {
      markorer.push({ ar: result.mal[0].ar, text: formatAr(result.mal[0].ar, result.mal[0].cirka), ton: "ratt" });
    }
  }
  // Epok: valet visas som markerat band, ingen pill - bandet ÄR svaret.
  const valdEpok =
    form === "epok" && !result && value?.ar !== undefined ? epokFor(value.ar, config.epoker) : null;

  // Ordna: nummer per vald prick; efter svar färgade efter rätt plats.
  const nummer = new Map<number, { n: number; ton: "val" | "ratt" | "fel" }>();
  if (form === "ordna") {
    const folj = result?.ordning ?? valdOrdning.map((ar) => ({ ar, ratt: undefined }));
    folj.forEach((o, i) =>
      nummer.set(o.ar, { n: i + 1, ton: o.ratt === undefined ? "val" : o.ratt ? "ratt" : "fel" })
    );
  }

  const FARG = {
    val: "var(--accent)",
    ratt: "var(--success-dark)",
    fel: "var(--error)",
    ankare: "var(--foreground, #1c1917)",
    neutral: "var(--muted)",
  } as const;

  const valdPrick = form === "peka" ? (result ? result.klick : value?.ar) : undefined;
  const cursor = disabled || svarat ? "default" : enPrick ? "pointer" : "crosshair";

  let ledtext: string;
  if (svarat) ledtext = "";
  else if (form === "placera")
    ledtext =
      value?.ar !== undefined
        ? `${mening(`Ditt val: ${formatAr(value.ar)}`)} Tryck igen för att flytta, eller svara.`
        : "Tryck på axeln där händelsen hör hemma.";
  else if (form === "epok")
    ledtext =
      value?.ar !== undefined
        ? mening(`Ditt val: ${epokFor(value.ar, config.epoker) ?? formatAr(value.ar)}`)
        : "Tryck i epoken där händelsen hör hemma.";
  else if (form === "peka")
    ledtext = value?.ar !== undefined ? mening(`Ditt val: pricken vid ${formatAr(value.ar)}`) : "Tryck på pricken.";
  else
    ledtext =
      valdOrdning.length > 0
        ? `${valdOrdning.length} av ${config.antal} valda.`
        : "Tryck på prickarna i tur och ordning, äldst först.";

  const kommentar = result?.mal.find((m) => m.kommentar)?.kommentar;

  return (
    <div ref={ref} className="w-full">
      <svg
        width={W}
        height={HOJD}
        role="img"
        aria-label="Tidslinje"
        onClick={klick}
        style={{ cursor, display: "block", touchAction: "manipulation", userSelect: "none" }}
        className="rounded-xl border border-border-light bg-surface"
      >
        {/* Epokband */}
        {epoker.map((e, i) => {
          const x1 = X(Math.max(e.fran, fran));
          const x2 = X(Math.min(e.till, till));
          const vald = result && form === "epok" && result.epokVald === e.namn && !result.isCorrect;
          const ratt = result && form === "epok" && result.epokRatt === e.namn;
          const fyll = ratt
            ? "var(--success-light)"
            : vald
              ? "var(--error-light)"
              : valdEpok === e.namn
                ? "var(--accent-light)"
                : i % 2
                  ? "var(--surface-muted)"
                  : "transparent";
          const namn = e.namn.toUpperCase();
          const namnBredd = textBredd(namn, 11) * 1.12 + 8;
          const farPlats = x2 - x1 >= namnBredd;
          // Smala band får namnet under bandet, varannat på en rad längre ned,
          // så att alla epoker går att läsa också på en telefon - annars går
          // epokfrågan inte att svara på.
          const nx = klamd((x1 + x2) / 2, namnBredd, W);
          return (
            <g key={e.namn}>
              <rect
                x={x1}
                y={0}
                width={Math.max(x2 - x1, 0)}
                height={BAND}
                fill={fyll}
                stroke={valdEpok === e.namn ? "var(--accent)" : "none"}
                strokeWidth={2}
              />
              {i > 0 && <line x1={x1} x2={x1} y1={0} y2={AXEL_TEXT - 14} stroke="var(--border)" />}
              <text
                x={farPlats ? (x1 + x2) / 2 : nx}
                y={farPlats ? 17 : EPOKNAMN_Y + (i % 2) * 12}
                textAnchor="middle"
                fontSize={farPlats ? 11 : 9.5}
                letterSpacing="0.12em"
                fill="var(--muted)"
              >
                {namn}
              </text>
            </g>
          );
        })}
        {/* Årsstreck */}
        {ticks.map((a) => (
          <g key={a}>
            <line x1={X(a)} x2={X(a)} y1={BAND} y2={AXEL_TEXT - 14} stroke="var(--border-light)" />
            <text
              x={Math.min(Math.max(X(a), textBredd(formatAr(a), 11) / 2 + 2), W - textBredd(formatAr(a), 11) / 2 - 2)}
              y={AXEL_TEXT}
              textAnchor="middle"
              fontSize={11}
              fill="var(--muted)"
            >
              {formatAr(a)}
            </text>
          </g>
        ))}
        <line x1={KANT} x2={W - KANT} y1={BAS} y2={BAS} stroke="var(--border)" strokeWidth={1.5} />

        {/* Markörer */}
        {markorer.map((m, i) => (
          <g key={`${m.ar}-${m.ton}`} pointerEvents="none">
            <line x1={X(m.ar)} x2={X(m.ar)} y1={BAND} y2={AXEL_TEXT - 14} stroke={FARG[m.ton]} strokeWidth={2} />
            <rect
              x={Math.min(Math.max(X(m.ar) - textBredd(m.text, 12) / 2 - 8, 2), W - textBredd(m.text, 12) - 18)}
              y={PILL_Y + (i % 2) * 22}
              rx={9}
              width={textBredd(m.text, 12) + 16}
              height={18}
              fill={FARG[m.ton]}
            />
            <text
              x={Math.min(Math.max(X(m.ar), textBredd(m.text, 12) / 2 + 10), W - textBredd(m.text, 12) / 2 - 10)}
              y={PILL_Y + 13 + (i % 2) * 22}
              textAnchor="middle"
              fontSize={12}
              fontWeight={600}
              fill="#fff"
            >
              {m.text}
            </text>
          </g>
        ))}

        {/* Etiketter */}
        {etiketter.map((e, i) => {
          const r = rader[i];
          if (r === null) return null;
          const { sida, rad } = RADER[r];
          const w = Math.max(textBredd(e.rubrik, 13), textBredd(e.ar, 12)) + 12;
          const x = klamd(e.x, w, W);
          const yRubrik = sida < 0 ? BAS - 22 - rad * RAD_AVSTAND : BAS + 40 + rad * RAD_AVSTAND;
          const yAr = yRubrik - 15;
          const yLinje1 = sida < 0 ? yRubrik + 4 : BAS + 8;
          const yLinje2 = sida < 0 ? BAS - 8 : yAr - 12;
          const farg = e.ton === "ankare" ? FARG.ankare : FARG[e.ton];
          return (
            <g key={`${e.x}-${e.rubrik}`} pointerEvents="none">
              <line x1={e.x} x2={e.x} y1={yLinje1} y2={yLinje2} stroke="var(--border)" />
              <text x={x} y={yAr} textAnchor="middle" fontSize={12} fontWeight={600} fill="var(--accent)">
                {e.ar}
              </text>
              <text x={x} y={yRubrik} textAnchor="middle" fontSize={13} fontWeight={600} fill={farg}>
                {e.rubrik}
              </text>
            </g>
          );
        })}

        {/* Prickar */}
        {[...prickar, ...malPrickar].map((h) => {
          const x = X(h.ar);
          const num = nummer.get(h.ar);
          const vald = valdPrick === h.ar;
          const ring = h.mal
            ? FARG.ratt
            : result && form === "peka" && result.mal[0].ar === h.ar
              ? FARG.ratt
              : vald
                ? result
                  ? FARG.fel
                  : FARG.val
                : num
                  ? FARG[num.ton]
                  : null;
          return (
            <g key={`${h.ar}-${h.mal ? "mal" : "h"}`} data-ar={h.mal ? undefined : h.ar}>
              {/* Träffyta för tumme */}
              <circle cx={x} cy={BAS} r={18} fill="transparent" />
              {ring && !num && <circle cx={x} cy={BAS} r={12} fill="none" stroke={ring} strokeWidth={2.5} />}
              {num ? (
                // Ordningsnumret sitter i pricken: ovanför eller nedanför
                // krockar det med etikettraderna på en smal skärm.
                <>
                  <circle cx={x} cy={BAS} r={11} fill={FARG[num.ton]} stroke="var(--surface)" strokeWidth={2} />
                  <text x={x} y={BAS + 4} textAnchor="middle" fontSize={11} fontWeight={700} fill="#fff">
                    {num.n}
                  </text>
                </>
              ) : (
                <circle cx={x} cy={BAS} r={7} fill={h.mal ? FARG.ratt : "var(--primary)"} stroke="var(--surface)" strokeWidth={2} />
              )}
            </g>
          );
        })}
      </svg>
      <div className="flex items-center justify-between gap-3 mt-2 min-h-6">
        <p className="text-sm text-muted" aria-live="polite">
          {ledtext}
        </p>
        {form === "ordna" && !svarat && valdOrdning.length > 0 && (
          <button type="button" onClick={angra} className="btn-secondary text-sm py-1 px-3">
            Ångra
          </button>
        )}
      </div>
      {kommentar && (
        <p className="text-sm mt-1" role="note">
          {kommentar}
        </p>
      )}
    </div>
  );
}
