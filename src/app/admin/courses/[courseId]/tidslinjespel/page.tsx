import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";
import { formatAr } from "@/lib/tidslinje";
import { svarasteHandelser } from "@/lib/tidslinjespel";

export const dynamic = "force-dynamic";

const dayFormatter = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Europe/Stockholm",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const TH = "p-4 font-semibold text-muted text-xs uppercase tracking-wider";

/**
 * Tidslinjespelet i lärarens vy: en rad per elev och spel, och händelserna
 * klassen missar mest. Bara avslutade omgångar räknas i poängen; påbörjade
 * syns som en egen siffra, eftersom "startade men spelade inte klart" också
 * säger något. Provkontot räknas inte i klassens siffror men nämns, så att
 * läraren kan se att den egna provomgången kom in.
 */
export default async function CourseTidslinjespelPage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;
  const cId = Number(courseId);
  if (isNaN(cId)) notFound();

  const [spel, students] = await Promise.all([
    prisma.timelineGame.findMany({
      where: { courses: { some: { courseId: cId } } },
      orderBy: { title: "asc" },
      select: { id: true, slug: true, title: true },
    }),
    prisma.student.findMany({
      where: { courseId: cId },
      orderBy: { number: "asc" },
      select: { id: true, number: true, username: true, isTest: true },
    }),
  ]);

  const elever = students.filter((s) => !s.isTest);
  const provkonton = new Set(students.filter((s) => s.isTest).map((s) => s.id));
  const rundor = spel.length
    ? await prisma.timelineGameRound.findMany({
        where: {
          gameId: { in: spel.map((s) => s.id) },
          studentId: { in: students.map((s) => s.id) },
        },
        orderBy: { createdAt: "asc" },
        select: {
          gameId: true,
          studentId: true,
          score: true,
          items: true,
          finishedAt: true,
        },
      })
    : [];

  return (
    <div className="animate-fade-in">
      <h1 className="text-2xl font-bold mb-2 tracking-tight">Tidslinjespel</h1>
      <p className="text-muted text-sm mb-8 max-w-prose">
        Eleverna spelar omgångar om tio uppgifter mot kursens tidslinje: placera på linjen, skriv årtalet
        och sätt i ordning. Högst 100 poäng per uppgift. Spelet nås från elevens startsida och
        momentsidorna.
      </p>

      {spel.length === 0 && (
        <div className="card p-12 text-center">
          <p className="text-muted">
            Kursen är inte kopplad till något tidslinjespel. Korpusen laddas upp med{" "}
            <code className="font-mono text-xs">scripts/ladda-tidslinjespel.mts</code>.
          </p>
        </div>
      )}

      {spel.map((s) => {
        const egna = rundor.filter((r) => r.gameId === s.id);
        const klassens = egna.filter((r) => !provkonton.has(r.studentId));
        const klara = klassens.filter((r) => r.finishedAt !== null);
        const provRundor = egna.length - klassens.length;
        const svarast = svarasteHandelser(klassens.map((r) => r.items)).slice(0, 8);
        const spelare = new Set(klara.map((r) => r.studentId)).size;
        const streck = <span className="text-muted-light">–</span>;

        return (
          <section key={s.id} className="mb-12">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 mb-4">
              <h2 className="text-lg font-semibold tracking-tight">{s.title}</h2>
              <span className="text-sm text-muted">
                {klara.length} avslutade omgångar · {spelare} av {elever.length} elever har spelat
                {provRundor > 0 && ` · provkontot: ${provRundor} omgångar`}
              </span>
            </div>

            <div className="card overflow-x-auto mb-6">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border-light text-left">
                    <th className={TH}>Elev</th>
                    <th className={`${TH} text-center`}>Omgångar</th>
                    <th className={`${TH} text-center`}>Bästa</th>
                    <th className={`${TH} text-center`}>Senaste</th>
                    <th className={`${TH} text-center`}>Snitt</th>
                    <th className={`${TH} text-center`}>Påbörjade</th>
                    <th className={`${TH} text-center`}>Senast spelat</th>
                  </tr>
                </thead>
                <tbody>
                  {elever.map((st) => {
                    const mina = klara.filter((r) => r.studentId === st.id);
                    const paborjade = klassens.filter(
                      (r) => r.studentId === st.id && r.finishedAt === null
                    ).length;
                    const senaste = mina[mina.length - 1];
                    const snitt = mina.length
                      ? Math.round(mina.reduce((sum, r) => sum + r.score, 0) / mina.length)
                      : null;
                    return (
                      <tr
                        key={st.id}
                        className="border-b border-border-light last:border-0 hover:bg-surface-muted/50 transition-colors"
                      >
                        <td className="p-4 whitespace-nowrap">
                          <Link
                            href={`/admin/courses/${cId}/students/${st.number}`}
                            className="font-semibold text-primary hover:underline"
                          >
                            #{st.number}
                          </Link>
                          <span className="text-muted-light font-mono text-xs ml-2">{st.username}</span>
                        </td>
                        <td className="p-4 text-center">{mina.length || streck}</td>
                        <td className="p-4 text-center font-semibold text-accent">
                          {mina.length ? Math.max(...mina.map((r) => r.score)) : streck}
                        </td>
                        <td className="p-4 text-center">{senaste ? senaste.score : streck}</td>
                        <td className="p-4 text-center">{snitt ?? streck}</td>
                        <td className="p-4 text-center">{paborjade || streck}</td>
                        <td className="p-4 text-center whitespace-nowrap">
                          {senaste?.finishedAt ? dayFormatter.format(senaste.finishedAt) : streck}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <h3 className="font-semibold mb-1">Händelserna klassen missar mest</h3>
            <p className="text-sm text-muted mb-3">
              Snittpoäng per händelse i placera- och skrivuppgifterna, minst två försök.
            </p>
            {svarast.length === 0 ? (
              <p className="text-sm text-muted">För lite spelat ännu.</p>
            ) : (
              <ul className="card divide-y divide-border-light">
                {svarast.map((h) => (
                  <li
                    key={`${h.ar}|${h.rubrik}`}
                    className="p-3 flex items-center justify-between gap-4 text-sm"
                  >
                    <span>
                      <span className="font-medium">{h.rubrik}</span>{" "}
                      <span className="text-muted">({formatAr(h.ar, h.cirka)})</span>
                    </span>
                    <span className="tabular-nums whitespace-nowrap">
                      <strong>{h.snitt}</strong>{" "}
                      <span className="text-muted">snitt · {h.forsok} försök</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
