import { notFound } from "next/navigation";
import { loadKampanjView } from "@/lib/kampanj-data";
import type { SectorState } from "@/lib/kampanj";
import { ARKIV, MONO, SANS, SERIF } from "@/lib/arkiv";
import { FrontKarta } from "@/components/FrontKarta";

export const dynamic = "force-dynamic";

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

      <ul
        style={{
          listStyle: "none",
          display: "flex",
          flexWrap: "wrap",
          gap: "0.4rem 1.6rem",
          margin: "0.9rem 0 0",
          padding: 0,
          fontFamily: MONO,
          fontSize: "0.78rem",
          letterSpacing: "1px",
          textTransform: "uppercase",
          color: ARKIV.black2,
        }}
      >
        <li>
          <span style={{ color: ARKIV.bordeaux, fontWeight: "bold" }}>▬</span> frontlinjen
        </li>
        <li>
          <span style={{ color: ARKIV.oliv }}>▨</span> avtäckt karta = hållen terräng
        </li>
        <li>
          <span style={{ color: ARKIV.black2 }}>┄</span> läget vid förra rapporten
        </li>
        <li>
          <span style={{ color: ARKIV.oliv }}>▲</span> återtagen mark ·{" "}
          <span style={{ color: ARKIV.bordeaux }}>▼</span> förlorad
        </li>
        <li>
          <span style={{ color: ARKIV.black2 }}>▧</span> krigsdimma - för få rapporter
        </li>
        <li>0-100 = andel kort i schema</li>
      </ul>

      <section style={{ marginTop: "1.6rem" }}>
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
