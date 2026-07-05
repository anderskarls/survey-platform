import { getStudentSession } from "@/lib/student-session";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { calculateMastery, ResponseRecord } from "@/lib/mastery";
import { loadRelearningData } from "@/lib/relearning-data";
import { summarizeStates } from "@/lib/relearning";
import Link from "next/link";
import FlaggedQuestionsList from "@/components/FlaggedQuestionsList";

export default async function StudentDashboard() {
  const session = await getStudentSession();
  if (!session) redirect("/login");

  const { studentId, courseId } = session;

  const [course, surveys, flaggedQuestions, drafts, units] = await Promise.all([
    prisma.course.findUnique({ where: { id: courseId } }),
    prisma.survey.findMany({
      where: { courseId },
      include: { questions: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.flaggedQuestion.findMany({
      where: { studentId },
      include: {
        question: {
          include: {
            topic: true,
            options: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.draftResponse.findMany({
      where: { studentId },
      select: { surveyId: true, updatedAt: true },
    }),
    prisma.unit.findMany({ where: { courseId }, orderBy: { createdAt: "asc" } }),
  ]);

  const draftBySurvey = new Map(drafts.map((d) => [d.surveyId, d.updatedAt]));

  if (!course) redirect("/login");

  const surveyIds = surveys.map((s) => s.id);

  const responses = await prisma.response.findMany({
    where: { studentId, surveyId: { in: surveyIds } },
    include: { answers: true },
    orderBy: { createdAt: "asc" },
  });

  const allRecords: ResponseRecord[] = responses.flatMap((r) =>
    r.answers.map((a) => ({
      questionId: a.questionId,
      isCorrect: a.isCorrect,
      createdAt: r.createdAt,
    }))
  );

  const flaggedData = flaggedQuestions.map((fq) => ({
    questionId: fq.questionId,
    text: fq.question.text,
    type: fq.question.type,
    topicName: fq.question.topic.name,
    options: fq.question.options.map((o) => o.text),
    correctAnswer:
      fq.question.options.find((o) => o.isCorrect)?.text ?? null,
  }));

  // Successiv ominlärning: frågor eleven missat, due enligt spacad streak-logik
  const relearning = await loadRelearningData(studentId);
  const practiceStats = summarizeStates(relearning.states);

  // Moment-gruppering: surveys med unitId visas under sina moment, fristående i den platta listan
  const submittedSurveyIds = new Set(responses.map((r) => r.surveyId));
  const unitIdSet = new Set(units.map((u) => u.id));
  const looseSurveys = surveys.filter((s) => s.unitId == null || !unitIdSet.has(s.unitId));
  const unitProgress = units
    .map((u) => {
      const us = surveys.filter((s) => s.unitId === u.id);
      const done = us.filter((s) => submittedSurveyIds.has(s.id)).length;
      return { id: u.id, title: u.title, total: us.length, done };
    })
    .filter((u) => u.total > 0);

  return (
    <div className="animate-fade-in">
      <div className="mb-6">
        <h2 className="text-xl font-bold tracking-tight">{course.name}</h2>
        <p className="text-sm text-muted mt-0.5">Kurskod: <span className="font-mono tracking-wider">{course.code}</span></p>
      </div>

      <div className="mb-4">
        <Link href="/student/results" className="text-sm text-primary font-medium hover:underline">
          Visa alla mina resultat &rarr;
        </Link>
      </div>

      {/* Flagged questions section */}
      {flaggedData.length > 0 && (
        <div className="mb-8">
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2 tracking-tight">
            🚩 Frågor att öva på
            <span className="text-sm font-normal text-muted">
              ({flaggedData.length})
            </span>
          </h3>
          <FlaggedQuestionsList questions={flaggedData} />
        </div>
      )}

      {practiceStats.due > 0 && (
        <div className="mb-8">
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2 tracking-tight">
            Att öva på
            <span className="text-sm font-normal text-muted">
              ({practiceStats.due})
            </span>
          </h3>
          <div className="card p-4 flex items-center justify-between">
            <div>
              <span className="font-medium">Dagens övningspass</span>
              <p className="text-sm text-muted mt-0.5">
                {practiceStats.due} {practiceStats.due === 1 ? "fråga" : "frågor"} redo
                att övas - repetition lagom innan du glömmer bygger minnet.
              </p>
            </div>
            <Link href="/student/practice" className="btn-accent inline-block">
              Öva nu
            </Link>
          </div>
        </div>
      )}

      {unitProgress.length > 0 && (
        <div className="mb-8">
          <h3 className="text-lg font-semibold mb-3 tracking-tight">Moment</h3>
          <div className="space-y-2">
            {unitProgress.map((u) => (
              <Link
                key={u.id}
                href={`/student/moment/${u.id}`}
                className="card p-4 flex items-center justify-between"
              >
                <span className="font-medium">{u.title}</span>
                <span className="text-sm text-muted">
                  {u.done}/{u.total} inlämnade
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {looseSurveys.length === 0 ? (
        <p className="text-muted text-center py-12">
          Inga quiz tillgängliga ännu.
        </p>
      ) : (
        <div className="space-y-4">
          {looseSurveys.map((survey) => {
            const questionIds = survey.questions.map((sq) => sq.questionId);
            const { masteredIds, remainingIds } = calculateMastery(
              questionIds,
              allRecords
            );
            const hasResponded = responses.some((r) => r.surveyId === survey.id);
            const hasDraft = draftBySurvey.has(survey.id);
            const allMastered =
              remainingIds.length === 0 && questionIds.length > 0;
            const masteryPercent =
              questionIds.length > 0
                ? Math.round((masteredIds.length / questionIds.length) * 100)
                : 0;

            return (
              <div key={survey.id} className="card p-5">
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div>
                    <h3 className="font-semibold tracking-tight">
                      {survey.title}
                    </h3>
                    {survey.description && (
                      <p className="text-sm text-muted mt-0.5">
                        {survey.description}
                      </p>
                    )}
                  </div>
                  {allMastered && (
                    <span className="badge bg-success-light text-success-dark">
                      Klar
                    </span>
                  )}
                </div>

                <div className="mb-4">
                  <div className="flex justify-between text-xs text-muted mb-1.5">
                    <span>
                      {masteredIds.length} / {questionIds.length} frågor klarade
                    </span>
                    <span className="font-semibold">{masteryPercent}%</span>
                  </div>
                  <div className="w-full bg-surface-muted rounded-full h-2">
                    <div
                      className="bg-success h-2 rounded-full transition-all duration-500"
                      style={{ width: `${masteryPercent}%` }}
                    />
                  </div>
                </div>

                {!allMastered && (
                  <div className="flex items-center gap-3">
                    <Link
                      href={`/student/quiz/${survey.id}`}
                      className="btn-primary inline-block"
                    >
                      {hasDraft ? "Fortsätt" : hasResponded ? "Öva igen" : "Starta"}
                    </Link>
                    {hasDraft && (
                      <span className="text-xs text-warning">
                        Sparat utkast
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
