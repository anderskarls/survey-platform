import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getStudentSession } from "@/lib/student-session";
import { epokFor, formatAr } from "@/lib/tidslinje";
import { MAX_POANG, lasRunda, omgangsStatus, type RundaItem } from "@/lib/tidslinjespel";
import TidslinjespelRunner from "@/components/spel/TidslinjespelRunner";

export const dynamic = "force-dynamic";

const FORM_TEXT = { placera: "Placera", skriv: "Skriv årtalet", epok: "Epok", ordna: "Ordna" } as const;

/** Uppgiften som en rad i elevens resultat - facit får synas när omgången är spelad. */
function beskriv(item: RundaItem): string {
  const mal = item.config.mal;
  if (item.form === "ordna") return mal.map((m) => `${m.rubrik} (${formatAr(m.ar, m.cirka)})`).join(" → ");
  if (item.form === "epok") {
    const svar = item.svar?.epok ? ` · ditt svar ${item.svar.epok}` : "";
    return `${mal[0].rubrik} (${formatAr(mal[0].ar, mal[0].cirka)}) - ${epokFor(mal[0].ar, item.config.epoker) ?? "?"}${svar}`;
  }
  const svar = item.svar?.ar !== undefined ? ` · ditt svar ${formatAr(item.svar.ar)}` : "";
  return `${mal[0].rubrik} (${formatAr(mal[0].ar, mal[0].cirka)})${svar}`;
}

/**
 * En lärarsläppt omgång. Ett försök per elev: inte påbörjad eller påbörjad
 * ger spelet, spelad klart ger resultatet med facit, stängd utan att vara
 * klar ger ett besked.
 */
export default async function OmgangPage({ params }: { params: Promise<{ releaseId: string }> }) {
  const { releaseId } = await params;
  const id = Number(releaseId);
  const session = await getStudentSession();
  if (!session) redirect(`/login?next=${encodeURIComponent(`/spel/tidslinje/omgang/${releaseId}`)}`);
  if (!Number.isInteger(id)) notFound();

  const omgang = await prisma.timelineGameRelease.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      courseId: true,
      unitId: true,
      items: true,
      releasedAt: true,
      closedAt: true,
      rounds: {
        where: { studentId: session.studentId },
        select: { items: true, answered: true, score: true, maxScore: true, finishedAt: true },
      },
    },
  });
  if (!omgang || omgang.courseId !== session.courseId) notFound();
  const status = omgangsStatus(omgang);
  if (status === "dold") notFound();

  const tillbaka = omgang.unitId
    ? { href: `/student/moment/${omgang.unitId}`, text: "Tillbaka till momentet" }
    : { href: "/student", text: "Tillbaka till kursen" };
  const runda = omgang.rounds[0];
  const antal = Array.isArray(omgang.items) ? omgang.items.length : 0;

  if (runda?.finishedAt || (status === "stangd" && runda)) {
    const items = lasRunda(runda.items);
    return (
      <main className="min-h-screen">
        <div className="max-w-3xl mx-auto px-4 py-6 sm:py-10">
          <Link href={tillbaka.href} className="text-sm text-primary hover:underline">
            &larr; Tillbaka
          </Link>
          <div className="card p-6 sm:p-8 mt-6">
            <div className="font-mono text-[11px] uppercase tracking-wider text-muted mb-2">
              {runda.finishedAt ? "Din omgång" : "Omgången stängdes innan du var klar"}
            </div>
            <h1 className="text-2xl font-bold tracking-tight">{omgang.title}</h1>
            <div className="text-5xl font-bold text-primary tabular-nums mt-4">
              {runda.score}
              <span className="text-xl text-muted"> / {runda.maxScore}</span>
            </div>
            <ol className="mt-6 divide-y divide-border-light">
              {items.map((item, i) => (
                <li key={i} className="py-2.5 flex items-start justify-between gap-4 text-sm">
                  <span>
                    <span className="text-muted">
                      {i + 1}. {FORM_TEXT[item.form]}:
                    </span>{" "}
                    {beskriv(item)}
                  </span>
                  <span
                    className={`tabular-nums font-semibold shrink-0 ${
                      item.poang === undefined
                        ? "text-muted"
                        : item.poang === MAX_POANG
                          ? "text-success"
                          : item.poang >= 50
                            ? "text-accent"
                            : "text-error"
                    }`}
                  >
                    {item.poang ?? "–"}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </main>
    );
  }

  if (status === "stangd") {
    return (
      <main className="min-h-screen">
        <div className="max-w-3xl mx-auto px-4 py-6 sm:py-10">
          <Link href={tillbaka.href} className="text-sm text-primary hover:underline">
            &larr; Tillbaka
          </Link>
          <div className="card p-6 sm:p-8 mt-6">
            <h1 className="text-2xl font-bold tracking-tight">{omgang.title}</h1>
            <p className="text-muted mt-3">Omgången är stängd.</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen">
      <TidslinjespelRunner
        lage={{ typ: "omgang", releaseId: id, besvarade: runda?.answered ?? 0, antalUppgifter: antal }}
        titel={omgang.title}
        tillbaka={tillbaka}
      />
    </main>
  );
}
