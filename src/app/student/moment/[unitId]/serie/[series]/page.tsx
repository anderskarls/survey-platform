import { getStudentSession } from "@/lib/student-session";
import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { toEnkatFraga } from "@/lib/enkatfraga";
import { isReleased } from "@/lib/survey-release";
import type { LessonOutline } from "@/lib/moment-status";
import { flikEtikett, forvaldFlik, lasUtkast, serieKlar, sidnamn } from "@/lib/serie";
import SerieVy, { type SerieFlik } from "@/components/SerieVy";

/**
 * Kartvyn: en serie momentuppgifter (Survey.series) som en sida med en flik
 * per lektion. Allt sparas som utkast och kan ändras när som helst - se
 * serie.ts för varför serien aldrig lämnas in.
 */
export default async function SeriePage({
  params,
  searchParams,
}: {
  params: Promise<{ unitId: string; series: string }>;
  searchParams: Promise<{ flik?: string }>;
}) {
  const session = await getStudentSession();
  if (!session) redirect("/login");
  const { studentId, courseId } = session;

  const { unitId, series: seriesParam } = await params;
  const { flik } = await searchParams;
  const id = Number(unitId);
  if (isNaN(id)) redirect("/student");
  let series = seriesParam;
  try {
    series = decodeURIComponent(seriesParam);
  } catch {
    // redan avkodat av Next - använd som det är
  }

  const unit = await prisma.unit.findUnique({
    where: { id },
    select: { id: true, title: true, courseId: true, lessons: true },
  });
  if (!unit || unit.courseId !== courseId) redirect("/student");

  const surveys = (
    await prisma.survey.findMany({
      where: { unitId: id, series, courseId },
      orderBy: [{ lesson: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
      include: {
        course: { select: { flashcardMode: true } },
        questions: {
          orderBy: { order: "asc" },
          include: { question: { include: { options: true } } },
        },
      },
    })
  ).filter((s) => isReleased(s) && s.questions.length > 0);
  if (surveys.length === 0) redirect(`/student/moment/${id}`);

  const surveyIds = surveys.map((s) => s.id);
  const [drafts, responses] = await Promise.all([
    prisma.draftResponse.findMany({
      where: { studentId, surveyId: { in: surveyIds } },
      select: { surveyId: true, answers: true },
    }),
    // Bara som reserv: en sida som lämnats in innan den blev del av en serie
    // visar de inlämnade svaren tills eleven skriver något nytt.
    prisma.response.findMany({
      where: { studentId, surveyId: { in: surveyIds } },
      orderBy: { createdAt: "asc" },
      select: { surveyId: true, answers: { select: { questionId: true, value: true } } },
    }),
  ]);
  const utkast = new Map(drafts.map((d) => [d.surveyId, d.answers]));
  const inlamnat = new Map<number, Record<string, string>>();
  for (const r of responses) {
    inlamnat.set(r.surveyId, Object.fromEntries(r.answers.map((a) => [String(a.questionId), a.value])));
  }

  const lessons = (Array.isArray(unit.lessons) ? unit.lessons : []) as unknown as LessonOutline[];
  const datum = new Map(lessons.map((l) => [l.n, l.date]));

  const flikar: SerieFlik[] = surveys.map((s) => {
    const svar = utkast.has(s.id) ? lasUtkast(utkast.get(s.id)) : inlamnat.get(s.id) ?? {};
    return {
      surveyId: s.id,
      lesson: s.lesson,
      titel: sidnamn(s.title),
      etikett: flikEtikett(s.title),
      beskrivning: s.description,
      fragor: s.questions.map((sq) => toEnkatFraga(sq.question, s.course.flashcardMode)),
      svar,
      klar: serieKlar(
        s.questions.map((sq) => sq.question),
        JSON.stringify(svar)
      ),
    };
  });

  const valdFlik = Number(flik);
  const start = flikar.some((f) => f.surveyId === valdFlik)
    ? valdFlik
    : forvaldFlik(
        flikar.map((f) => ({ surveyId: f.surveyId, klar: f.klar, datum: f.lesson != null ? datum.get(f.lesson) : null }))
      )!;

  return (
    <div className="animate-fade-in">
      <Link href={`/student/moment/${id}`} className="text-sm text-primary hover:underline">
        &larr; {unit.title}
      </Link>
      <div className="mt-3 mb-5">
        <div className="font-mono text-[11px] uppercase tracking-wider text-muted mb-2">
          Fylls i varje lektion · sparas automatiskt
        </div>
        <h1 className="text-3xl font-bold tracking-tight leading-tight">{series}</h1>
        <p className="text-sm text-muted mt-1.5 max-w-prose">
          En sida per lektion. Det du skriver sparas medan du skriver - du behöver inte lämna in något. Gå
          tillbaka och bygg vidare på tidigare sidor när du vill.
        </p>
      </div>
      <SerieVy flikar={flikar} start={start} />
    </div>
  );
}
