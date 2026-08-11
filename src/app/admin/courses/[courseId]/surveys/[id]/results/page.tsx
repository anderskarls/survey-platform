"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import ResultsCharts, { type ResultQuestion } from "@/components/ResultsCharts";
import { useToast } from "@/components/Toast";


interface StudentStat {
  studentNumber: number;
  answered: number;
  correct?: number;
  total?: number;
  percentage?: number;
}

interface ResultsData {
  survey: { id: number; title: string; mode: string; responseCount: number; totalQuestions: number };
  questions: ResultQuestion[];
  studentStats: StudentStat[];
}

export default function CourseResultsPage() {
  const { courseId, id } = useParams();
  const { showToast } = useToast();
  const [data, setData] = useState<ResultsData | null>(null);
  const [loading, setLoading] = useState(true);

  const loadResults = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/courses/${courseId}/surveys/${id}/results`);
      if (!res.ok) throw new Error("Fetch failed");
      setData(await res.json());
    } catch {
      showToast("Kunde inte ladda resultat", "error");
    } finally {
      setLoading(false);
    }
  }, [courseId, id, showToast]);

  useEffect(() => {
    loadResults();
  }, [loadResults]);

  if (loading) {
    return <div className="text-gray-700">Laddar resultat...</div>;
  }

  if (!data) {
    return <div className="text-gray-700">Kunde inte ladda resultat.</div>;
  }

  const isQuiz = data.survey.mode === "QUIZ";

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">
        {data.survey.title}
        {isQuiz && (
          <span className="ml-2 px-2 py-0.5 rounded text-xs bg-yellow-100 text-yellow-700 align-middle">Quiz</span>
        )}
      </h1>
      <div className="flex items-center gap-4 mb-6">
        <p className="text-gray-700">{data.survey.responseCount} svar totalt</p>
        {data.survey.responseCount > 0 && (
          <a
            href={`/api/surveys/${data.survey.id}/export`}
            download
            className="bg-green-600 text-white px-4 py-2 rounded text-sm hover:bg-green-700"
          >
            Exportera CSV
          </a>
        )}
      </div>

      {isQuiz && data.studentStats.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="font-semibold mb-3">Poäng per elev</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {data.studentStats.map((s) => {
              const pct = s.percentage ?? 0;
              return (
                <div
                  key={s.studentNumber}
                  className={`rounded p-3 text-center ${
                    pct >= 80
                      ? "bg-green-50 border border-green-200"
                      : pct >= 50
                      ? "bg-yellow-50 border border-yellow-200"
                      : "bg-red-50 border border-red-200"
                  }`}
                >
                  <div className="text-xs text-gray-700">#{s.studentNumber}</div>
                  <div className="text-lg font-bold">{s.correct ?? 0}/{s.total ?? 0}</div>
                  <div className="text-xs text-gray-700">{pct}%</div>
                  <div className="text-xs text-gray-500">Svarade: {s.answered}/{data.survey.totalQuestions}</div>
                </div>
              );
            })}
          </div>
          <div className="mt-3 text-sm text-gray-700">
            Snitt: {Math.round(data.studentStats.reduce((sum, x) => sum + (x.percentage ?? 0), 0) / data.studentStats.length)}%
          </div>
        </div>
      )}

      {!isQuiz && data.studentStats.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="font-semibold mb-3">Svarade per elev</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {data.studentStats.map((s) => (
              <div
                key={s.studentNumber}
                className="rounded p-3 text-center bg-gray-50 border border-gray-200"
              >
                <div className="text-xs text-gray-700">#{s.studentNumber}</div>
                <div className="text-lg font-bold">{s.answered}/{data.survey.totalQuestions}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <ResultsCharts questions={data.questions} isQuiz={isQuiz} totalResponses={data.survey.responseCount} />
    </div>
  );
}
