import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { ownCoursesWhere } from "@/lib/authz";
import { requirePageScope } from "@/lib/page-auth";
import { releaseQueue } from "@/lib/survey-release";
import VeckotestKort, { VeckotestKurs } from "@/components/admin/VeckotestKort";

export const dynamic = "force-dynamic";

/**
 * Veckans test - ett kort per kurs, med nästa oöppnade test och en knapp.
 *
 * Finns för att den vanliga vägen till samma sak är en enkättabell med
 * trettiotre rader där "Släpp nu" står bredvid Redigera och Ta bort, en kurs i
 * taget. Läraren som varje måndag ska öppna en vecka i tre kurser behöver inte
 * den vyn - hen behöver veta vad som står på tur och kunna trycka på det.
 *
 * Kursurvalet är scopets: en lärare ser sina kurser, ägaren ser alla. Kurser
 * utan kö hamnar i en rad längst ner i stället för att ta plats som kort -
 * annars drunknar engelskakursernas veckotest bland tolv historiekurser där
 * allting alltid ligger öppet.
 */
export default async function VeckotestPage() {
  const scope = await requirePageScope();

  const courses = await prisma.course.findMany({
    where: ownCoursesWhere(scope),
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      code: true,
      surveys: {
        select: {
          id: true,
          title: true,
          openAt: true,
          _count: { select: { questions: true } },
        },
      },
    },
  });

  const now = new Date();
  const kurser: VeckotestKurs[] = courses.map((c) => {
    const queue = releaseQueue(c.surveys, now);
    const [next, ...resten] = queue;
    return {
      id: c.id,
      name: c.name,
      code: c.code,
      next: next
        ? {
            id: next.id,
            title: next.title,
            questionCount: next._count.questions,
            openAt: next.openAt.toISOString(),
          }
        : null,
      sedanStar: resten.slice(0, 3).map((s) => s.title),
      queueLength: queue.length,
      openCount: c.surveys.length - queue.length,
      totalCount: c.surveys.length,
    };
  });

  const medKo = kurser.filter((k) => k.queueLength > 0);
  const utanKo = kurser.filter((k) => k.queueLength === 0);

  return (
    <div className="animate-fade-in">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Veckans test</h1>
        <p className="text-muted text-sm mt-1 max-w-prose">
          Nästa oöppnade test i varje kurs. Att öppna ett test visar det för
          klassen och öppnar samtidigt veckans ord för övning. Ett öppnat test
          ligger kvar - den som varit sjuk kan ta igen.
        </p>
      </div>

      {kurser.length === 0 ? (
        <div className="card p-12 text-center">
          <p className="text-muted">Du har inte tilldelats någon kurs ännu.</p>
        </div>
      ) : medKo.length === 0 ? (
        <div className="card p-12 text-center">
          <p className="text-muted">
            Inget test väntar på att öppnas. Allt som finns ligger redan ute.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {medKo.map((k) => (
            <VeckotestKort key={k.id} kurs={k} />
          ))}
        </div>
      )}

      {medKo.length > 0 && utanKo.length > 0 && (
        <div className="mt-8 text-sm text-muted">
          <span className="font-medium">Inget att öppna i: </span>
          {utanKo.map((k, i) => (
            <span key={k.id}>
              {i > 0 && ", "}
              <Link
                href={`/admin/courses/${k.id}/surveys`}
                className="hover:underline"
              >
                {k.name}
              </Link>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
