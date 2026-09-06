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
 * Tidslinjen eleven klickar i, ritad som ett mätinstrument ("Linjal"):
 * en graderad axel med huvud- och understreck, händelserna som
 * flaggstänger med huvud, epokerna som en tunn färgremsa längs
 * överkanten, och elevens val som en nål med avläsning.
 *
 * Ritas i pixelmått (inte viewBox), så att texten är lika stor på en
 * telefon som på en projektor - bredden mäts från behållaren, höjden är
 * fast. Före svar visas bara ankarnas rubriker; efter svar ritas facit in
 * som grön flagga och det eleven valde färgas rött eller grönt.
 * Toleransen sitter i år på servern, så eleven kan trycka, se sitt val
 * och trycka igen innan hen svarar.
 */

interface Props {
  config: ClientTimelineConfig;
  value: TimelineAnswer | null;
  onChange: (value: TimelineAnswer | null) => void;
  disabled: boolean;
  result: TimelineResult | null;
}

// Lodrät layout, uppifrån: epokremsa, epoknamn, etikettrader (tre
// stånghöjder), baslinjen med gradering, årtalen. Måtten är komponentbladets.
const HOJD = 262;
const REMSA = 8; // epokremsans höjd
const REMSA_VALD = 12; // vald epok, före svar
const EPOKNAMN_Y = 26;
const BAS = 196; // baslinjen
const ARTAL_Y = BAS + 32;
const WASH_H = HOJD; // epokfältets wash täcker hela ytan
const TOPPAR = [150, 108, 66]; // stångtoppar för etiketterade händelser, rad 0-2
const TOPP_KONTEXT = 150; // prick utan etikett
const TOPP_KONTEXT_ALT = 126; // nära granne till en sådan
const NARA_GRANNE = 12; // px i sidled som räknas som nära
const NAL_TOPP = 44; // nålen före svar, med avläsningsruta
const NAL_TOPP_EFTER = 120; // nålen efter svar - rutan är borta, flaggorna får plats
const RUTA_Y = 30;
const KANT = 12; // marginal i sidled så en prick vid spannets ände inte klipps
const PRICK_RACKVIDD = 22; // px i sidled inom vilka ett tryck räknas som en prick

const MONO = "var(--font-geist-mono), ui-monospace, SFMono-Regular, Menlo, monospace";

const FARG = {
  val: "var(--accent)",
  valText: "var(--accent-hover)",
  valWash: "var(--accent-light)",
  ratt: "var(--success-dark)",
  rattWash: "var(--success-light)",
  fel: "var(--error)",
  felWash: "var(--error-light)",
  stang: "var(--primary)",
  text: "var(--foreground, #1c1917)",
  muted: "var(--muted)",
  mutedLight: "var(--muted-light)",
  border: "var(--border)",
  borderLight: "var(--border-light)",
  yta: "var(--surface)",
} as const;

/** Epokremsans ton: samma ljushet och kroma, olika kulör per epok. */
const EPOK_HUE: Record<string, number> = {
  Antiken: 75,
  Medeltiden: 150,
  "Nya tiden": 240,
  "Moderna tiden": 350,
};
function epokFarg(namn: string, i: number): string {
  const hue = EPOK_HUE[namn] ?? (75 + i * 73) % 360;
  return `oklch(72% 0.06 ${hue})`;
}

type Ton = "ankare" | "ratt" | "fel";

interface Stang {
  ar: number;
  /** Rubrik och årtal ovanför huvudet. Saknas för kontextprickar. */
  etikett: { rubrik: string; ar: string; ton: Ton } | null;
  /** Stångens och huvudets färg när den inte styrs av etiketten. */
  farg: string;
  /** Ordna: numret i kvadraten. */
  nummer: { n: number; farg: string } | null;
  /** Peka: ring runt huvudet. */
  ring: string | null;
}

function textBredd(s: string, px: number): number {
  return s.length * px * 0.56;
}

/** Etikettens mittpunkt hålls inom ytan så rubriken inte klipps vid kanten. */
function klamd(x: number, w: number, W: number): number {
  return Math.min(Math.max(x, w / 2 + 4), Math.max(W - w / 2 - 4, w / 2 + 4));
}

