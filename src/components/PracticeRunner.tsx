"use client";

import { useState } from "react";
import Link from "next/link";

export interface PracticeQuestion {
  id: number;
  text: string;
  options: string[];
  streakDays: number;
  courseName?: string | null;
}

interface AttemptResult {
  isCorrect: boolean | null;
  correctAnswer: string | null;
  streakDays: number;
  graduated: boolean;
  daysUntilDue: number | null;
}

interface Props {
  questions: PracticeQuestion[];
}

function StreakDots({ streakDays }: { streakDays: number }) {
  return (
    <span className="inline-flex items-center gap-1" aria-label={`${streakDays} av 3 dagar med rätt`}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={`inline-block w-2.5 h-2.5 rounded-full ${
            i < streakDays ? "bg-success" : "bg-surface-muted border border-border"
          }`}
        />
      ))}
    </span>
  );
}

export default function PracticeRunner({ questions }: Props) {
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [result, setResult] = useState<AttemptResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [correctCount, setCorrectCount] = useState(0);
  const [graduatedCount, setGraduatedCount] = useState(0);
  const [finished, setFinished] = useState(false);

  const question = questions[index];
  const total = questions.length;

  async function handleSubmit() {
    if (!selected || submitting) return;
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
      if (data.isCorrect === true) setCorrectCount((c) => c + 1);
      if (data.graduated) setGraduatedCount((c) => c + 1);
    } catch {
      setError("Kunde inte skicka svaret. Kontrollera din internetanslutning.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleNext() {
    if (index + 1 >= total) {
      setFinished(true);
    } else {
      setIndex((i) => i + 1);
      setSelected(null);
      setResult(null);
    }
  }

  if (finished) {
    return (
      <div className="card p-6 text-center animate-fade-in">
        <h2 className="text-2xl font-bold tracking-tight mb-2">Passet klart!</h2>
        <p className="text-lg mb-1">
          {correctCount} av {total} rätt
        </p>
        {graduatedCount > 0 && (
          <p className="text-sm text-success mb-1">
            {graduatedCount} {graduatedCount === 1 ? "fråga" : "frågor"} klarade
            tredje dagen med rätt och går nu in i underhållsläge.
          </p>
        )}
        <p className="text-sm text-muted mb-6">
          Frågor du svarade fel på återkommer imorgon. Rätt svar måste sitta
          tre olika dagar - det är då minnet byggs på riktigt.
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
            Fråga {index + 1} av {total}
          </span>
          <StreakDots streakDays={showFeedback ? result.streakDays : question.streakDays} />
        </div>
        <div className="w-full bg-surface-muted rounded-full h-1.5">
          <div
            className="bg-primary h-1.5 rounded-full transition-all duration-300"
            style={{ width: `${Math.round(((index + (showFeedback ? 1 : 0)) / total) * 100)}%` }}
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
                Rätt!{" "}
                {result.graduated
                  ? "Tre dagar med rätt - frågan går in i underhållsläge och återkommer om ungefär en månad."
                  : `${result.streakDays} av 3 dagar med rätt. ${
                      result.daysUntilDue === 1
                        ? "Frågan återkommer imorgon eller senare."
                        : `Frågan återkommer om ${result.daysUntilDue} dagar.`
                    }`}
              </p>
            ) : (
              <p className="font-semibold">
                {selected === "__UNSURE__" ? "Du var osäker." : "Inte rätt."}{" "}
                Läs det rätta svaret ovan - frågan återkommer imorgon.
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
        <button onClick={handleNext} className="btn-primary w-full py-3">
          {index + 1 >= total ? "Visa resultat" : "Nästa fråga"}
        </button>
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
