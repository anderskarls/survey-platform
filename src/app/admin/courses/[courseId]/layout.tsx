import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import CourseSidebar from "@/components/CourseSidebar";
import { requireCoursePage } from "@/lib/page-auth";

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
  await requireCoursePage(Number(courseId));

  const course = await prisma.course.findUnique({
    where: { id: Number(courseId) },
  });

  if (!course) notFound();

  return (
    <div className="-m-4 md:-m-8 flex flex-col md:flex-row min-h-screen bg-background">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-primary focus:text-white focus:px-4 focus:py-2 focus:rounded">
        Hoppa till innehåll
      </a>
      <CourseSidebar courseId={course.id} courseName={course.name} />
      <main id="main-content" className="flex-1 p-4 md:p-8">{children}</main>
    </div>
  );
}
