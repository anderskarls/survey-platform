import { prisma } from "@/lib/prisma";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function UnitsPage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;
  const cId = Number(courseId);

  const units = await prisma.unit.findMany({
    where: { courseId: cId },
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { surveys: true } } },
  });

  return (
    <div className="animate-fade-in">
      <h1 className="text-2xl font-bold mb-2 tracking-tight">Moment</h1>
      <p className="text-sm text-muted mb-6">
        Sätt rekommenderade datum, tidsperiod och lärandemål per moment. Datumen styr
        elevens momentväg (missad / kommande / veckogruppering). Moment skapas via import_moment.
      </p>

      {units.length === 0 ? (
        <p className="text-muted">Inga moment ännu - skapa ett via import_moment.</p>
      ) : (
        <div className="space-y-2">
          {units.map((u) => {
            const lessonCount = Array.isArray(u.lessons) ? u.lessons.length : 0;
            return (
              <Link
                key={u.id}
                href={`/admin/courses/${cId}/units/${u.id}`}
                className="card card-hover p-4 flex items-center justify-between"
              >
                <div>
                  <span className="font-medium">{u.title}</span>
                  {u.period && <span className="text-sm text-muted ml-2">{u.period}</span>}
                </div>
                <span className="text-sm text-muted">
                  {lessonCount} lektioner · {u._count.surveys} uppgifter
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
