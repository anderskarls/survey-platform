"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import ResultsCharts, { type ResultQuestion } from "@/components/ResultsCharts";
import { useToast } from "@/components/Toast";


interface ResultsData {
  survey: { id: number; title: string; responseCount: number; totalQuestions: number };
  questions: ResultQuestion[];
}

export default function ResultsPage() {
  const params = useParams();
  const { showToast } = useToast();
  const [data, setData] = useState<ResultsData | null>(null);
  const [loading, setLoading] = useState(true);

  const loadResults = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/surveys/${params.id}/results`);
      if (!res.ok) throw new Error("Fetch failed");
      setData(await res.json());
    } catch {
      showToast("Kunde inte ladda resultat", "error");
    } finally {
      setLoading(false);
    }
  }, [params.id, showToast]);

  useEffect(() => {
    loadResults();
  }, [loadResults]);

  if (loading) {
    return <div className="text-gray-700">Laddar resultat...</div>;
  }

  if (!data) {
    return <div className="text-gray-700">Kunde inte ladda resultat.</div>;
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">{data.survey.title}</h1>
      <div className="flex items-center gap-4 mb-6">
        <p className="text-gray-700">
          {data.survey.responseCount} svar totalt
        </p>
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
      <ResultsCharts questions={data.questions} totalResponses={data.survey.responseCount} />
    </div>
  );
}
