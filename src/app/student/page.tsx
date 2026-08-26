import { getStudentSession } from "@/lib/student-session";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  calculateMastery,
  latestAnswers,
  type AnswerRecord,
} from "@/lib/question-progress";
import { getRelearningData } from "@/lib/relearning-data";
import { summarizePracticeReady } from "@/lib/relearning";
import Link from "next/link";
import FlaggedQuestionsList from "@/components/FlaggedQuestionsList";
import { isReleased, nextRelease, formatRelease } from "@/lib/survey-release";

export default async function StudentDashboard() {
  const session = await getStudentSession();
  if (!session) redirect("/login");

  const { studentId, courseId } = session;

  const [course, allSurveys, flaggedQuestions, drafts, units] = await Promise.all([
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

  // Schemalagda enkäter finns inte för eleven förrän de släppts.
  const now = new Date();
  const surveys = allSurveys.filter((s) => isReleased(s, now));

  const surveyIds = surveys.map((s) => s.id);

  const responses = await prisma.response.findMany({
    where: { studentId, surveyId: { in: surveyIds } },
    include: { answers: true },
    orderBy: { createdAt: "asc" },
  });

  const allRecords: AnswerRecord[] = responses.flatMap((r) =>
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

  // Successiv ominlärning: repetitioner som är due plus nya ord som får
  // introduceras idag. Laddningen delas med layouten via React-cachen.
  const relearning = await getRelearningData(studentId);
  const practiceReady = summarizePracticeReady(relearning.states, {
    candidates: relearning.newCandidates,
    introducedToday: relearning.introducedToday,
  });
  // Behärskning: FSRS där frågan finns i övningspoolen, senaste svaret för
  // resten. Se question-progress.ts.
  const latestCorrect = latestAnswers(allRecords);

  // En mening, byggd av de delar som faktiskt finns - nya ord nämns bara när
  // det finns nya ord, och skälet står sist oavsett vilket.
  const practiceSummary = [
    practiceReady.due > 0
      ? `${practiceReady.due} ${practiceReady.due === 1 ? "fråga" : "frågor"} att repetera`
      : null,
    practiceReady.newToday > 0
      ? `${practiceReady.newToday} ${practiceReady.newToday === 1 ? "nytt ord" : "nya ord"} att möta för första gången`
      : null,
  ]
    .filter(Boolean)
    .join(" och ")
    .concat(" - repetition lagom innan du glömmer bygger minnet.");

  // Moment-gruppering: surveys med unitId visas under sina moment, fristående i den platta listan
  const submittedSurveyIds = new Set(responses.map((r) => r.surveyId));
  const unitIdSet = new Set(units.map((u) => u.id));
  const isLoose = (s: { unitId: number | null }) =>
    s.unitId == null || !unitIdSet.has(s.unitId);
  const looseSurveys = surveys.filter(isLoose);
  // Nästa schemalagda enkät visas som ett låst kort med sitt datum, så att
  // veckans rytm syns i stället för att testet dyker upp ur tomma intet.
  // Enkäter som hör till ett moment räknas inte här - de har sin egen
  // "Kommande"-lista inne i momentet.
  const upcomingSurvey = nextRelease(allSurveys.filter(isLoose), now);
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

      {practiceReady.total > 0 && (
        <div className="mb-8">
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2 tracking-tight">
            Att öva på
            <span className="text-sm font-normal text-muted">
              ({practiceReady.total})
            </span>
          </h3>
          <div className="card p-4 flex items-center justify-between">
            <div>
              <span className="font-medium">Dagens övningspass</span>
              <p className="text-sm text-muted mt-0.5">{practiceSummary}</p>
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

      {looseSurveys.length === 0 && !upcomingSurvey ? (
        <p className="text-muted text-center py-12">
          Inga quiz tillgängliga ännu.
        </p>
      ) : (
        <div className="space-y-4">
          {looseSurveys.map((survey) => {
            const questionIds = survey.questions.map((sq) => sq.questionId);
            const { masteredIds, remainingIds } = calculateMastery(
              questionIds,
              relearning.states,
              latestCorrect
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

          {upcomingSurvey && (
            <div className="card p-5 opacity-70">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="font-semibold tracking-tight text-muted">
                    {upcomingSurvey.title}
                  </h3>
                  <p className="text-sm text-muted mt-0.5">
                    Öppnar {formatRelease(upcomingSurvey.openAt)}
                  </p>
                </div>
                <span className="badge bg-surface-muted text-muted">Kommande</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
