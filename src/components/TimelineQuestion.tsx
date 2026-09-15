"use client";

import { useEffect, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import {
  epokFor,
  formatAr,
  mening,
  type ClientTimelineConfig,
  type TimelineAnswer,
  type TimelineResult,
} from "@/lib/tidslinje";

/**
 * Tidslinjen eleven klickar i, ritad i samma formspråk som lärarens
 * tidslinje (repot historisk-tidslinje, designriktning 1c "Skolplanschen"):
 * tjock svart axel, epokgränser som svarta linjer, epoknamn i epokens färg,
 * årtal i mörka plattor (streckade vid cirka), händelser som flaggstänger
 * omväxlande över och under axeln, och ett epokfärgat band nertill.
 * Elevens val och facit ritas som quizlägets markörer: en lodrät linje
 * genom hela ytan med en färgad namnplatta.
 *
 * Grafiken är SVG i pixelmått, så att texten är lika stor på en telefon som
 * på en projektor - bredden mäts från behållaren, höjden är fast. Etiketterna
 * ligger som HTML ovanpå, så att långa rubriker kan radbrytas. Före svar
 * visas bara ankarnas rubriker. Toleransen sitter i år på servern, så eleven
 * kan trycka, se sitt val och trycka igen innan hen svarar.
 */

interface Props {
  config: ClientTimelineConfig;
  value: TimelineAnswer | null;
  onChange: (value: TimelineAnswer | null) => void;
  disabled: boolean;
  result: TimelineResult | null;
}

// Lodrät layout uppifrån: epoknamnen, två etikettrader ovanför axeln,
// axeln, två etikettrader under, årtalsskalan och epokbandet.
const TOPPRAD = 34;
const ETIKETT_H = 58; // årtalsplatta plus två rader rubrik
const OFF_NARA = 16; // stången till etiketten närmast axeln
const OFF_LANG = OFF_NARA + ETIKETT_H + 6; // stången till den yttre etiketten
const BAS = TOPPRAD + OFF_LANG + ETIKETT_H;
const INRE_H = BAS + OFF_LANG + ETIKETT_H + 26; // ytan ovanför bandet, med årtalsskalan
const BAND_H = 40;
const HOJD = INRE_H + BAND_H;
const RAM = 2; // behållarens kantlinje
const KANT = 12; // marginal i sidled så en prick vid spannets ände inte klipps
const PRICK_RACKVIDD = 22; // px i sidled inom vilka ett tryck räknas som en prick
const MARKOR_Y = 28; // översta markörplattan
const MARKOR_RAD = 26;

const TYPSNITT = '"Segoe UI", system-ui, sans-serif';

// Tidslinjens palett. Survey-appen har egna toner för rätt och fel, men
// här ska tidslinjen se ut som den eleverna sett på duken.
const FARG = {
  bg: "#fbfaf8",
  ink: "#1d1c1a",
  svart: "#333",
  svag: "#6b6558",
  dampad: "#928c82",
  ratt: "#4f7d55",
  nara: "#a8842f",
  fel: "#b0452c",
} as const;

const EPOKFARG: Record<string, string> = {
  Forntiden: "#8a769c",
  Antiken: "#c9a24b",
  Medeltiden: "#7d9c81",
  "Tidigmodern tid": "#bf7053",
  "Modern tid": "#6a89ab",
};
const RESERVFARG = ["#8a769c", "#c9a24b", "#7d9c81", "#bf7053", "#6a89ab"];

/** Okända epoknamn tar färg efter plats i ordningen, som i tidslinjen. */
function epokFarg(namn: string, i: number): string {
  return EPOKFARG[namn] ?? RESERVFARG[i % RESERVFARG.length];
}

/** Uppskattad bredd för fet text; SVG kan inte mäta vid serverrendering. */
function textBredd(s: string, px: number, spärr = 0): number {
  return s.length * (px * 0.6 + spärr);
}

function stegval(spann: number, bredd: number): number {
  const kandidater = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 2500, 5000];
  const max = Math.max(1, Math.floor(bredd / 110));
  for (const s of kandidater) if (spann / s <= max) return s;
  return 10000;
}

function plattaStil(cirka?: boolean): CSSProperties {
  return {
    display: "inline-block",
    background: cirka ? "#fff" : FARG.svart,
    color: cirka ? FARG.ink : "#fff",
    border: `2px ${cirka ? "dashed" : "solid"} ${FARG.svart}`,
    borderRadius: 5,
    padding: "0 7px",
    fontSize: 14,
    lineHeight: "18px",
    fontWeight: 700,
    fontVariantNumeric: "tabular-nums",
    whiteSpace: "nowrap",
  };
}

