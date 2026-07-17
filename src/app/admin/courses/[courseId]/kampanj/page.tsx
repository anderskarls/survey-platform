import { notFound } from "next/navigation";
import { loadKampanjView } from "@/lib/kampanj-data";
import type { SectorState } from "@/lib/kampanj";

export const dynamic = "force-dynamic";

// Arkiv v2.1-tokens - vyn är elevriktad projektorgrafik och följer
// designsystemet, inte adminappens tema
const ARKIV = {
  papper: "#F4EDE1",
  papper2: "#EBE1CF",
  black: "#1F1A15",
  black2: "#4A3F33",
  regel: "#2A221A",
  bordeaux: "#7A2E2E",
  marin: "#2C3E55",
  oliv: "#5A6A3A",
  ocker: "#B8862F",
};
const SERIF = '"Cormorant Garamond", Georgia, "Times New Roman", serif';
const SANS = '"Inter Tight", "Inter", system-ui, sans-serif';
const MONO = '"JetBrains Mono", ui-monospace, monospace';

const dateFormatter = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Europe/Stockholm",
  day: "numeric",
  month: "long",
  year: "numeric",
});

function rapportRad(s: SectorState): string {
  if (s.dimma) return "för få rapporter från fältet - sektorn står still.";
  if (s.deltaPosition === null)
    return `etablerar ställningar vid ${s.position}.`;
  if (s.deltaPosition < 0) {
    const kort =
      s.deltaForfallna !== null && s.deltaForfallna > 0
        ? ` - ${s.deltaForfallna} kort förföll`
        : "";
    return `retirerade ${-s.deltaPosition} enheter${kort}.`;
  }
  if (s.deltaPosition > 0) {
    const kort =
      s.deltaForfallna !== null && s.deltaForfallna < 0
        ? ` - ${-s.deltaForfallna} kort återtogs`
        : "";
    return `ryckte fram ${s.deltaPosition} enheter${kort}.`;
  }
  return "håller ställningarna.";
}

function riktning(s: SectorState): { tecken: string; farg: string } {
  if (s.dimma) return { tecken: "§", farg: ARKIV.black2 };
  if (s.deltaPosition === null || s.deltaPosition === 0)
    return { tecken: "●", farg: ARKIV.marin };
  return s.deltaPosition > 0
    ? { tecken: "▲", farg: ARKIV.oliv }
    : { tecken: "▼", farg: ARKIV.bordeaux };
}

// SVG-geometri: sektorer som kolumner, fronten som stegad linje
const MAP_W = 1000;
const MAP_H = 380;
const MAP_TOP = 28;
const MAP_BOTTOM = MAP_H - 44;

function yForPosition(position: number): number {
  return MAP_BOTTOM - ((MAP_BOTTOM - MAP_TOP) * position) / 100;
}

function FrontKarta({ sectors }: { sectors: SectorState[] }) {
  const colW = MAP_W / sectors.length;

  return (
    <svg
      viewBox={`0 0 ${MAP_W} ${MAP_H}`}
      role="img"
      aria-label="Frontkarta över sektorerna"
      style={{ width: "100%", height: "auto", display: "block" }}
    >
      <defs>
        <pattern
          id="dimma"
          width="10"
          height="10"
          patternTransform="rotate(45)"
          patternUnits="userSpaceOnUse"
        >
          <rect width="10" height="10" fill={ARKIV.papper2} />
          <line x1="0" y1="0" x2="0" y2="10" stroke={ARKIV.black2} strokeWidth="1.2" strokeOpacity="0.35" />
        </pattern>
      </defs>

      <rect x="0" y="0" width={MAP_W} height={MAP_H} fill={ARKIV.papper} />

      {sectors.map((s, i) => {
        const x = i * colW;
        if (s.dimma && s.position === null) {
          return (
            <g key={s.key}>
              <rect x={x} y={MAP_TOP} width={colW} height={MAP_BOTTOM - MAP_TOP} fill="url(#dimma)" />
            </g>
          );
        }
        const y = yForPosition(s.position ?? 0);
        return (
          <g key={s.key}>
            {/* Hållen terräng under fronten */}
            <rect
              x={x}
              y={y}
              width={colW}
              height={MAP_BOTTOM - y}
              fill={ARKIV.oliv}
              fillOpacity={s.dimma ? 0.12 : 0.22}
            />
            {s.dimma && (
              <rect x={x} y={MAP_TOP} width={colW} height={MAP_BOTTOM - MAP_TOP} fill="url(#dimma)" fillOpacity={0.7} />
            )}
            {/* Frontlinjen i sektorn */}
            <line
              x1={x + 4}
              y1={y}
              x2={x + colW - 4}
              y2={y}
              stroke={s.dimma ? ARKIV.black2 : ARKIV.bordeaux}
              strokeWidth={s.dimma ? 3 : 6}
              strokeDasharray={s.dimma ? "10 8" : undefined}
              strokeLinecap="round"
            />
            <text
              x={x + colW / 2}
              y={y - 12}
              textAnchor="middle"
              fontFamily={MONO}
              fontSize="20"
              fontWeight="bold"
              fill={ARKIV.black}
            >
              {s.position}
            </text>
          </g>
        );
      })}

      {/* Sektorgränser och ram */}
      {sectors.map((s, i) =>
        i === 0 ? null : (
          <line
            key={`grans-${s.key}`}
            x1={i * colW}
            y1={MAP_TOP}
            x2={i * colW}
            y2={MAP_BOTTOM}
            stroke={ARKIV.regel}
            strokeWidth="1"
            strokeOpacity="0.4"
            strokeDasharray="2 6"
          />
        )
      )}
      <line x1="0" y1={MAP_TOP} x2={MAP_W} y2={MAP_TOP} stroke={ARKIV.regel} strokeWidth="1.5" />
      <line x1="0" y1={MAP_BOTTOM} x2={MAP_W} y2={MAP_BOTTOM} stroke={ARKIV.regel} strokeWidth="1.5" />

      {/* Sektornamn */}
      {sectors.map((s, i) => (
        <text
          key={`namn-${s.key}`}
          x={i * colW + colW / 2}
          y={MAP_H - 16}
          textAnchor="middle"
          fontFamily={MONO}
          fontSize="15"
          letterSpacing="1.5"
          fill={ARKIV.black2}
        >
          {s.name.toUpperCase().slice(0, Math.floor(colW / 9))}
        </text>
      ))}
    </svg>
  );
}

