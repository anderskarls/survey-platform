import { prisma } from "@/lib/prisma";
import FlashcardModeToggle from "@/components/admin/FlashcardModeToggle";

export const dynamic = "force-dynamic";

export default async function CourseDashboard({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;
  const cId = Number(courseId);

  const [course, questionCount, surveyCount, responseCount, studentCount, recentSurveys] =
    await Promise.all([
      prisma.course.findUnique({ where: { id: cId } }),
      prisma.question.count({ where: { topic: { courseId: cId } } }),
      prisma.survey.count({ where: { courseId: cId } }),
      prisma.response.count({ where: { survey: { courseId: cId } } }),
      prisma.student.count({ where: { courseId: cId } }),
      prisma.survey.findMany({
        where: { courseId: cId },
        take: 5,
        orderBy: { createdAt: "desc" },
        include: { _count: { select: { responses: true, questions: true } } },
      }),
    ]);

  const stats = [
    { label: "Frågor", value: questionCount, color: "text-primary" },
    { label: "Enkäter", value: surveyCount, color: "text-primary" },
    { label: "Svar", value: responseCount, color: "text-accent" },
    { label: "Elever", value: studentCount, color: "text-accent" },
  ];

  return (
    <div className="animate-fade-in">
      <h1 className="text-2xl font-bold mb-2 tracking-tight">Dashboard</h1>
      {course && (
        <div className="mb-8 flex items-center gap-3">
          <span className="text-sm text-muted">Kurskod:</span>
          <span className="bg-accent-light text-accent-hover px-3 py-1 rounded-lg font-mono text-sm font-bold tracking-wider">
            {course.code}
          </span>
          <span className="text-xs text-muted-light">Dela med eleverna</span>
        </div>
      )}
      {course && (
        <FlashcardModeToggle
          courseId={course.id}
          initial={course.flashcardMode}
        />
      )}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
        {stats.map((s, i) => (
          <div
            key={s.label}
            className="card p-5 animate-fade-in"
            style={{ animationDelay: `${i * 75}ms` }}
          >
            <div className={`text-3xl font-bold ${s.color}`}>{s.value}</div>
            <div className="text-muted text-sm mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      <h2 className="text-lg font-semibold mb-3 tracking-tight">Senaste enkäter</h2>
      {recentSurveys.length === 0 ? (
        <p className="text-muted">Inga enkäter skapade ännu.</p>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-light text-left">
                <th className="p-4 font-semibold text-muted text-xs uppercase tracking-wider">Titel</th>
                <th className="p-4 font-semibold text-muted text-xs uppercase tracking-wider">Frågor</th>
                <th className="p-4 font-semibold text-muted text-xs uppercase tracking-wider">Svar</th>
                <th className="p-4 font-semibold text-muted text-xs uppercase tracking-wider">Skapad</th>
              </tr>
            </thead>
            <tbody>
              {recentSurveys.map((s) => (
                <tr key={s.id} className="border-b border-border-light last:border-0 hover:bg-surface-muted/50 transition-colors">
                  <td className="p-4 font-medium">{s.title}</td>
                  <td className="p-4 text-muted">{s._count.questions}</td>
                  <td className="p-4 text-muted">{s._count.responses}</td>
                  <td className="p-4 text-muted">
                    {new Date(s.createdAt).toLocaleDateString("sv-SE")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