interface Markor {
  ar: number;
  farg: string;
  text: string;
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

  function klick(e: MouseEvent<HTMLDivElement>) {
    if (disabled || svarat) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left - RAM;
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

  // --- Epoker. Färgen följer platsen i hela listan, inte i utsnittet. ---
  const epoker = [...config.epoker]
    .sort((a, b) => a.fran - b.fran)
    .map((e, i) => ({ ...e, farg: epokFarg(e.namn, i) }))
    .filter((e) => e.till > fran && e.fran < till)
    .map((e) => ({ ...e, x1: X(Math.max(e.fran, fran)), x2: X(Math.min(e.till, till)) }));
  const valdEpok =
    form === "epok" && !svarat && value?.ar !== undefined ? epokFor(value.ar, config.epoker) : null;

  // --- Årtalsskalan ---
  const steg = stegval(spann, inre);
  const tickar: number[] = [];
  for (let a = Math.ceil(fran / steg) * steg; a <= till; a += steg) tickar.push(a);

  // --- Vad som avslöjas efter svar: år -> rubrik ---
  const avslojat = new Map<number, { rubrik: string; cirka?: boolean }>();
  if (result) {
    for (const m of result.mal) avslojat.set(m.ar, m);
    if (result.klickad) avslojat.set(result.klickad.ar, result.klickad);
    for (const o of result.ordning ?? []) {
      if (!avslojat.has(o.ar)) avslojat.set(o.ar, o);
    }
  }

  // --- Prickarna: händelserna plus, efter svar, målen som inte fanns bland dem ---
  const prickMap = new Map<number, { rubrik: string | null; cirka?: boolean; ur: boolean }>();
  for (const h of config.handelser) {
    prickMap.set(h.ar, { rubrik: h.etikett, cirka: h.cirka, ur: true });
  }
  for (const [ar, a] of avslojat) {
    const fore = prickMap.get(ar);
    prickMap.set(ar, { rubrik: a.rubrik, cirka: a.cirka ?? fore?.cirka, ur: fore?.ur ?? false });
  }
  const prickar = [...prickMap.entries()]
    .map(([ar, p]) => ({ ar, x: X(ar), ...p }))
    .sort((a, b) => a.ar - b.ar);

  // --- Etiketterna. Platser: a = ovanför, b = under, 0 = närmast axeln,
  // 1 = längre ut. Grannar växlar sida. Får en etikett inte plats står
  // pricken kvar ensam, samma regel som "för trångt" i tidslinjen. ---
  const etikettBredd = Math.min(150, Math.max(104, Math.floor(W * 0.42)));
  const kant: Record<string, number> = {};
  let nr = 0;
  const etiketter: {
    ar: number;
    x: number;
    lx: number;
    ovan: boolean;
    off: number;
    rubrik: string;
    cirka?: boolean;
  }[] = [];
  for (const p of prickar) {
    if (!p.rubrik) continue;
    const lx = Math.max(4, Math.min(p.x - 1, W - etikettBredd - 4));
    const forsta = nr++ % 2 === 0 ? "a" : "b";
    const andra = forsta === "a" ? "b" : "a";
    const plats = [forsta + "0", andra + "0", forsta + "1", andra + "1"].find(
      (s) => (kant[s] ?? -Infinity) <= lx
    );
    if (!plats) continue;
    kant[plats] = lx + etikettBredd + 8;
    etiketter.push({
      ar: p.ar,
      x: p.x,
      lx,
      ovan: plats[0] === "a",
      off: plats[1] === "0" ? OFF_NARA : OFF_LANG,
      rubrik: p.rubrik,
      cirka: p.cirka,
    });
  }

  // --- Markörerna: elevens val och facit, som i tidslinjens quizläge ---
  const markorer: Markor[] = [];
  if (!result) {
    if (form === "placera" && value?.ar !== undefined) {
      markorer.push({ ar: value.ar, farg: FARG.svag, text: `Du: ${formatAr(value.ar)}` });
    } else if (form === "peka" && value?.ar !== undefined) {
      markorer.push({ ar: value.ar, farg: FARG.svag, text: "Du" });
    } else if (form === "ordna") {
      valdOrdning.forEach((ar, i) => markorer.push({ ar, farg: FARG.svag, text: String(i + 1) }));
    }
  } else {
    const m = result.mal[0];
    const facit: Markor = { ar: m.ar, farg: FARG.svart, text: formatAr(m.ar, m.cirka) };
    if (form === "placera") {
      if (result.klick !== null) {
        markorer.push({
          ar: result.klick,
          farg: FARG[result.utfall],
          text: `Du: ${formatAr(result.klick)}`,
        });
      }
      if (!result.isCorrect) markorer.push(facit);
    } else if (form === "peka") {
      if (result.klick !== null) {
        markorer.push({
          ar: result.klick,
          farg: result.isCorrect ? FARG.ratt : FARG.fel,
          text: "Du",
        });
      }
      if (!result.isCorrect) markorer.push(facit);
    } else if (form === "epok") {
      markorer.push({ ...facit, farg: result.isCorrect ? FARG.ratt : FARG.svart });
    } else {
      (result.ordning ?? []).forEach((o, i) =>
        markorer.push({ ar: o.ar, farg: o.ratt ? FARG.ratt : FARG.fel, text: String(i + 1) })
      );
    }
  }
  // Plattorna fördelas på rader så att två nära markörer inte täcker varandra.
  const markorRader: [number, number][][] = [[], [], []];
  const plattor = markorer.map((mk) => {
    const w = textBredd(mk.text, 13) + 18;
    const x = X(mk.ar);
    const lx = Math.min(Math.max(x - w / 2, 2), W - w - 2);
    let rad = markorRader.findIndex((r) => r.every(([a, b]) => lx + w < a || lx > b));
    if (rad < 0) rad = 0;
    markorRader[rad].push([lx, lx + w]);
    return { ...mk, x, lx, y: MARKOR_Y + rad * MARKOR_RAD };
  });

  const cursor = disabled || svarat ? "default" : enPrick ? "pointer" : "crosshair";

  let ledtext: string;
  if (svarat) {
    ledtext =
      form === "placera" && result.klick !== null ? mening(`Du tryckte på ${formatAr(result.klick)}`) : "";
  } else if (form === "placera")
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
    <div className="w-full">
      <div
        ref={ref}
        onClick={klick}
        style={{
          position: "relative",
          height: HOJD + RAM * 2,
          background: FARG.bg,
          border: `${RAM}px solid ${FARG.svart}`,
          borderRadius: 10,
          overflow: "hidden",
          cursor,
          touchAction: "manipulation",
          userSelect: "none",
          fontFamily: TYPSNITT,
          color: FARG.ink,
        }}
      >
        <svg
          width={W}
          height={HOJD}
          role="img"
          aria-label="Tidslinje"
          style={{ position: "absolute", left: 0, top: 0, display: "block" }}
        >
          {/* Vald epok före svar: svag ton över epokens del av ytan */}
          {epoker
            .filter((e) => e.namn === valdEpok)
            .map((e) => (
              <rect
                key={e.namn}
                x={e.x1}
                y={0}
                width={Math.max(e.x2 - e.x1, 0)}
                height={INRE_H}
                fill={e.farg}
                fillOpacity={0.18}
              />
            ))}

          {/* Epokgränser och epoknamn */}
          {epoker.map((e) => {
            const namn = e.namn.toUpperCase();
            const ryms = e.x2 - Math.max(e.x1, 0) > textBredd(namn, 12, 3) + 20;
            return (
              <g key={e.namn}>
                {e.fran > fran && (
                  <rect x={e.x1 - 1} y={0} width={2} height={INRE_H} fill={FARG.svart} />
                )}
                {ryms && (
                  <text
                    x={Math.max(e.x1, 0) + 10}
                    y={22}
                    fontSize={12}
                    fontWeight={700}
                    letterSpacing={3}
                    fill={e.farg}
                  >
                    {namn}
                  </text>
                )}
              </g>
            );
          })}

          {/* Årtalsskalan */}
          {tickar.map((a) => {
            const t = formatAr(a);
            const w = textBredd(t, 12);
            return (
              <g key={a}>
                <line
                  x1={X(a)}
                  x2={X(a)}
                  y1={INRE_H - 6}
                  y2={INRE_H}
                  stroke={FARG.dampad}
                  strokeWidth={1}
                />
                <text
                  x={Math.min(Math.max(X(a), w / 2 + 2), W - w / 2 - 2)}
                  y={INRE_H - 10}
                  textAnchor="middle"
                  fontSize={12}
                  fill={FARG.dampad}
                  style={{ fontVariantNumeric: "tabular-nums" }}
                >
                  {t}
                </text>
              </g>
            );
          })}

          {/* Axeln */}
          <rect x={0} y={BAS - 1.5} width={W} height={3} fill={FARG.svart} />

          {/* Flaggstänger */}
          {etiketter.map((e) => (
            <rect
              key={e.ar}
              x={e.x - 1.25}
              y={e.ovan ? BAS - e.off : BAS}
              width={2.5}
              height={e.off}
              fill={FARG.svart}
            />
          ))}

          {/* Markörlinjer */}
          {plattor.map((m, i) => (
            <rect key={i} x={m.x - 1.5} y={0} width={3} height={INRE_H} fill={m.farg} />
          ))}

          {/* Prickar */}
          {prickar.map((p) => (
            <g key={p.ar} data-ar={p.ur ? p.ar : undefined}>
              {/* Träffyta för tumme */}
              <circle cx={p.x} cy={BAS} r={18} fill="transparent" />
              <circle cx={p.x} cy={BAS} r={5.5} fill={FARG.svart} />
            </g>
          ))}

          {/* Epokbandet */}
          <rect x={0} y={INRE_H} width={W} height={RAM} fill={FARG.svart} />
          {epoker.map((e) => {
            const namn = e.namn.toUpperCase();
            const bw = Math.max(e.x2 - e.x1, 0);
            const ratt = svarat && form === "epok" && result.epokRatt === e.namn;
            const fel = svarat && form === "epok" && result.epokVald === e.namn && !ratt;
            const vald = valdEpok === e.namn;
            // Första och sista fältet fyller ut till kanten, som bandet i tidslinjen.
            const bx = e.fran <= fran ? 0 : e.x1;
            const bb = (e.till >= till ? W : e.x2) - bx;
            const ramFarg = ratt ? FARG.ratt : fel ? FARG.fel : vald ? "#fff" : null;
            return (
              <g key={e.namn}>
                <rect x={bx} y={INRE_H + RAM} width={bb} height={BAND_H - RAM} fill={e.farg} />
                {bw > textBredd(namn, 11, 2) + 18 && (
                  <text
                    x={bx + 9}
                    y={INRE_H + RAM + 16}
                    fontSize={11}
                    fontWeight={700}
                    letterSpacing={2}
                    fill="#fff"
                  >
                    {namn}
                  </text>
                )}
                {ramFarg && (
                  <rect
                    x={bx + 3.5}
                    y={INRE_H + RAM + 3.5}
                    width={Math.max(bb - 7, 0)}
                    height={BAND_H - RAM - 7}
                    rx={3}
                    fill="none"
                    stroke={ramFarg}
                    strokeWidth={3}
                  />
                )}
                {vald && (
                  <rect
                    x={bx + 1}
                    y={INRE_H + RAM + 1}
                    width={Math.max(bb - 2, 0)}
                    height={BAND_H - RAM - 2}
                    rx={4}
                    fill="none"
                    stroke={FARG.svart}
                    strokeWidth={2}
                  />
                )}
              </g>
            );
          })}
        </svg>

        {/* Etiketter: årtalsplatta och rubrik, som HTML så rubriken kan radbrytas */}
        {etiketter.map((e) => (
          <div
            key={e.ar}
            style={{
              position: "absolute",
              left: e.lx,
              width: etikettBredd,
              pointerEvents: "none",
              ...(e.ovan ? { bottom: HOJD - (BAS - e.off) } : { top: BAS + e.off }),
            }}
          >
            <span style={plattaStil(e.cirka)}>{formatAr(e.ar, e.cirka)}</span>
            <div
              style={{
                marginTop: 3,
                fontSize: 14,
                fontWeight: 600,
                lineHeight: 1.15,
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
                textShadow: `0 0 3px ${FARG.bg}, 0 0 3px ${FARG.bg}`,
              }}
            >
              {e.rubrik}
            </div>
          </div>
        ))}

        {/* Markörernas namnplattor ligger överst */}
        {plattor.map((m, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              left: m.lx,
              top: m.y,
              padding: "1px 9px",
              borderRadius: 5,
              background: m.farg,
              color: "#fff",
              fontSize: 13,
              fontWeight: 700,
              whiteSpace: "nowrap",
              pointerEvents: "none",
            }}
          >
            {m.text}
          </div>
        ))}
      </div>
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