export default async function KampanjPage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;
  const cId = Number(courseId);
  if (isNaN(cId)) notFound();

  const data = await loadKampanjView(cId);
  if (!data) notFound();

  const { report, senastVisad } = data;
  const idag = dateFormatter.format(new Date());

  return (
    <div
      style={{
        background: ARKIV.papper,
        color: ARKIV.black,
        fontFamily: SANS,
        border: `2px solid ${ARKIV.regel}`,
        padding: "2.5rem 3rem",
        minHeight: "85vh",
      }}
    >
      <header style={{ borderBottom: `1.5px solid ${ARKIV.regel}`, paddingBottom: "1.25rem", marginBottom: "1.75rem" }}>
        <div
          style={{
            fontFamily: MONO,
            fontSize: "0.8rem",
            letterSpacing: "2px",
            color: ARKIV.black2,
            textTransform: "uppercase",
            marginBottom: "0.5rem",
          }}
        >
          Dagsrapport § {data.courseName} § {idag}
          {senastVisad && ` § sedan ${dateFormatter.format(senastVisad)}`}
        </div>
        <h1 style={{ fontFamily: SERIF, fontSize: "3.2rem", fontWeight: 600, lineHeight: 1.05, margin: 0 }}>
          Läget vid <em style={{ color: ARKIV.bordeaux }}>fronten</em>
        </h1>
      </header>

      <FrontKarta sectors={report.sectors} />

      <section style={{ marginTop: "2rem" }}>
        <h2
          style={{
            fontFamily: MONO,
            fontSize: "0.85rem",
            letterSpacing: "2px",
            textTransform: "uppercase",
            color: ARKIV.black2,
            borderBottom: `1px solid ${ARKIV.regel}`,
            paddingBottom: "0.4rem",
            marginBottom: "1rem",
          }}
        >
          ▸ Rapporter per sektor
        </h2>
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "0.7rem" }}>
          {report.sectors.map((s) => {
            const r = riktning(s);
            return (
              <li
                key={s.key}
                style={{ display: "flex", alignItems: "baseline", gap: "0.9rem", fontSize: "1.45rem", lineHeight: 1.35 }}
              >
                <span style={{ color: r.farg, fontSize: "1.1rem", flexShrink: 0 }}>{r.tecken}</span>
                <span>
                  <strong style={{ fontFamily: SERIF, fontSize: "1.6rem", fontWeight: 600 }}>{s.name}</strong>{" "}
                  <span style={{ color: ARKIV.black2 }}>{rapportRad(s)}</span>
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      <footer
        style={{
          marginTop: "2.5rem",
          paddingTop: "1rem",
          borderTop: `1px solid ${ARKIV.regel}`,
          fontFamily: MONO,
          fontSize: "0.8rem",
          letterSpacing: "1.5px",
          color: ARKIV.black2,
          textTransform: "uppercase",
        }}
      >
        № aktiva soldater: {report.aktivaElever} · kort i schema:{" "}
        {report.sectors.reduce((n, s) => n + s.iSchema, 0)} · förfallna:{" "}
        {report.sectors.reduce((n, s) => n + s.forfallna, 0)}
      </footer>
    </div>
  );
}
