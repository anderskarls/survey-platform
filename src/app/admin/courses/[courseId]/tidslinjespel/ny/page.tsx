import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { MIN_URVAL, tidslinjespelDataSchema } from "@/lib/tidslinjespel";
import NyTidslinjeomgang from "@/components/admin/NyTidslinjeomgang";

export const dynamic = "force-dynamic";

export default async function NyOmgangPage({ params }: { params: Promise<{ courseId: string }> }) {
  const cId = Number((await params).courseId);
  if (isNaN(cId)) notFound();

  const [spel, moment] = await Promise.all([
    prisma.timelineGame.findMany({
      where: { courses: { some: { courseId: cId } } },
      orderBy: { title: "asc" },
      select: { slug: true, title: true, data: true },
    }),
    prisma.unit.findMany({
      where: { courseId: cId },
      orderBy: { createdAt: "asc" },
      select: { id: true, title: true },
    }),
  ]);

  const spelData = spel.flatMap((s) => {
    const d = tidslinjespelDataSchema.safeParse(s.data);
    if (!d.success) return [];
    return [
      {
        slug: s.slug,
        title: s.title,
        handelser: d.data.handelser.map((h) => ({ ar: h.ar, rubrik: h.rubrik, cirka: h.cirka })),
        vyer: d.data.vyer,
      },
    ];
  });

  return (
    <div className="animate-fade-in">
      <Link href={`/admin/courses/${cId}/tidslinjespel`} className="text-sm text-primary hover:underline">
        &larr; Tidslinjespel
      </Link>
      <h1 className="text-2xl font-bold mt-3 mb-2 tracking-tight">Ny omgång</h1>
      <p className="text-muted text-sm mb-6 max-w-prose">
        Välj vilka händelser omgången ska handla om. Alla elever får samma uppgifter och ett försök var.
      </p>
      <NyTidslinjeomgang courseId={cId} spel={spelData} moment={moment} minUrval={MIN_URVAL} />
    </div>
  );
}
