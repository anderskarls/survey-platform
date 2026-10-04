import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getStudentSession } from "@/lib/student-session";
import { hamtaSpelForKurs } from "@/lib/tidslinjespel-db";
import TidslinjespelRunner from "@/components/spel/TidslinjespelRunner";

export const dynamic = "force-dynamic";

/**
 * Tidslinjespelet. Ligger utanför /student med flit: spelet ska kännas som
 * ett eget rum, utan sidomenyn och uppgiftsflödet. Inloggningen är ändå
 * elevens vanliga - resultaten sparas på elevkontot och läraren ser dem.
 */
export default async function TidslinjespelPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const session = await getStudentSession();
  if (!session) redirect(`/login?next=${encodeURIComponent(`/spel/tidslinje/${slug}`)}`);

  const spel = await hamtaSpelForKurs(slug, session.courseId);
  if (!spel) notFound();

  const rundor = await prisma.timelineGameRound.findMany({
    // Bara fritt spel - de släppta omgångarna har egna resultat.
    where: {
      gameId: spel.id,
      studentId: session.studentId,
      releaseId: null,
      finishedAt: { not: null },
    },
    orderBy: { finishedAt: "desc" },
    select: { score: true },
  });

  return (
    <main className="min-h-screen">
      <TidslinjespelRunner
        lage={{ typ: "fritt", slug: spel.slug }}
        titel={spel.title}
        basta={rundor.length ? Math.max(...rundor.map((r) => r.score)) : null}
        senaste={rundor[0]?.score ?? null}
        antalRundor={rundor.length}
      />
    </main>
  );
}
