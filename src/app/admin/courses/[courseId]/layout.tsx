import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import CourseSidebar from "@/components/CourseSidebar";
import { requireCoursePage } from "@/lib/page-auth";
import { scopeIsOwner } from "@/lib/authz";

export const dynamic = "force-dynamic";

export default async function CourseLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;

  // Enda porten till hela /admin/courses/[courseId]/**. Alla undersidor
  // ärver den här kontrollen - läggs en ny sida till behöver den inget eget.
  const scope = await requireCoursePage(Number(courseId));

  const course = await prisma.course.findUnique({
    where: { id: Number(courseId) },
  });

  if (!course) notFound();

  // Moment och Kampanjen hör till kursplaneringen och till klassaktiviteten -
  // ägarens verktyg, inte lärarens. Ett lärarkonto som lånar en kurs för sina
  // veckotest har ingen användning för dem, och två menypunkter som aldrig
  // leder någonstans gör resten av menyn otydligare. Sidorna finns kvar och
  // svarar på direktbesök; det här är en meny, inte en spärr. Ska en lärare
  // planera moment i sin kurs är det här raden ändras.
  const arAgare = scopeIsOwner(scope);

  return (
    <div className="-m-4 md:-m-8 flex flex-col md:flex-row min-h-screen bg-background">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-primary focus:text-white focus:px-4 focus:py-2 focus:rounded">
        Hoppa till innehåll
      </a>
      <CourseSidebar
        courseId={course.id}
        courseName={course.name}
        adminName={scope.name}
        adminEmail={scope.email}
        showMoment={arAgare}
        showKampanj={arAgare}
      />
      <main id="main-content" className="flex-1 p-4 md:p-8">{children}</main>
    </div>
  );
}
