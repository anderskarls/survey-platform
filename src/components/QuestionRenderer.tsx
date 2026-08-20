"use client";

import { useState } from "react";
import FlagButton from "@/components/FlagButton";
import { FLASHCARD_RATINGS } from "@/lib/flashcard";

interface Question {
  id: number;
  text: string;
  type: string;
  options: string[];
  /** Kortets baksida. Skickas bara med i flashcardläge. */
  answer?: string | null;
}

interface QuestionRendererProps {
  questions: Question[];
  answers: Record<number, string>;
  onAnswer: (questionId: number, value: string) => void;
  flaggedIds?: Set<number>;
  startIndex?: number;
  /** Visa flervalsfrågor som Anki-kort i stället för alternativlistor. */
  flashcard?: boolean;
  /** Anropas när eleven skattat ett kort, så formuläret kan gå vidare. */
  onRated?: (questionId: number) => void;
}

/**
 * Ett kort: framsida, "Visa svar", baksida, självskattning.
 *
 * Avslöjandet är lokalt state. Anroparen renderar ett kort i taget med
 * key={q.id}, så komponenten monteras om vid varje ny fråga och kortet är
 * garanterat vänt tillbaka - eleven kan inte råka se nästa svar.
 */
function FlashcardCard({
  question,
  index,
  chosen,
  onAnswer,
  onRated,
  flaggedIds,
}: {
  question: Question;
  index: number;
  chosen: string | undefined;
  onAnswer: (questionId: number, value: string) => void;
  onRated?: (questionId: number) => void;
  flaggedIds?: Set<number>;
}) {
  // Redan skattade kort visas vända, så eleven ser sitt svar när den backar.
  const [revealed, setRevealed] = useState(chosen !== undefined);

  function rate(value: string) {
    onAnswer(question.id, value);
    onRated?.(question.id);
  }

  return (
    <div className="card p-6 mb-4">
      <div className="flex items-center justify-between gap-2 mb-6">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted">
          Kort {index + 1}
        </span>
        {flaggedIds !== undefined && (
          <FlagButton
            questionId={question.id}
            initialFlagged={flaggedIds.has(question.id)}
          />
        )}
      </div>

      <p className="text-center text-xl font-semibold tracking-tight px-2">
        {question.text}
      </p>

      {revealed ? (
        <>
          <div className="border-t border-border-light my-6" />
          <p
            className="text-center text-2xl font-bold text-primary px-2"
            role="status"
          >
            {question.answer}
          </p>
        </>
      ) : (
        <div className="mt-8 flex justify-center">
          <button
            type="button"
            onClick={() => setRevealed(true)}
            className="btn-primary py-3 px-8"
          >
            Visa svar
          </button>
        </div>
      )}

      {revealed && (
        <div className="mt-8">
          <p className="text-sm text-muted mb-2 text-center">
            Hur gick det? Ditt svar styr när ordet kommer tillbaka.
          </p>
          <div className="grid grid-cols-4 gap-2">
            {FLASHCARD_RATINGS.map((r) => (
              <button
                key={r.value}
                type="button"
                onClick={() => rate(r.value)}
                aria-pressed={chosen === r.value}
                className={`py-3 flex flex-col items-center ${
                  chosen === r.value ? "btn-primary" : "btn-secondary"
                }`}
              >
                <span className="font-semibold">{r.label}</span>
                <span className="text-xs text-muted">{r.hint}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function QuestionRenderer({
  questions,
  answers,
  onAnswer,
  flaggedIds,
  startIndex = 0,
  flashcard = false,
  onRated,
}: QuestionRendererProps) {
  return (
    <>
      {questions.map((q, i) =>
        flashcard && q.type === "MULTIPLE_CHOICE" ? (
          <FlashcardCard
            key={q.id}
            question={q}
            index={startIndex + i}
            chosen={answers[q.id]}
            onAnswer={onAnswer}
            onRated={onRated}
            flaggedIds={flaggedIds}
          />
        ) : (
        <div key={q.id} className="card p-6 mb-4">
          <div className="flex items-start justify-between gap-2 mb-3">
            <label className="block font-semibold tracking-tight">
              {startIndex + i + 1}. {q.text}
            </label>
            {flaggedIds !== undefined && (
              <FlagButton
                questionId={q.id}
                initialFlagged={flaggedIds.has(q.id)}
              />
            )}
          </div>

          {q.type === "MULTIPLE_CHOICE" ? (
            <div className="flex flex-col gap-2" role="radiogroup" aria-label={q.text}>
              {q.options.map((opt) => (
                <label
                  key={opt}
                  className={`flex items-center gap-3 cursor-pointer p-3 border rounded-xl transition-all duration-150 ${
                    answers[q.id] === opt
                      ? "border-primary bg-primary-light shadow-sm"
                      : "border-border-light hover:border-border hover:bg-surface-muted/50"
                  }`}
                >
                  <input
                    type="radio"
                    name={`q-${q.id}`}
                    value={opt}
                    checked={answers[q.id] === opt}
                    onChange={() => onAnswer(q.id, opt)}
                    className="accent-primary focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                  />
                  <span className="text-base">{opt}</span>
                </label>
              ))}
              <div className="border-t border-border-light my-1" />
              <label
                className={`flex items-center gap-3 cursor-pointer p-3 border border-dashed rounded-xl transition-all duration-150 ${
                  answers[q.id] === "__UNSURE__"
                    ? "border-accent bg-accent-light shadow-sm"
                    : "border-border-light hover:border-border hover:bg-surface-muted/50"
                }`}
              >
                <input
                  type="radio"
                  name={`q-${q.id}`}
                  value="__UNSURE__"
                  checked={answers[q.id] === "__UNSURE__"}
                  onChange={() => onAnswer(q.id, "__UNSURE__")}
                  className="accent-accent focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
                />
                <span className="text-base text-muted">Jag är inte säker</span>
              </label>
            </div>
          ) : q.type === "REFLECTION" ? (
            <div>
              <p className="text-sm text-muted mb-2">
                Reflektera fritt - det finns inget rätt eller fel. Skriv det du faktiskt tänker.
              </p>
              <textarea
                value={answers[q.id] || ""}
                onChange={(e) => onAnswer(q.id, e.target.value)}
                rows={6}
                placeholder="Din reflektion..."
                className="input-field"
              />
            </div>
          ) : (
            <textarea
              value={answers[q.id] || ""}
              onChange={(e) => onAnswer(q.id, e.target.value)}
              rows={8}
              placeholder="Skriv ditt svar..."
              className="input-field"
            />
          )}
        </div>
        )
      )}
    </>
  );
}
