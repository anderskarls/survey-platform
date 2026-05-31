import { getStudentSession } from "@/lib/student-session";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import Link from "next/link";

interface LessonOutline {
  n: number;
  title: string;
  note?: string;
  date?: string; // rekommenderat datum (ISO YYYY-MM-DD), självgående - inte ett lås
  week?: string; // valfri veckoetikett, t.ex. "v.17"
}

export default async function MomentPage({
  params,
}: {
  params: Promise<{ unitId: string }>;
}) {
  const session = await getStudentSession();
  if (!session) redirect("/login");
  const { studentId, courseId } = session;

  const { unitId } = await params;
  const id = Number(unitId);
  if (isNaN(id)) redirect("/student");

  const unit = await prisma.unit.findUnique({
    where: { id },
    include: {
      surveys: { orderBy: { createdAt: "asc" }, include: { questions: true } },
    },
  });
  if (!unit || unit.courseId !== courseId) redirect("/student");

  const surveyIds = unit.surveys.map((s) => s.id);
  const [responses, drafts] = await Promise.all([
    prisma.response.findMany({
      where: { studentId, surveyId: { in: surveyIds } },
      select: { surveyId: true },
    }),
    prisma.draftResponse.findMany({
      where: { studentId, surveyId: { in: surveyIds } },
      select: { surveyId: true },
    }),
  ]);
  const submitted = new Set(responses.map((r) => r.surveyId));
  const draftSet = new Set(drafts.map((d) => d.surveyId));

  const statusOf = (sid: number) =>
    submitted.has(sid) ? "Inlämnad" : draftSet.has(sid) ? "Utkast sparat" : "Ej påbörjad";
  const actionOf = (sid: number) =>
    submitted.has(sid) ? "Visa / öva igen" : draftSet.has(sid) ? "Fortsätt" : "Starta";

  const lessons = (Array.isArray(unit.lessons) ? unit.lessons : []) as unknown as LessonOutline[];
  const orderedLessons = [...lessons].sort((a, b) => a.n - b.n);
  const surveysInLesson = (n: number) => unit.surveys.filter((s) => s.lesson === n);
  const looseSurveys = unit.surveys.filter((s) => s.lesson == null);

  const submittedCount = unit.surveys.filter((s) => submitted.has(s.id)).length;

  const TaskRow = ({ s }: { s: (typeof unit.surveys)[number] }) => (
    <div className="card p-4 flex items-center justify-between gap-4">
      <div>
        <span className="font-medium">{s.title}</span>
        <span className="text-xs text-muted ml-2">
          {statusOf(s.id)} - {s.questions.length} frågor
        </span>
      </div>
      <Link href={`/student/quiz/${s.id}`} className="btn-primary inline-block">
        {actionOf(s.id)}
      </Link>
    </div>
  );

  return (
    <div className="animate-fade-in">
      <div className="mb-6">
        <Link href="/student" className="text-sm text-primary hover:underline">
          &larr; Tillbaka
        </Link>
        <h2 className="text-xl font-bold tracking-tight mt-2">{unit.title}</h2>
        {unit.description && <p className="text-sm text-muted mt-0.5">{unit.description}</p>}
        <p className="text-sm text-muted mt-1">
          {submittedCount}/{unit.surveys.length} uppgifter inlämnade
        </p>
      </div>

      <div className="space-y-6">
        {orderedLessons.map((lesson) => {
          const items = surveysInLesson(lesson.n);
          const done = items.filter((s) => submitted.has(s.id)).length;
          const lessonStatus =
            items.length === 0
              ? null
              : done === items.length
              ? "klar"
              : done > 0 || items.some((s) => draftSet.has(s.id))
              ? "pågår"
              : "ej påbörjad";
          return (
            <div key={lesson.n}>
              <div className="flex items-baseline justify-between mb-2">
                <h3 className="font-semibold tracking-tight">
                  {lesson.n}. {lesson.title}
                </h3>
                {lessonStatus && <span className="text-xs text-muted">{lessonStatus}</span>}
              </div>
              {items.length === 0 ? (
                <p className="text-sm text-muted italic">
                  {lesson.note || "Ingen digital uppgift"} - se lektionsmaterialet
                </p>
              ) : (
                <div className="space-y-2">
                  {items.map((s) => (
                    <TaskRow key={s.id} s={s} />
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {looseSurveys.length > 0 && (
          <div>
            <h3 className="font-semibold tracking-tight mb-2">Övriga uppgifter</h3>
            <div className="space-y-2">
              {looseSurveys.map((s) => (
                <TaskRow key={s.id} s={s} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
