import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { epokFor, formatAr } from "@/lib/tidslinje";
import {
  OMGANGS_STATUS_TEXT,
  lasRunda,
  omgangsStatus,
  type RundaItem,
} from "@/lib/tidslinjespel";
import OmgangKontroller from "@/components/admin/OmgangKontroller";

export const dynamic = "force-dynamic";

const TH = "p-3 font-semibold text-muted text-xs uppercase tracking-wider";
const FORM_TEXT = {
  placera: "Placera på linjen",
  skriv: "Skriv årtalet",
  epok: "Välj epok",
  ordna: "Sätt i ordning",
} as const;

const tidFormat = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Europe/Stockholm",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

function facit(item: RundaItem): string {
  if (item.form === "epok") {
    const m = item.config.mal[0];
    return `${m.rubrik} (${formatAr(m.ar, m.cirka)}) - ${epokFor(m.ar, item.config.epoker) ?? "?"}`;
  }
  return item.config.mal.map((m) => `${m.rubrik} (${formatAr(m.ar, m.cirka)})`).join(" → ");
}

/**
 * En omgång i lärarens vy: läge och knappar, uppgifterna med facit (samma
 * för alla elever) och resultatet per elev och per uppgift.
 */
export default async function OmgangAdminPage({
  params,
}: {
  params: Promise<{ courseId: string; releaseId: string }>;
}) {
  const { courseId, releaseId } = await params;
  const cId = Number(courseId);
  const id = Number(releaseId);
  if (isNaN(cId) || isNaN(id)) notFound();

  const [omgang, elever] = await Promise.all([
    prisma.timelineGameRelease.findUnique({
      where: { id },
      include: {
        unit: { select: { title: true } },
        rounds: {
          select: {
            studentId: true,
            items: true,
            answered: true,
            score: true,
            maxScore: true,
            finishedAt: true,
            createdAt: true,
          },
        },
      },
    }),
    prisma.student.findMany({
      where: { courseId: cId },
      orderBy: { number: "asc" },
      select: { id: true, number: true, username: true, isTest: true },
    }),
  ]);
  if (!omgang || omgang.courseId !== cId) notFound();

  const status = omgangsStatus(omgang);
  const uppgifter = lasRunda(omgang.items);
  const provkonton = new Set(elever.filter((e) => e.isTest).map((e) => e.id));
  const klassens = omgang.rounds.filter((r) => !provkonton.has(r.studentId));
  const klara = klassens.filter((r) => r.finishedAt);
  const rundaFor = new Map(omgang.rounds.map((r) => [r.studentId, r]));

  // Klassens snitt per uppgift, ur de besvarade uppgifterna i klassens försök.
  const perUppgift = uppgifter.map((_, i) => {
    const poang = klassens
      .map((r) => lasRunda(r.items)[i]?.poang)
      .filter((p): p is number => p !== undefined);
    return poang.length ? Math.round(poang.reduce((a, b) => a + b, 0) / poang.length) : null;
  });
  const snitt = klara.length ? Math.round(klara.reduce((a, r) => a + r.score, 0) / klara.length) : null;

  return (
    <div className="animate-fade-in">
      <Link href={`/admin/courses/${cId}/tidslinjespel`} className="text-sm text-primary hover:underline">
        &larr; Tidslinjespel
      </Link>
      <div className="flex flex-wrap items-baseline gap-3 mt-3 mb-1">
        <h1 className="text-2xl font-bold tracking-tight">{omgang.title}</h1>
        <span
          className={`badge text-xs ${
            status === "oppen" ? "bg-success-light text-success" : "bg-surface-muted text-muted"
          }`}
        >
          {OMGANGS_STATUS_TEXT[status]}
        </span>
      </div>
      <p className="text-sm text-muted mb-5">
        {omgang.unit?.title ?? "Inget moment"} · {formatAr(omgang.fran)} - {formatAr(omgang.till)} ·{" "}
        {uppgifter.length} uppgifter
        {omgang.excluded.length > 0 && ` · ${omgang.excluded.length} händelser urbockade`}
        {omgang.releasedAt && ` · släppt ${tidFormat.format(omgang.releasedAt)}`}
        {omgang.closedAt && ` · stängd ${tidFormat.format(omgang.closedAt)}`}
      </p>

      <OmgangKontroller
        courseId={cId}
        releaseId={omgang.id}
        status={status}
        harSpelats={omgang.rounds.length > 0}
      />

      <h2 className="text-lg font-semibold tracking-tight mt-10 mb-3">Uppgifterna</h2>
      <ol className="card divide-y divide-border-light">
        {uppgifter.map((item, i) => (
          <li key={i} className="p-3 flex items-start justify-between gap-4 text-sm">
            <span>
              <span className="text-muted">
                {i + 1}. {FORM_TEXT[item.form]}:
              </span>{" "}
              {facit(item)}
              {(item.form === "placera" || item.form === "skriv") && (
                <span className="text-muted"> · tolerans {item.config.tolerans} år</span>
              )}
            </span>
            <span className="tabular-nums whitespace-nowrap text-muted">
              {perUppgift[i] !== null ? (
                <>
                  snitt <strong className="text-foreground">{perUppgift[i]}</strong>
                </>
              ) : (
                "–"
              )}
            </span>
          </li>
        ))}
      </ol>

      <div className="flex flex-wrap items-baseline justify-between gap-x-4 mt-10 mb-3">
        <h2 className="text-lg font-semibold tracking-tight">Resultat</h2>
        <span className="text-sm text-muted">
          {klara.length} av {elever.length - provkonton.size} klara
          {snitt !== null && ` · snitt ${snitt} av ${uppgifter.length * 100}`}
        </span>
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border-light text-left">
              <th className={TH}>Elev</th>
              <th className={`${TH} text-center`}>Poäng</th>
              <th className={`${TH} text-center`}>Läge</th>
              <th className={`${TH} text-center`}>Spelad</th>
            </tr>
          </thead>
          <tbody>
            {elever.map((e) => {
              const r = rundaFor.get(e.id);
              return (
                <tr key={e.id} className="border-b border-border-light last:border-0">
                  <td className="p-3 whitespace-nowrap">
                    <Link
                      href={`/admin/courses/${cId}/students/${e.number}`}
                      className="font-semibold text-primary hover:underline"
                    >
                      #{e.number}
                    </Link>
                    <span className="text-muted-light font-mono text-xs ml-2">{e.username}</span>
                    {e.isTest && <span className="text-xs text-muted ml-2">(provkonto)</span>}
                  </td>
                  <td className="p-3 text-center tabular-nums font-semibold">
                    {r?.finishedAt ? r.score : <span className="text-muted-light">–</span>}
                  </td>
                  <td className="p-3 text-center text-muted">
                    {!r ? "Inte börjat" : r.finishedAt ? "Klar" : `${r.answered} av ${uppgifter.length}`}
                  </td>
                  <td className="p-3 text-center whitespace-nowrap text-muted">
                    {r ? tidFormat.format(r.finishedAt ?? r.createdAt) : "–"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
