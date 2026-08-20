"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import QuestionRenderer from "@/components/QuestionRenderer";
import QuizResultsDisplay from "@/components/QuizResultsDisplay";
import ProgressBar from "@/components/ProgressBar";
import LockOverlay from "@/components/LockOverlay";

interface SurveyData {
  id: number;
  title: string;
  description: string;
  mode: string;
  lockMode: boolean;
  /** Kursen kör flashcardläge: flervalsfrågor visas som Anki-kort */
  flashcard?: boolean;
  questions: {
    id: number;
    text: string;
    type: string;
    options: string[];
    answer?: string | null;
  }[];
}

interface QuizResult {
  answerId?: number | null;
  questionId: number;
  questionText: string;
  questionType?: string;
  yourAnswer: string;
  isCorrect: boolean | null;
  correctAnswer: string | null;
}

interface Score {
  correct: number;
  total: number;
  percentage: number;
}

export default function SurveyForm({ survey }: { survey: SurveyData }) {
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [score, setScore] = useState<Score | null>(null);
  const [quizResults, setQuizResults] = useState<QuizResult[] | null>(null);
  const [flaggedIds, setFlaggedIds] = useState<Set<number> | undefined>(
    undefined
  );
  const [draftStatus, setDraftStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isQuiz = survey.mode === "QUIZ";
  const totalQuestions = survey.questions.length;
  const isLastQuestion = currentStep === totalQuestions - 1;

  // Load any existing draft + flagged questions (student is guaranteed logged in)
  useEffect(() => {
    fetch(`/api/surveys/${survey.id}/draft`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.draft?.answers) {
          const loaded: Record<number, string> = {};
          for (const [key, value] of Object.entries(data.draft.answers)) {
            loaded[Number(key)] = value as string;
          }
          // Merga UNDER det eleven redan hunnit skriva. Ett rakt setAnswers
          // raderade tidigare färska svar när fetchen löste sent (segt wifi).
          setAnswers((prev) => ({ ...loaded, ...prev }));
          setDraftLoaded(true);
        }
      })
      .catch(() => {});

    fetch("/api/student/flagged")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.questionIds) {
          setFlaggedIds(new Set(data.questionIds));
        }
      })
      .catch(() => {});
  }, [survey.id]);

  const saveDraft = useCallback(
    async (currentAnswers: Record<number, string>) => {
      setDraftStatus("saving");
      try {
        const res = await fetch(`/api/surveys/${survey.id}/draft`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ answers: currentAnswers }),
        });
        setDraftStatus(res.ok ? "saved" : "error");
      } catch {
        setDraftStatus("error");
      }
    },
    [survey.id]
  );

  function setAnswer(questionId: number, value: string) {
    setAnswers((prev) => {
      const next = { ...prev, [questionId]: value };
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => saveDraft(next), 2000);
      return next;
    });
  }

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, []);

  async function handleSaveDraft() {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    setSaving(true);
    await saveDraft(answers);
    setSaving(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const answered = survey.questions.filter((q) => answers[q.id]?.trim());

    setSubmitting(true);

    const answerList = answered.map((q) => ({
      questionId: q.id,
      value: answers[q.id],
    }));

    try {
      const res = await fetch(`/api/surveys/${survey.id}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: answerList }),
      });

      const data = await res.json();

      if (res.ok) {
        fetch(`/api/surveys/${survey.id}/draft`, { method: "DELETE" }).catch(() => {});
        setSubmitted(true);
        if (data.score) setScore(data.score);
        if (data.quizResults) setQuizResults(data.quizResults);
        if (data.surveyResults) setQuizResults(data.surveyResults);
      } else {
        setError(data.error || "Något gick fel");
      }
    } catch {
      setError("Kunde inte skicka svar. Kontrollera din internetanslutning.");
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <QuizResultsDisplay
        score={score}
        quizResults={quizResults}
        isQuiz={isQuiz}
        flaggedIds={flaggedIds}
      />
    );
  }

  const answeredCount = survey.questions.filter((q) => answers[q.id]?.trim()).length;
  const currentQuestion = survey.questions[currentStep];

  function goPrev() {
    setCurrentStep((s) => Math.max(0, s - 1));
  }

  function goNext() {
    setCurrentStep((s) => Math.min(totalQuestions - 1, s + 1));
  }

  /** Efter en skattning bläddras kortleken vidare av sig själv. */
  function handleRated() {
    if (!isLastQuestion) goNext();
  }

  return (
    <form onSubmit={handleSubmit}>
      <LockOverlay enabled={survey.lockMode && !submitted} />
      <div className="card p-6 mb-6">
        <h1 className="text-2xl font-bold tracking-tight">{survey.title}</h1>
        {survey.description && (
          <p className="text-muted mt-2">{survey.description}</p>
        )}
        <div className="flex items-center gap-2 mt-2">
          {isQuiz && (
            <span className="badge bg-warning-light text-warning">Quiz</span>
          )}
          {survey.lockMode && (
            <span className="badge bg-error-light text-error">
              🔒 Låst läge
            </span>
          )}
        </div>
      </div>

      <div className="card p-6 mb-6">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-semibold text-muted">
            Fråga {currentStep + 1} av {totalQuestions}
          </span>
          <div className="text-xs text-muted-light">
            {draftLoaded && draftStatus === "idle" && "Utkast laddat"}
            {draftStatus === "saving" && "Sparar utkast…"}
            {draftStatus === "saved" && "Utkast sparat"}
            {draftStatus === "error" && (
              <span className="text-error">Kunde inte spara utkast</span>
            )}
          </div>
        </div>
        <ProgressBar answered={answeredCount} total={totalQuestions} />
      </div>

      {currentQuestion && (
        <QuestionRenderer
          questions={[currentQuestion]}
          answers={answers}
          onAnswer={setAnswer}
          flaggedIds={flaggedIds}
          startIndex={currentStep}
          flashcard={survey.flashcard ?? false}
          onRated={handleRated}
        />
      )}

      {error && (
        <div className="card p-4 mb-4">
          <p className="text-error text-sm font-medium" role="alert">{error}</p>
        </div>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={goPrev}
          disabled={currentStep === 0 || submitting}
          className="btn-secondary py-3 px-5"
        >
          Föregående
        </button>
        <button
          type="button"
          onClick={handleSaveDraft}
          disabled={saving || submitting}
          className="btn-secondary py-3 px-5"
        >
          {saving ? "Sparar..." : draftStatus === "saved" && !saving ? "Sparat" : "Spara"}
        </button>
        {isLastQuestion ? (
          <button
            key="nav-submit"
            type="submit"
            disabled={submitting || answeredCount === 0}
            className="btn-primary flex-1 py-3"
          >
            {submitting ? "Skickar..." : "Skicka svar"}
          </button>
        ) : (
          <button
            key="nav-next"
            type="button"
            onClick={goNext}
            disabled={submitting}
            className="btn-primary flex-1 py-3"
          >
            Nästa
          </button>
        )}
      </div>
    </form>
  );
}
