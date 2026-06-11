import { getStudentSession } from "@/lib/student-session";
import { prisma } from "@/lib/prisma";
import { loadRelearningData } from "@/lib/relearning-data";
import { summarizeStates } from "@/lib/relearning";
import StudentSidebar from "@/components/StudentSidebar";

export const dynamic = "force-dynamic";

export default async function StudentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getStudentSession();
  const [unreadFeedback, course, practiceDue] = await Promise.all([
    session
      ? prisma.assignmentFeedback.count({ where: { studentId: session.studentId, readAt: null } })
      : Promise.resolve(0),
    session
      ? prisma.course.findUnique({ where: { id: session.courseId }, select: { name: true } })
      : Promise.resolve(null),
    session
      ? loadRelearningData(session.studentId).then(
          (d) => summarizeStates(d.states).due
        )
      : Promise.resolve(0),
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
        practiceDue={practiceDue}
      />
      <main id="main-content" className="flex-1 p-4 md:p-8">
        <div className="max-w-3xl mx-auto">{children}</div>
      </main>
    </div>
  );
}
