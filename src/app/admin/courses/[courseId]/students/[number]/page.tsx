"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { ledtradEtikett, postEtikett, type LedtradSammanfattning } from "@/lib/ledtrad-rapport";

interface Answer {
  questionId: number;
  questionText: string;
  questionType: string;
  value: string;
  isCorrect: boolean | null;
  feedback: string | null;
  ledtradar: LedtradSammanfattning | null;
}

interface SurveyResponse {
  surveyId: number;
  surveyTitle: string;
  mode: string;
  respondedAt: string;
  score: { correct: number; total: number } | null;
  answers: Answer[];
}

interface StudentData {
  studentNumber: number;
  surveys: SurveyResponse[];
}

export default function StudentDetailPage() {
  const { courseId, number } = useParams();
  const [data, setData] = useState<StudentData | null>(null);

  useEffect(() => {
    fetch(`/api/courses/${courseId}/students/${number}`)
      .then((res) => res.json())
      .then(setData);
  }, [courseId, number]);

  // Jump to the survey deep-linked from Elevöversikt (e.g. ...#survey-3) once
  // the data has rendered.
  useEffect(() => {
    if (!data || !window.location.hash) return;
    const el = document.getElementById(window.location.hash.slice(1));
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [data]);

  if (!data) {
    return <div className="text-muted">Laddar...</div>;
  }

  return (
    <div className="animate-fade-in">
      <h1 className="text-2xl font-bold mb-2 tracking-tight">Elev #{data.studentNumber}</h1>
      <p className="text-muted mb-6">
        Svarat på {data.surveys.length} enkät{data.surveys.length !== 1 ? "er" : ""}
      </p>

      {data.surveys.length === 0 ? (
        <div className="card p-12 text-center">
          <p className="text-muted">Inga svar registrerade.</p>
        </div>
      ) : (
        <div className="space-y-5">
          {data.surveys.map((s) => (
            <div key={s.surveyId} id={`survey-${s.surveyId}`} className="card p-6 scroll-mt-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold tracking-tight">{s.surveyTitle}</h2>
                <div className="flex items-center gap-3">
                  {s.score && (
                    <span className="badge bg-accent-light text-accent-hover text-xs">
                      {s.score.correct}/{s.score.total} rätt
                    </span>
                  )}
                  <span className="text-xs text-muted">
                    {new Date(s.respondedAt).toLocaleDateString("sv-SE")}
                  </span>
                </div>
              </div>
              <div className="space-y-4">
                {s.answers.map((a) => {
                  const isFreeText = a.questionType !== "MULTIPLE_CHOICE";
                  return (
                    <div
                      key={a.questionId}
                      className="border-b border-border-light last:border-0 pb-4 last:pb-0"
                    >
                      <div className="text-sm text-muted mb-1.5">{a.questionText}</div>
                      <div className="text-sm font-medium flex items-start gap-2">
                        {isFreeText ? (
                          <span className="italic text-foreground whitespace-pre-wrap">
                            &quot;{a.value}&quot;
                          </span>
                        ) : (
                          <>
                            <span className="bg-primary-light text-primary px-2.5 py-0.5 rounded-lg text-xs font-semibold">
                              {a.value}
                            </span>
                            {a.isCorrect === true && (
                              <span className="text-accent text-xs font-semibold" title="Rätt">
                                ✓ Rätt
                              </span>
                            )}
                            {a.isCorrect === false && (
                              <span className="text-error text-xs font-semibold" title="Fel">
                                ✗ Fel
                              </span>
                            )}
                          </>
                        )}
                      </div>
                      {a.ledtradar && (
                        <details className="mt-2 text-sm">
                          <summary className="cursor-pointer text-xs font-semibold text-muted">
                            Fick {ledtradEtikett(a.ledtradar)}
                          </summary>
                          <ol className="mt-2 space-y-2 pl-1">
                            {a.ledtradar.poster.map((p, i) => (
                              <li key={i} className="rounded-lg border border-border-light p-2.5">
                                <div className="text-xs font-semibold text-muted mb-0.5">
                                  {postEtikett(p)}
                                </div>
                                <div className="text-foreground">{p.hint}</div>
                                <div className="text-xs text-muted mt-1">
                                  Diagnos (syns inte för eleven): {p.diagnosis}
                                </div>
                              </li>
                            ))}
                          </ol>
                        </details>
                      )}
                      {isFreeText && (
                        <div className="mt-2">
                          {a.feedback && a.feedback.trim() !== "" ? (
                            <div className="rounded-lg bg-accent-light border border-accent/15 p-3">
                              <div className="text-xs font-semibold text-accent-hover mb-1">
                                Din feedback
                              </div>
                              <div className="text-sm text-foreground whitespace-pre-wrap">
                                {a.feedback}
                              </div>
                            </div>
                          ) : (
                            <div className="text-xs text-muted-light italic">
                              Ingen feedback ännu
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
