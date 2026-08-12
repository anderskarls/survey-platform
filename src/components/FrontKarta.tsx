// Frontkartan: temats kartbild avtäcks där klassen håller terrängen. Fronten
// är masken - bortom den ligger kartan nästan osynlig, och i krigsdimma
// ersätts den av skraffering (ADR 0001: en sektor med för tunn korttäckning
// speglar aldrig ett litet urval).
//
// Vid dagsrapporten animeras avtäckningen från läget vid förra rapporten till
// dagens. Rörelsen kommer ur deltaPosition, alltså samma data som
// rapportraderna - ingen egen animationsdata. Baslägena i markupen är
// slutlägena, så en webbläsare som inte animerar (eller en användare med
// prefers-reduced-motion) får dagens karta direkt och korrekt.
//
// Ren presentationskomponent utan DB-anrop, vilket gör den renderbar utanför
// appen: scripts/preview-kampanj.tsx.

import type { CSSProperties } from "react";
import { ARKIV, MONO } from "@/lib/arkiv";
import type { SectorState } from "@/lib/kampanj";

const MAP_W = 1000;
const MAP_H = 418;
/** Vänstermarginal för djupskalan */
const GUTTER_L = 52;
const PAD_R = 14;
const MAP_TOP = 34;
const MAP_BOTTOM = 342;

const X0 = GUTTER_L;
const X1 = MAP_W - PAD_R;

/** Avtäckningens längd per sektor, och förskjutningen mellan sektorer */
const DUR = 1.1;
const STEG = 0.13;

const ROMAN = [
  "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X",
  "XI", "XII", "XIII", "XIV", "XV", "XVI", "XVII", "XVIII", "XIX", "XX",
];

function yForPosition(position: number): number {
  return MAP_BOTTOM - ((MAP_BOTTOM - MAP_TOP) * position) / 100;
}

/** Sektornamn i namnbandet: radbryts på ordgräns, klipps bara som sista utväg */
function wrapName(name: string, maxChars: number): string[] {
  const words = name.trim().toUpperCase().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const cand = cur ? `${cur} ${w}` : w;
    if (!cur || cand.length <= maxChars) {
      cur = cand;
    } else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);

  const clip = (l: string) =>
    l.length > maxChars ? `${l.slice(0, Math.max(1, maxChars - 1))}…` : l;
  if (lines.length <= 2) return lines.map(clip);
  return [clip(lines[0]), clip(`${lines[1]} …`)];
}

interface Column {
  sector: SectorState;
  index: number;
  xStart: number;
  xEnd: number;
  xMid: number;
  /** Frontens y i sektorn; null när läget är okänt */
  y: number | null;
  /** Utgångslinjens y (läget vid förra dagsrapporten); null utan jämförelsepunkt */
  yPrev: number | null;
  /** Höjd hållen terräng nu och vid förra rapporten */
  h: number;
  hPrev: number | null;
}

export interface FrontKartaProps {
  sectors: SectorState[];
  /**
   * Temats kartbild. Rotrelativ i appen; förhandsvisningen skickar en
   * absolut file-URL eftersom den renderas utanför Next.
   */
  temaBild?: string;
  /**
   * Suffix på mask- och mönster-id:n. Appen visar en karta per sida och
   * behöver inte sätta det, men flera kartor i samma dokument (som i
   * förhandsvisningen) måste ha egna id:n - annars slår url(#...) i alla
   * kartor mot den först definierade masken.
   */
  instans?: string;
}

