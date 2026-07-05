"use client";

import { useState } from "react";
import Link from "next/link";

export interface PracticeQuestion {
  id: number;
  text: string;
  options: string[];
  courseName?: string | null;
}

interface AttemptResult {
  attemptId: number;
  isCorrect: boolean | null;
  correctAnswer: string | null;
  appliedGrade: number;
  nextDueDays: number | null;
  mastered: boolean;
  intervals: { hard: number; good: number; easy: number };
}

interface Props {
  questions: PracticeQuestion[];
}

function inDays(days: number): string {
  return days <= 1 ? "imorgon" : `om ${days} dagar`;
}

export default function PracticeRunner({ questions }: Props) {
  // Passkö i Anki-stil: fel/osäker lägger tillbaka frågan sist i kön,
  // passet är klart först när varje fråga besvarats rätt en gång.
  const [queue, setQueue] = useState<PracticeQuestion[]>(questions);
  const [selected, setSelected] = useState<string | null>(null);
  const [result, setResult] = useState<AttemptResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [grading, setGrading] = useState(false);
  const [error, setError] = useState("");
  const [completedCount, setCompletedCount] = useState(0);
  const [missedIds, setMissedIds] = useState<Set<number>>(new Set());
  const [firstTryCorrect, setFirstTryCorrect] = useState(0);
  const [masteredCount, setMasteredCount] = useState(0);

  const uniqueTotal = questions.length;
  const question = queue[0];
  const finished = question === undefined;

  async function handleSubmit() {
    if (!question || !selected || submitting) return;
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/student/practice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId: question.id, value: selected }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Något gick fel");
        return;
      }
      setResult(data);
      if (data.isCorrect === true) {
        if (!missedIds.has(question.id)) setFirstTryCorrect((c) => c + 1);
      } else {
        setMissedIds((prev) => new Set(prev).add(question.id));
      }
    } catch {
      setError("Kunde inte skicka svaret. Kontrollera din internetanslutning.");
    } finally {
      setSubmitting(false);
    }
  }

  function advance(requeue: boolean) {
    setQueue((q) => {
      const [head, ...rest] = q;
      return requeue && head ? [...rest, head] : rest;
    });
    if (!requeue) setCompletedCount((c) => c + 1);
    setSelected(null);
    setResult(null);
  }

  // Självskattning i Anki-stil: Bra är redan sparat på servern,
  // Svårt/Lätt justeras via PATCH. Misslyckad PATCH stoppar inte passet -
  // Bra står kvar som rimlig default.
  async function handleGrade(grade: 2 | 3 | 4) {
    if (!result || grading) return;
    if (result.mastered) setMasteredCount((c) => c + 1);
    if (grade !== 3) {
      setGrading(true);
      try {
        await fetch("/api/student/practice", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ attemptId: result.attemptId, grade }),
        });
      } catch {
        // Ignorera: Bra ligger kvar som default
      } finally {
        setGrading(false);
      }
    }
    advance(false);
  }

  if (finished) {
    return (
      <div className="card p-6 text-center animate-fade-in">
        <h2 className="text-2xl font-bold tracking-tight mb-2">Passet klart!</h2>
        <p className="text-lg mb-1">
          {firstTryCorrect} av {uniqueTotal} rätt på första försöket
        </p>
        {missedIds.size > 0 && (
          <p className="text-sm text-muted mb-1">
            {missedIds.size} {missedIds.size === 1 ? "fråga" : "frågor"} krävde
            omkörning i passet.
          </p>
        )}
        {masteredCount > 0 && (
          <p className="text-sm text-success mb-1">
            {masteredCount} {masteredCount === 1 ? "fråga" : "frågor"} sitter nu
            så bra att nästa repetition ligger minst en vecka bort.
          </p>
        )}
        <p className="text-sm text-muted mb-6">
          Frågorna återkommer lagom innan du hinner glömma dem - ju bättre de
          sitter, desto längre blir pausen.
        </p>
        <Link href="/student" className="btn-primary inline-block py-3 px-6">
          Tillbaka till dashboard
        </Link>
      </div>
    );
  }

  const showFeedback = result !== null;

  return (
    <div>
      <div className="card p-4 mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold text-muted">
            Klara: {completedCount} av {uniqueTotal}
          </span>
          {queue.length > 1 && (
            <span className="text-xs font-semibold text-muted bg-surface-muted rounded-full px-2.5 py-1">
              {queue.length - 1} kvar i kön
            </span>
          )}
        </div>
        <div className="w-full bg-surface-muted rounded-full h-1.5">
          <div
            className="bg-primary h-1.5 rounded-full transition-all duration-300"
            style={{ width: `${Math.round((completedCount / uniqueTotal) * 100)}%` }}
          />
        </div>
      </div>

      <div className="card p-6 mb-4">
        {question.courseName && (
          <span className="inline-block text-xs font-semibold uppercase tracking-wider text-muted bg-surface-muted rounded-full px-2.5 py-1 mb-3">
            {question.courseName}
          </span>
        )}
        <p className="font-semibold tracking-tight mb-4">{question.text}</p>

        <div className="flex flex-col gap-2" role="radiogroup" aria-label={question.text}>
          {question.options.map((opt) => {
            const isSelected = selected === opt;
            const isCorrectOption = showFeedback && result.correctAnswer === opt;
            const isWrongPick = showFeedback && isSelected && result.isCorrect === false;
            return (
              <label
                key={opt}
                className={`flex items-center gap-3 p-3 border rounded-xl transition-all duration-150 ${
                  showFeedback ? "cursor-default" : "cursor-pointer"
                } ${
                  isCorrectOption
                    ? "border-success bg-success-light"
                    : isWrongPick
                      ? "border-error bg-error-light"
                      : isSelected
                        ? "border-primary bg-primary-light shadow-sm"
                        : "border-border-light hover:border-border hover:bg-surface-muted/50"
                }`}
              >
                <input
                  type="radio"
                  name={`practice-q-${question.id}`}
                  value={opt}
                  checked={isSelected}
                  disabled={showFeedback}
                  onChange={() => setSelected(opt)}
                  className="accent-primary"
                />
                <span className="text-base">{opt}</span>
                {isCorrectOption && (
                  <span className="ml-auto text-success font-semibold text-sm">Rätt svar</span>
                )}
              </label>
            );
          })}
          {!showFeedback && (
            <>
              <div className="border-t border-border-light my-1" />
              <label
                className={`flex items-center gap-3 cursor-pointer p-3 border border-dashed rounded-xl transition-all duration-150 ${
                  selected === "__UNSURE__"
                    ? "border-accent bg-accent-light shadow-sm"
                    : "border-border-light hover:border-border hover:bg-surface-muted/50"
                }`}
              >
                <input
                  type="radio"
                  name={`practice-q-${question.id}`}
                  value="__UNSURE__"
                  checked={selected === "__UNSURE__"}
                  onChange={() => setSelected("__UNSURE__")}
                  className="accent-accent"
                />
                <span className="text-base text-muted">Jag är inte säker</span>
              </label>
            </>
          )}
        </div>

        {showFeedback && (
          <div
            className={`mt-4 p-4 rounded-xl ${
              result.isCorrect === true
                ? "bg-success-light text-success-dark"
                : "bg-error-light text-error"
            }`}
            role="status"
          >
            {result.isCorrect === true ? (
              <p className="font-semibold">
                Rätt! Hur kändes frågan? Ditt svar styr när den återkommer.
              </p>
            ) : (
              <p className="font-semibold">
                {selected === "__UNSURE__" ? "Du var osäker." : "Inte rätt."}{" "}
                Läs det rätta svaret ovan - frågan återkommer senare i passet.
              </p>
            )}
          </div>
        )}

        {error && (
          <p className="text-error text-sm font-medium mt-3" role="alert">
            {error}
          </p>
        )}
      </div>

      {showFeedback ? (
        result.isCorrect === true ? (
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => handleGrade(2)}
              disabled={grading}
              className="btn-secondary py-3 flex flex-col items-center"
            >
              <span className="font-semibold">Svårt</span>
              <span className="text-xs text-muted">{inDays(result.intervals.hard)}</span>
            </button>
            <button
              onClick={() => handleGrade(3)}
              disabled={grading}
              className="btn-primary py-3 flex flex-col items-center"
            >
              <span className="font-semibold">Bra</span>
              <span className="text-xs opacity-80">{inDays(result.intervals.good)}</span>
            </button>
            <button
              onClick={() => handleGrade(4)}
              disabled={grading}
              className="btn-secondary py-3 flex flex-col items-center"
            >
              <span className="font-semibold">Lätt</span>
              <span className="text-xs text-muted">{inDays(result.intervals.easy)}</span>
            </button>
          </div>
        ) : (
          <button onClick={() => advance(true)} className="btn-primary w-full py-3">
            Nästa fråga
          </button>
        )
      ) : (
        <button
          onClick={handleSubmit}
          disabled={!selected || submitting}
          className="btn-primary w-full py-3"
        >
          {submitting ? "Rättar..." : "Svara"}
        </button>
      )}
    </div>
  );
}
