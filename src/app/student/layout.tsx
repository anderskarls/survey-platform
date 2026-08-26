import { getStudentSession } from "@/lib/student-session";
import { prisma } from "@/lib/prisma";
import { getRelearningData } from "@/lib/relearning-data";
import { summarizePracticeReady } from "@/lib/relearning";
import StudentSidebar from "@/components/StudentSidebar";

export const dynamic = "force-dynamic";

export default async function StudentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getStudentSession();
  const [unreadFeedback, course, practice] = await Promise.all([
    session
      ? prisma.assignmentFeedback.count({ where: { studentId: session.studentId, readAt: null } })
      : Promise.resolve(0),
    session
      ? prisma.course.findUnique({ where: { id: session.courseId }, select: { name: true } })
      : Promise.resolve(null),
    session
      ? getRelearningData(session.studentId).then((d) => ({
          // Badgen ska svara på "finns det något att göra?" - då räknas nya
          // ord in, inte bara repetitioner.
          due: summarizePracticeReady(d.states, {
            candidates: d.newCandidates,
            introducedToday: d.introducedToday,
          }).total,
          // Elevens övriga kurser (samma personKey) - underlag för kursväxlaren.
          // Redan upplösta här, så växlaren kostar ingen extra fråga.
          accounts: d.accounts,
        }))
      : Promise.resolve({ due: 0, accounts: [] }),
  ]);

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-background">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-primary focus:text-white focus:px-4 focus:py-2 focus:rounded"
      >
        Hoppa till innehåll
      </a>
      <StudentSidebar
        courseName={course?.name ?? "Min kurs"}
        studentNumber={session?.studentNumber}
        unreadFeedback={unreadFeedback}
        practiceDue={practice.due}
        currentCourseId={session?.courseId}
        courses={practice.accounts.map((a) => ({
          courseId: a.courseId,
          courseName: a.courseName,
        }))}
        impersonated={session?.impersonated ?? false}
      />
      <main id="main-content" className="flex-1 p-4 md:p-8">
        <div className="max-w-3xl mx-auto">{children}</div>
      </main>
    </div>
  );
}