export function FrontKarta({
  sectors,
  temaBild = "/kampanj/tema/fronten.jpg",
  instans = "front",
}: FrontKartaProps) {
  const idMask = `hallen-${instans}`;
  const idDimma = `dimma-${instans}`;
  if (sectors.length === 0) {
    return (
      <svg
        viewBox={`0 0 ${MAP_W} ${MAP_H}`}
        role="img"
        aria-label="Frontkartan har inga sektorer än"
        style={{ width: "100%", height: "auto", display: "block" }}
      >
        <rect x="0" y="0" width={MAP_W} height={MAP_H} fill={ARKIV.papper} />
        <text
          x={MAP_W / 2}
          y={MAP_H / 2}
          textAnchor="middle"
          fontFamily={MONO}
          fontSize="16"
          letterSpacing="2"
          fill={ARKIV.black2}
        >
          KARTBLADET ÄR TOMT - INGA SEKTORER UPPRÄTTADE
        </text>
      </svg>
    );
  }

  const colW = (X1 - X0) / sectors.length;
  const columns: Column[] = sectors.map((sector, index) => {
    const xStart = X0 + index * colW;
    const y = sector.position === null ? null : yForPosition(sector.position);
    const yPrev =
      sector.position === null || sector.deltaPosition === null
        ? null
        : yForPosition(sector.position - sector.deltaPosition);
    return {
      sector,
      index,
      xStart,
      xEnd: xStart + colW,
      xMid: xStart + colW / 2,
      y,
      yPrev,
      h: y === null ? 0 : MAP_BOTTOM - y,
      hPrev: yPrev === null ? null : MAP_BOTTOM - yPrev,
    };
  });

  const maxChars = Math.max(5, Math.floor(colW / 9));
  /** När all frontrörelse har landat - då fälls efterhandsmarkeringarna in */
  const efter = DUR + (columns.length - 1) * STEG;

  /** Rörelse att animera: hoppas över när läget står still eller är okänt */
  function rorelse(c: Column): { fran: number; dy: number } | null {
    if (c.y === null || c.yPrev === null || c.sector.dimma) return null;
    if (c.yPrev === c.y) return null;
    return {
      fran: c.h === 0 ? 0 : (c.hPrev as number) / c.h,
      dy: c.yPrev - c.y,
    };
  }

  const css = `
.kampanj-avtack { animation: kampanj-avtack ${DUR}s cubic-bezier(.33,.1,.25,1) both; transform-box: view-box; transform-origin: 0 ${MAP_BOTTOM}px; }
.kampanj-glid { animation: kampanj-glid ${DUR}s cubic-bezier(.33,.1,.25,1) both; transform-box: view-box; }
.kampanj-efter { animation: kampanj-toning .55s ease-out both; }
@keyframes kampanj-avtack { from { transform: scaleY(var(--fran, 1)); } to { transform: scaleY(1); } }
@keyframes kampanj-glid { from { transform: translateY(var(--dy, 0px)); } to { transform: translateY(0); } }
@keyframes kampanj-toning { from { opacity: 0; } to { opacity: 1; } }
@media (prefers-reduced-motion: reduce) {
  .kampanj-avtack, .kampanj-glid, .kampanj-efter { animation: none; }
}`;

  return (
    <svg
      viewBox={`0 0 ${MAP_W} ${MAP_H}`}
      role="img"
      aria-label="Frontkarta över sektorerna. Läget per sektor står i rapportlistan under kartan."
      style={{ width: "100%", height: "auto", display: "block" }}
    >
      <style>{css}</style>

      <defs>
        <pattern
          id={idDimma}
          width="10"
          height="10"
          patternTransform="rotate(45)"
          patternUnits="userSpaceOnUse"
        >
          <rect width="10" height="10" fill={ARKIV.papper2} />
          <line x1="0" y1="0" x2="0" y2="10" stroke={ARKIV.black2} strokeWidth="1.2" strokeOpacity="0.35" />
        </pattern>

        {/* Hållen terräng: masken är fronten. Rektanglarna skalas upp från
            förra rapportens höjd, med botten som fästpunkt. */}
        <mask id={idMask} maskUnits="userSpaceOnUse" x={X0} y={MAP_TOP} width={X1 - X0} height={MAP_BOTTOM - MAP_TOP}>
          {columns.map((c) => {
            if (c.sector.dimma || c.y === null || c.h <= 0) return null;
            const r = rorelse(c);
            return (
              <rect
                key={`mask-${c.sector.key}`}
                x={c.xStart}
                y={c.y}
                width={colW}
                height={c.h}
                fill="#fff"
                className={r ? "kampanj-avtack" : undefined}
                style={
                  r
                    ? ({ "--fran": r.fran, animationDelay: `${c.index * STEG}s` } as CSSProperties)
                    : undefined
                }
              />
            );
          })}
        </mask>
      </defs>

      <rect x="0" y="0" width={MAP_W} height={MAP_H} fill={ARKIV.papper} />
      <rect x={X0} y={MAP_TOP} width={X1 - X0} height={MAP_BOTTOM - MAP_TOP} fill={ARKIV.papper2} fillOpacity="0.55" />

      {/* Mark bortom fronten: kartan finns, men går inte att läsa */}
      <image
        href={temaBild}
        x={X0}
        y={MAP_TOP}
        width={X1 - X0}
        height={MAP_BOTTOM - MAP_TOP}
        preserveAspectRatio="xMidYMid slice"
        opacity="0.13"
      />

      {/* Hållen terräng: kartan avtäckt, med en svag olivton som säger "vår" */}
      <g mask={`url(#${idMask})`}>
        <image
          href={temaBild}
          x={X0}
          y={MAP_TOP}
          width={X1 - X0}
          height={MAP_BOTTOM - MAP_TOP}
          preserveAspectRatio="xMidYMid slice"
        />
        <rect
          x={X0}
          y={MAP_TOP}
          width={X1 - X0}
          height={MAP_BOTTOM - MAP_TOP}
          fill={ARKIV.oliv}
          fillOpacity="0.1"
        />
      </g>

      {/* Krigsdimma */}
      {columns.map((c) =>
        c.sector.dimma ? (
          <rect
            key={`dimma-${c.sector.key}`}
            x={c.xStart}
            y={MAP_TOP}
            width={colW}
            height={MAP_BOTTOM - MAP_TOP}
            fill={`url(#${idDimma})`}
            fillOpacity={c.y === null ? 0.94 : 0.82}
          />
        ) : null
      )}

      {/* Djupskala */}
      {[0, 25, 50, 75, 100].map((v) => {
        const y = yForPosition(v);
        const markerad = v === 0 || v === 50 || v === 100;
        return (
          <g key={`skala-${v}`}>
            <line
              x1={X0}
              y1={y}
              x2={X1}
              y2={y}
              stroke={ARKIV.regel}
              strokeWidth="1"
              strokeOpacity={markerad ? 0.3 : 0.16}
              strokeDasharray="1 7"
            />
            {markerad && (
              <text
                x={X0 - 10}
                y={y + 4}
                textAnchor="end"
                fontFamily={MONO}
                fontSize="11"
                letterSpacing="0.5"
                fill={ARKIV.black2}
                fillOpacity="0.7"
              >
                {v}
              </text>
            )}
          </g>
        );
      })}

      {/* Rörelsen sedan förra rapporten, infälld när fronten har landat */}
      {columns.map((c) => {
        const r = rorelse(c);
        if (!r || c.y === null || c.yPrev === null) return null;
        const top = Math.min(c.y, c.yPrev);
        const hojd = Math.abs(c.yPrev - c.y);
        const vunnen = (c.sector.deltaPosition ?? 0) > 0;
        return (
          <g
            key={`rorelse-${c.sector.key}`}
            className="kampanj-efter"
            style={{ animationDelay: `${efter}s` }}
          >
            <rect
              x={c.xStart}
              y={top}
              width={colW}
              height={hojd}
              fill={vunnen ? ARKIV.oliv : ARKIV.bordeaux}
              fillOpacity={vunnen ? 0.16 : 0.18}
            />
            <line
              x1={c.xStart}
              y1={c.yPrev}
              x2={c.xEnd}
              y2={c.yPrev}
              stroke={ARKIV.black2}
              strokeWidth="1.5"
              strokeOpacity="0.55"
              strokeDasharray="6 5"
            />
            {hojd > 18 && (
              <path
                d={
                  vunnen
                    ? `M ${c.xMid} ${top + hojd / 2 - 6} l 7 11 l -14 0 Z`
                    : `M ${c.xMid} ${top + hojd / 2 + 6} l 7 -11 l -14 0 Z`
                }
                fill={vunnen ? ARKIV.oliv : ARKIV.bordeaux}
                fillOpacity="0.85"
              />
            )}
          </g>
        );
      })}

      {/* Flankförbindelser: den stegade linjens lodräta steg. Fälls in efter
          rörelsen - under avtäckningen står grannarna inte still. */}
      {columns.slice(0, -1).map((c, i) => {
        const next = columns[i + 1];
        if (c.y === null || next.y === null || c.y === next.y) return null;
        const dimmig = c.sector.dimma || next.sector.dimma;
        return (
          <line
            key={`steg-${c.sector.key}`}
            x1={c.xEnd}
            y1={c.y}
            x2={c.xEnd}
            y2={next.y}
            stroke={dimmig ? ARKIV.black2 : ARKIV.bordeaux}
            strokeWidth={dimmig ? 2.5 : 4}
            strokeOpacity={dimmig ? 0.5 : 0.85}
            strokeDasharray={dimmig ? "8 6" : undefined}
            className="kampanj-efter"
            style={{ animationDelay: `${efter}s` }}
          />
        );
      })}

      {/* Frontlinjen och lägesbrickan glider med avtäckningen */}
      {columns.map((c) => {
        const r = rorelse(c);
        const okant = c.y === null;
        const y = c.y ?? yForPosition(50);
        const over = y - 34 > MAP_TOP;
        const brickY = over ? y - 32 : y + 8;
        const w = 44;
        return (
          <g
            key={`front-${c.sector.key}`}
            className={r ? "kampanj-glid" : undefined}
            style={
              r
                ? ({ "--dy": `${r.dy}px`, animationDelay: `${c.index * STEG}s` } as CSSProperties)
                : undefined
            }
          >
            {c.y !== null && (
              <line
                x1={c.xStart}
                y1={c.y}
                x2={c.xEnd}
                y2={c.y}
                stroke={c.sector.dimma ? ARKIV.black2 : ARKIV.bordeaux}
                strokeWidth={c.sector.dimma ? 3 : 6}
                strokeDasharray={c.sector.dimma ? "10 8" : undefined}
                strokeLinecap="butt"
              />
            )}
            <rect
              x={c.xMid - w / 2}
              y={brickY}
              width={w}
              height={24}
              rx="2"
              fill={ARKIV.papper}
              fillOpacity="0.92"
              stroke={c.sector.dimma ? ARKIV.black2 : ARKIV.regel}
              strokeWidth="1"
              strokeOpacity={c.sector.dimma ? 0.5 : 0.8}
            />
            <text
              x={c.xMid}
              y={brickY + 17}
              textAnchor="middle"
              fontFamily={MONO}
              fontSize="16"
              fontWeight="bold"
              fill={c.sector.dimma ? ARKIV.black2 : ARKIV.black}
              fillOpacity={c.sector.dimma ? 0.75 : 1}
            >
              {okant ? "?" : c.sector.position}
            </text>
          </g>
        );
      })}

      {/* Kartram och sektorgränser */}
      {columns.slice(0, -1).map((c) => (
        <line
          key={`grans-${c.sector.key}`}
          x1={c.xEnd}
          y1={MAP_TOP}
          x2={c.xEnd}
          y2={MAP_BOTTOM}
          stroke={ARKIV.regel}
          strokeWidth="1"
          strokeOpacity="0.35"
          strokeDasharray="2 6"
        />
      ))}
      <line x1={X0} y1={MAP_TOP} x2={X1} y2={MAP_TOP} stroke={ARKIV.regel} strokeWidth="1.5" />
      <line x1={X0} y1={MAP_BOTTOM} x2={X1} y2={MAP_BOTTOM} stroke={ARKIV.regel} strokeWidth="1.5" />
      <line x1={X0} y1={MAP_TOP} x2={X0} y2={MAP_BOTTOM} stroke={ARKIV.regel} strokeWidth="1" strokeOpacity="0.5" />
      <line x1={X1} y1={MAP_TOP} x2={X1} y2={MAP_BOTTOM} stroke={ARKIV.regel} strokeWidth="1" strokeOpacity="0.5" />

      {/* Namnband: sektorsbeteckning och namn på ordgräns */}
      {columns.map((c) => (
        <g key={`namn-${c.sector.key}`}>
          <line
            x1={c.xMid}
            y1={MAP_BOTTOM}
            x2={c.xMid}
            y2={MAP_BOTTOM + 7}
            stroke={ARKIV.regel}
            strokeWidth="1"
            strokeOpacity="0.5"
          />
          <text
            x={c.xMid}
            y={MAP_BOTTOM + 24}
            textAnchor="middle"
            fontFamily={MONO}
            fontSize="10.5"
            letterSpacing="2"
            fill={ARKIV.black2}
            fillOpacity="0.65"
          >
            SEKTOR {ROMAN[c.index] ?? c.index + 1}
          </text>
          {wrapName(c.sector.name, maxChars).map((rad, i) => (
            <text
              key={`${c.sector.key}-rad-${i}`}
              x={c.xMid}
              y={MAP_BOTTOM + 44 + i * 17}
              textAnchor="middle"
              fontFamily={MONO}
              fontSize="12.5"
              letterSpacing="1.4"
              fill={c.sector.dimma ? ARKIV.black2 : ARKIV.black}
              fillOpacity={c.sector.dimma ? 0.7 : 1}
            >
              {rad}
            </text>
          ))}
        </g>
      ))}
    </svg>
  );
}
