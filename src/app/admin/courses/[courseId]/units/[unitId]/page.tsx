import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";
import UnitEditor from "@/components/admin/UnitEditor";
import type { LessonOutline } from "@/lib/moment-status";

export const dynamic = "force-dynamic";

export default async function UnitEditPage({
  params,
}: {
  params: Promise<{ courseId: string; unitId: string }>;
}) {
  const { courseId, unitId } = await params;
  const cId = Number(courseId);
  const uId = Number(unitId);

  const unit = await prisma.unit.findUnique({ where: { id: uId } });
  if (!unit || unit.courseId !== cId) notFound();

  const lessons = (Array.isArray(unit.lessons) ? unit.lessons : []) as unknown as LessonOutline[];

  return (
    <div className="animate-fade-in max-w-2xl">
      <Link href={`/admin/courses/${cId}/units`} className="text-sm text-primary hover:underline">
        &larr; Alla moment
      </Link>
      <h1 className="text-2xl font-bold mt-2 mb-1 tracking-tight">{unit.title}</h1>
      <p className="text-sm text-muted mb-6">Redigera datum, period och lärandemål för momentet.</p>

      <UnitEditor
        courseId={cId}
        unitId={uId}
        initialPeriod={unit.period ?? ""}
        initialGoals={unit.goals ?? []}
        initialLessons={lessons}
      />
    </div>
  );
}
