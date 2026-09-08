"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { arOsaker } from "@/lib/svarsvarden";

export interface StudentAnswer {
  studentNumber: number;
  value: string;
  isCorrect?: boolean | null;
}

export interface MCQuestion {
  id: number;
  text: string;
  type: "MULTIPLE_CHOICE";
  optionCounts: Record<string, number>;
  /** "Jag är osäker" räknas bredvid fördelningen, aldrig som ett alternativ i den */
  osakra?: number;
  correctAnswer?: string | null;
  studentAnswers?: StudentAnswer[];
  answeredBy: number;
}

export interface FTQuestion {
  id: number;
  text: string;
  type: "FREE_TEXT";
  textResponses: string[];
  studentAnswers?: StudentAnswer[];
  answeredBy: number;
}

/**
 * Tidslinjefrågan rättas mot facit men har inga alternativ att fördela svaren
 * över - ett stapeldiagram skulle bara ha en stapel per klickat årtal. Läraren
 * får antalet rätt, facit i klartext och samma per-elev-rutnät som flervalet.
 */
export interface TLQuestion {
  id: number;
  text: string;
  type: "TIMELINE";
  /** Antal elever som fick rätt. "Nära" räknas som fel, precis som i poängen. */
  ratt: number;
  correctAnswer?: string | null;
  studentAnswers?: StudentAnswer[];
  answeredBy: number;
}

export type ResultQuestion = MCQuestion | FTQuestion | TLQuestion;

/**
 * Svaren per elev, färgade rätt/fel i quizläge.
 *
 * Låg förut inne i flervalsgrenen. Tidslinjefrågan behöver exakt samma vy, och
 * en kopia hade blivit den fjärde platsen i kodbasen där samma rutnät driver
 * isär.
 */
function PerElevRutnat({
  studentAnswers,
  isQuiz,
}: {
  studentAnswers: StudentAnswer[];
  isQuiz: boolean;
}) {
  if (studentAnswers.length === 0) return null;
  return (
    <details className="mt-3">
      <summary className="text-sm text-muted cursor-pointer hover:text-foreground transition-colors">
        Visa per elev ({studentAnswers.length} svar)
      </summary>
      <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2">
        {[...studentAnswers]
          .sort((a, b) => a.studentNumber - b.studentNumber)
          .map((sa) => {
            // "Jag är osäker" är varken rätt eller fel - måla den inte röd
            const osaker = arOsaker(sa.value);
            return (
              <div
                key={sa.studentNumber}
                className={`rounded-lg p-2 text-xs ${
                  !isQuiz || osaker
                    ? "bg-surface-muted"
                    : sa.isCorrect
                      ? "bg-success-light border border-success/20"
                      : "bg-error-light border border-error/20"
                }`}
              >
                <span className="font-semibold">#{sa.studentNumber}</span>{" "}
                <span
                  className={
                    isQuiz && !osaker && !sa.isCorrect ? "text-error" : "text-muted"
                  }
                >
                  {osaker ? "osäker" : sa.value}
                </span>
              </div>
            );
          })}
      </div>
    </details>
  );
}

export default function ResultsCharts({
  questions,
  isQuiz = false,
  totalResponses,
}: {
  questions: ResultQuestion[];
  isQuiz?: boolean;
  totalResponses: number;
}) {
  return (
    <div className="space-y-6">
      {questions.map((q) => (
        <div key={q.id} className="card p-6">
          <h3 className="font-semibold tracking-tight">{q.text}</h3>
          <p className="text-xs text-muted-light mb-4">
            Besvarad av {q.answeredBy}/{totalResponses} elever
          </p>

          {q.type === "MULTIPLE_CHOICE" ? (
            <>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={Object.entries(q.optionCounts).map(([name, count]) => ({
                      name,
                      count,
                      isCorrect: isQuiz && q.correctAnswer === name,
                    }))}
                    layout="vertical"
                    margin={{ left: 100 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" />
                    <XAxis type="number" allowDecimals={false} />
                    <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Bar dataKey="count" radius={[0, 6, 6, 0]}>
                      {Object.entries(q.optionCounts).map(([name]) => (
                        <Cell
                          key={name}
                          fill={isQuiz && q.correctAnswer === name ? "var(--success)" : "var(--primary)"}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              {isQuiz && q.correctAnswer && (
                <p className="text-sm text-success mt-2">
                  Rätt svar: <span className="font-semibold">{q.correctAnswer}</span>
                </p>
              )}
              {!!q.osakra && q.osakra > 0 && (
                <p className="text-sm text-muted mt-2">
                  <span className="font-semibold">{q.osakra}</span>{" "}
                  {q.osakra === 1 ? "elev" : "elever"} markerade &quot;Jag är osäker&quot; i
                  stället för att svara - inte ett fel svar, och ingår inte i fördelningen ovan.
                </p>
              )}
              <PerElevRutnat
                studentAnswers={q.studentAnswers ?? []}
                isQuiz={isQuiz}
              />
            </>
          ) : q.type === "TIMELINE" ? (
            <>
              <p className="text-lg font-semibold tracking-tight">
                {q.ratt} av {q.answeredBy} rätt
              </p>
              {isQuiz && q.correctAnswer && (
                <p className="text-sm text-success mt-1">
                  Rätt svar: <span className="font-semibold">{q.correctAnswer}</span>
                </p>
              )}
              <PerElevRutnat
                studentAnswers={q.studentAnswers ?? []}
                isQuiz={isQuiz}
              />
            </>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {q.studentAnswers && q.studentAnswers.length > 0 ? (
                q.studentAnswers
                  .sort((a, b) => a.studentNumber - b.studentNumber)
                  .map((sa) => (
                    <div
                      key={sa.studentNumber}
                      className="bg-surface-muted rounded-lg p-3 text-sm"
                    >
                      <span className="font-semibold text-muted">#{sa.studentNumber}</span>{" "}
                      {sa.value}
                    </div>
                  ))
              ) : q.type === "FREE_TEXT" && q.textResponses.length === 0 ? (
                <p className="text-muted text-sm">Inga svar ännu.</p>
              ) : (
                q.textResponses.map((text, i) => (
                  <div key={i} className="bg-surface-muted rounded-lg p-3 text-sm">
                    {text}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