/** Ger varje etiketterad stång en rad (topp) utan överlapp i sidled, i
 * x-ordning. Räknar på den klämda positionen - två etiketter vid samma
 * kant hamnar annars på samma rad och ovanpå varandra. Den som inte får
 * plats på någon rad ritas som kontextprick. */
function fordelaToppar(
  stanger: { x: number; rubrik: string; ar: string }[],
  W: number
): (number | null)[] {
  const upptaget: [number, number][][] = TOPPAR.map(() => []);
  return stanger.map((s) => {
    const w = Math.max(textBredd(s.rubrik, 13), textBredd(s.ar, 11)) + 12;
    const cx = klamd(s.x, w, W);
    const v = cx - w / 2;
    const h = cx + w / 2;
    for (let i = 0; i < TOPPAR.length; i++) {
      if (upptaget[i].every(([a, b]) => h < a || v > b)) {
        upptaget[i].push([v, h]);
        return TOPPAR[i];
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

  // --- Epoker ---
  const epoker = config.epoker
    .filter((e) => e.till > fran && e.fran < till)
    .sort((a, b) => a.fran - b.fran);
  // Epok: valet visas som markerat fält, ingen nål - fältet ÄR svaret.
  const valdEpok =
    form === "epok" && !svarat && value?.ar !== undefined ? epokFor(value.ar, config.epoker) : null;

  // --- Gradering ---
  const steg = stegval(spann, inre);
  const understeg = steg / 5;
  const streck: { ar: number; stor: boolean }[] = [];
  for (let a = Math.ceil(fran / understeg) * understeg; a <= till + 1e-9; a += understeg) {
    streck.push({ ar: a, stor: Math.abs(a / steg - Math.round(a / steg)) < 1e-9 });
  }

  // --- Vad som avslöjas efter svar: år -> rubrik och ton ---
  const avslojat = new Map<number, { rubrik: string; cirka?: boolean; ton: "ratt" | "fel" }>();
  if (result) {
    if (form !== "ordna") {
      const m = result.mal[0];
      avslojat.set(m.ar, { rubrik: m.rubrik, cirka: m.cirka, ton: "ratt" });
      if (form === "peka" && result.klickad && result.klickad.ar !== m.ar) {
        avslojat.set(result.klickad.ar, { ...result.klickad, ton: "fel" });
      }
    } else if (result.ordning) {
      for (const o of result.ordning) {
        avslojat.set(o.ar, { rubrik: o.rubrik, ton: o.ratt ? "ratt" : "fel" });
      }
    }
  }

  // Ordna: nummer per vald prick; efter svar färgade efter rätt plats.
  const nummer = new Map<number, { n: number; farg: string }>();
  if (form === "ordna") {
    const folj = result?.ordning ?? valdOrdning.map((ar) => ({ ar, ratt: undefined }));
    folj.forEach((o, i) =>
      nummer.set(o.ar, {
        n: i + 1,
        farg: o.ratt === undefined ? FARG.val : o.ratt ? FARG.ratt : FARG.fel,
      })
    );
  }

  // --- Stängerna: händelserna plus, efter svar, målen som inte fanns bland dem ---
  const valdPrick = form === "peka" && !svarat ? value?.ar : undefined;
  const alla = new Map<number, { etikett: string | null; cirka?: boolean }>();
  for (const h of config.handelser) alla.set(h.ar, h);
  for (const [ar] of avslojat) if (!alla.has(ar)) alla.set(ar, { etikett: null });

  const stanger: Stang[] = [...alla.entries()]
    .sort(([a], [b]) => a - b)
    .map(([ar, h]) => {
      const av = avslojat.get(ar);
      const etikett = av
        ? { rubrik: av.rubrik, ar: formatAr(ar, av.cirka), ton: av.ton }
        : h.etikett
          ? { rubrik: h.etikett, ar: formatAr(ar, h.cirka), ton: "ankare" as Ton }
          : null;
      const num = nummer.get(ar) ?? null;
      const farg = av ? FARG[av.ton] : FARG.stang;
      const ring = av?.ton === "fel" ? FARG.fel : valdPrick === ar ? FARG.val : null;
      return { ar, etikett, farg, nummer: num, ring };
    });

  // Etiketterade får rad efter plats; kontextprickar som står tätt får
  // olika höjd så båda går att se - och peka på.
  const etiketterade = stanger.filter((s) => s.etikett);
  const toppar = fordelaToppar(
    etiketterade.map((s) => ({ x: X(s.ar), rubrik: s.etikett!.rubrik, ar: s.etikett!.ar })),
    W
  );
  const toppFor = new Map<number, number>();
  const visaEtikett = new Set<number>();
  etiketterade.forEach((s, i) => {
    toppFor.set(s.ar, toppar[i] ?? TOPP_KONTEXT);
    if (toppar[i] !== null) visaEtikett.add(s.ar);
  });
  let forraX: number | null = null;
  let forraTopp = TOPP_KONTEXT_ALT;
  for (const s of stanger) {
    if (visaEtikett.has(s.ar)) continue;
    const x = X(s.ar);
    forraTopp =
      forraX !== null && x - forraX < NARA_GRANNE
        ? forraTopp === TOPP_KONTEXT
          ? TOPP_KONTEXT_ALT
          : TOPP_KONTEXT
        : TOPP_KONTEXT;
    toppFor.set(s.ar, forraTopp);
    forraX = x;
  }

  // --- Nålen (placera) ---
  const nal =
    form === "placera"
      ? svarat
        ? result.klick !== null
          ? { ar: result.klick, farg: result.isCorrect ? FARG.ratt : FARG.fel, ruta: false }
          : null
        : value?.ar !== undefined
          ? { ar: value.ar, farg: FARG.val, ruta: true }
          : null
      : null;

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

  // Vit halo bakom etikettext så den tål att korsa en stång.
  const halo = {
    paintOrder: "stroke" as const,
    stroke: FARG.yta,
    strokeWidth: 3,
    strokeLinejoin: "round" as const,
  };

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
        {/* Epokremsa och epokfält */}
        {epoker.map((e, i) => {
          const x1 = X(Math.max(e.fran, fran));
          const x2 = X(Math.min(e.till, till));
          const ratt = svarat && form === "epok" && result.epokRatt === e.namn;
          const fel = svarat && form === "epok" && result.epokVald === e.namn && !ratt;
          const vald = valdEpok === e.namn;
          const remsa = ratt ? FARG.ratt : fel ? FARG.fel : vald ? FARG.val : epokFarg(e.namn, i);
          const namn = ratt ? FARG.ratt : fel ? FARG.fel : vald ? FARG.valText : FARG.muted;
          const wash = ratt ? FARG.rattWash : fel ? FARG.felWash : vald ? FARG.valWash : null;
          return (
            <g key={e.namn}>
              {wash && <rect x={x1} y={0} width={Math.max(x2 - x1, 0)} height={WASH_H} fill={wash} />}
              <rect
                x={x1}
                y={0}
                width={Math.max(x2 - x1, 0)}
                height={vald ? REMSA_VALD : REMSA}
                fill={remsa}
              />
              {i > 0 && (
                <line x1={x1} x2={x1} y1={REMSA} y2={BAS} stroke={FARG.border} strokeDasharray="2 3" />
              )}
              <text
                x={x1 + 6}
                y={EPOKNAMN_Y}
                fontSize={10}
                letterSpacing="0.16em"
                fill={namn}
                style={{ fontFamily: MONO }}
              >
                {e.namn.toUpperCase()}
              </text>
            </g>
          );
        })}

        {/* Gradering */}
        {streck.map((s) => (
          <line
            key={s.ar}
            x1={X(s.ar)}
            x2={X(s.ar)}
            y1={BAS}
            y2={BAS + (s.stor ? 14 : 6)}
            stroke={s.stor ? FARG.muted : FARG.mutedLight}
            strokeWidth={1}
          />
        ))}
        {streck
          .filter((s) => s.stor)
          .map((s) => {
            const t = formatAr(s.ar);
            const w = textBredd(t, 11);
            return (
              <text
                key={s.ar}
                x={Math.min(Math.max(X(s.ar), w / 2 + 2), W - w / 2 - 2)}
                y={ARTAL_Y}
                textAnchor="middle"
                fontSize={11}
                fill={FARG.muted}
                style={{ fontFamily: MONO }}
              >
                {t}
              </text>
            );
          })}
        <line x1={KANT} x2={W - KANT} y1={BAS} y2={BAS} stroke={FARG.text} strokeWidth={1.5} />

        {/* Nålen */}
        {nal && (
          <g pointerEvents="none">
            <line
              x1={X(nal.ar)}
              x2={X(nal.ar)}
              y1={nal.ruta ? NAL_TOPP : NAL_TOPP_EFTER}
              y2={BAS + 18}
              stroke={nal.farg}
              strokeWidth={1.5}
            />
            <path
              d={`M${X(nal.ar) - 5},${BAS + 18} L${X(nal.ar) + 5},${BAS + 18} L${X(nal.ar)},${BAS + 10} Z`}
              fill={nal.farg}
            />
            {nal.ruta &&
              (() => {
                const t = formatAr(nal.ar);
                const w = textBredd(t, 12) + 18;
                const bx = Math.min(Math.max(X(nal.ar) - w / 2, 2), W - w - 2);
                return (
                  <>
                    <rect x={bx} y={RUTA_Y} width={w} height={22} rx={2} fill={FARG.yta} stroke={nal.farg} strokeWidth={1.5} />
                    <text
                      x={bx + w / 2}
                      y={RUTA_Y + 15}
                      textAnchor="middle"
                      fontSize={12}
                      fontWeight={600}
                      fill={FARG.valText}
                      style={{ fontFamily: MONO }}
                    >
                      {t}
                    </text>
                  </>
                );
              })()}
          </g>
        )}

        {/* Epok efter svar: var eleven tryckte */}
        {svarat && form === "epok" && result.klick !== null && (
          <g pointerEvents="none">
            <line
              x1={X(result.klick)}
              x2={X(result.klick)}
              y1={NAL_TOPP}
              y2={BAS}
              stroke={FARG.fel}
              strokeWidth={1.5}
              strokeDasharray="4 3"
            />
            <text
              x={X(result.klick)}
              y={NAL_TOPP - 4}
              textAnchor="middle"
              fontSize={11}
              fontWeight={600}
              fill={FARG.fel}
              style={{ fontFamily: MONO }}
            >
              DITT VAL
            </text>
          </g>
        )}

        {/* Flaggstänger */}
        {stanger.map((s) => {
          const x = X(s.ar);
          const topp = toppFor.get(s.ar) ?? TOPP_KONTEXT;
          const etikett = visaEtikett.has(s.ar) ? s.etikett : null;
          const farg = s.nummer ? s.nummer.farg : s.farg;
          const arFarg = etikett?.ton === "ankare" ? FARG.val : farg;
          const ur = config.handelser.some((h) => h.ar === s.ar);
          return (
            <g key={s.ar} data-ar={ur ? s.ar : undefined}>
              {/* Träffyta för tumme */}
              <circle cx={x} cy={BAS} r={18} fill="transparent" />
              <line x1={x} x2={x} y1={topp} y2={BAS} stroke={farg} strokeWidth={1.25} />
              {s.nummer ? (
                // Ordningsnumret sitter i stångens topp som en kvadrat.
                <>
                  <rect x={x - 9} y={topp - 9} width={18} height={18} rx={2} fill={farg} />
                  <text
                    x={x}
                    y={topp + 4}
                    textAnchor="middle"
                    fontSize={11}
                    fontWeight={600}
                    fill="#fff"
                    style={{ fontFamily: MONO }}
                  >
                    {s.nummer.n}
                  </text>
                </>
              ) : (
                <circle cx={x} cy={topp} r={4.5} fill={farg} />
              )}
              {s.ring && !s.nummer && (
                <circle cx={x} cy={topp} r={9} fill="none" stroke={s.ring} strokeWidth={2} />
              )}
              {etikett &&
                (() => {
                  const w = Math.max(textBredd(etikett.rubrik, 13), textBredd(etikett.ar, 11)) + 12;
                  const lx = klamd(x, w, W);
                  return (
                    <g pointerEvents="none">
                      <text
                        x={lx}
                        y={topp - 22}
                        textAnchor="middle"
                        fontSize={11}
                        fill={arFarg}
                        style={{ fontFamily: MONO }}
                        {...halo}
                      >
                        {etikett.ar}
                      </text>
                      <text
                        x={lx}
                        y={topp - 8}
                        textAnchor="middle"
                        fontSize={13}
                        fontWeight={600}
                        fill={etikett.ton === "ankare" ? FARG.text : farg}
                        {...halo}
                      >
                        {etikett.rubrik}
                      </text>
                    </g>
                  );
                })()}
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
