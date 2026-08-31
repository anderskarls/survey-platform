"use client";

import type { ReactNode } from "react";
import FlagButton from "@/components/FlagButton";
import { flashcardLabel } from "@/lib/flashcard";

interface Score {
  correct: number;
  total: number;
  percentage: number;
}

interface QuizResult {
  answerId?: number | null;
  questionId: number;
  questionText: string;
  questionType?: string;
  yourAnswer: string;
  isCorrect: boolean | null;
  correctAnswer: string | null;
  /** Luckfråga: fel svar som bara var några bokstäver bort. */
  nearMiss?: boolean;
}

interface QuizResultsDisplayProps {
  score: Score | null;
  quizResults: QuizResult[] | null;
  isQuiz: boolean;
  flaggedIds?: Set<number>;
  children?: ReactNode;
}

export default function QuizResultsDisplay({
  score,
  quizResults,
  isQuiz,
  flaggedIds,
  children,
}: QuizResultsDisplayProps) {
  return (
    <div className="animate-fade-in">
      <div className="card p-8 text-center mb-6">
        <div className="text-4xl mb-4">
          {isQuiz ? (score && score.percentage >= 50 ? "\u2B50" : "\uD83D\uDCDD") : "\u2713"}
        </div>
        <h2 className="text-xl font-bold mb-2 tracking-tight">
          {isQuiz ? "Resultat" : "Tack för ditt svar!"}
        </h2>
        {score && (
          <div className="mb-4">
            <div className={`text-3xl font-bold ${
              score.percentage >= 80 ? "text-success" : score.percentage >= 50 ? "text-warning" : "text-error"
            }`}>
              {score.correct} / {score.total}
            </div>
            <div className="text-muted">{score.percentage}% rätt</div>
          </div>
        )}
        {isQuiz && flaggedIds !== undefined && (
          <p className="text-sm text-muted-light mt-2">
            🚩 Markera frågor du vill öva mer på — de sparas på din dashboard.
          </p>
        )}
        {!isQuiz && <p className="text-muted">Dina svar har skickats in.</p>}
      </div>

      {quizResults && (
        <div className="space-y-3 mb-6">
          {quizResults.map((r, i) => {
            const isUnsure = r.yourAnswer === "__UNSURE__";
            // Obesvarad fråga sparas som tom rad med isCorrect=false. Utan
            // det här fallet stod det bara "Ditt svar:" och sedan ingenting.
            const isBlank = r.yourAnswer.trim() === "";
            // Flashcard: "ditt svar" är elevens egen skattning av kortet
            const rating = flashcardLabel(r.yourAnswer);
            return (
            <div
              key={r.questionId}
              className={`card p-4 border-l-4 ${
                r.isCorrect === true
                  ? "border-l-success bg-success-light/30"
                  : r.isCorrect === false
                  ? "border-l-warning bg-warning-light/20"
                  : isUnsure
                  ? "border-l-accent bg-accent-light/30"
                  : ""
              }`}
            >
              <div className="flex items-start gap-2">
                <span className="font-semibold text-sm">{i + 1}.</span>
                <div className="flex-1">
                  <p className="font-medium text-sm mb-1">{r.questionText}</p>
                  {isUnsure ? (
                    <p className="text-sm text-accent">
                      Du markerade att du var osäker - bra att du var ärlig!
                    </p>
                  ) : isBlank ? (
                    <p className="text-sm text-muted">
                      Du lämnade frågan obesvarad - den räknas som fel.
                    </p>
                  ) : rating ? (
                    <p className="text-sm">
                      Rätt svar:{" "}
                      <span className="font-semibold">{r.correctAnswer}</span>
                      <span className="text-muted">
                        {" "}
                        - du skattade kortet som {rating.toLowerCase()}
                      </span>
                    </p>
                  ) : (
                    <p className="text-sm">
                      Ditt svar:{" "}
                      <span
                        className={
                          r.isCorrect === false
                            ? "text-muted"
                            : "text-success font-semibold"
                        }
                      >
                        {r.yourAnswer}
                      </span>
                    </p>
                  )}
                  {r.nearMiss && (
                    <p className="text-sm text-warning font-medium">
                      Nästan! Rätt ord - men kolla stavningen.
                    </p>
                  )}
                  {(r.isCorrect === false || isUnsure) && r.correctAnswer && (
                    <p className="text-sm text-success">
                      Det rätta svaret: <span className="font-semibold">{r.correctAnswer}</span>
                    </p>
                  )}
                  {flaggedIds !== undefined && (
                    <div className="mt-2">
                      <FlagButton
                        questionId={r.questionId}
                        initialFlagged={flaggedIds.has(r.questionId)}
                        size="md"
                      />
                    </div>
                  )}
                </div>
                <span className="text-lg">
                  {r.isCorrect === true ? "\u2705" : ""}
                </span>
              </div>
            </div>
            );
          })}
        </div>
      )}

      {children}
    </div>
  );
}
