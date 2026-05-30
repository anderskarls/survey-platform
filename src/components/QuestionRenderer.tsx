"use client";

import FlagButton from "@/components/FlagButton";

interface Question {
  id: number;
  text: string;
  type: string;
  options: string[];
}

interface QuestionRendererProps {
  questions: Question[];
  answers: Record<number, string>;
  onAnswer: (questionId: number, value: string) => void;
  flaggedIds?: Set<number>;
  startIndex?: number;
}

export default function QuestionRenderer({
  questions,
  answers,
  onAnswer,
  flaggedIds,
  startIndex = 0,
}: QuestionRendererProps) {
  return (
    <>
      {questions.map((q, i) => (
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
      ))}
    </>
  );
}
