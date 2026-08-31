"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import ExemplarPanel, { ExemplarView } from "@/components/ExemplarPanel";
import ClozeCardFace from "@/components/ClozeCardFace";
import { FLASHCARD_REVEAL } from "@/lib/flashcard";
import { splitAtGap, type ClientClozeConfig } from "@/lib/cloze";

export interface PracticeQuestion {
  id: number;
  text: string;
  /** MULTIPLE_CHOICE | SORTING | FREE_TEXT (förmågeövning) | CLOZE | CLOZE_CARD */
  type: string;
  options: string[];
  /** SORTING: konfiguration utan facit */
  sorting?: { categories: string[]; items: string[] } | null;
  /** CLOZE: ledtråden. Facit ligger kvar på servern. */
  cloze?: ClientClozeConfig | null;
  courseName?: string | null;
  /** Visas som Anki-kort: framsida, vänd, självskatta. Inga alternativ. */
  flashcard?: boolean;
}

interface SortingItemResult {
  text: string;
  chosen: string | null;
  correct: string;
  isCorrect: boolean;
}

interface AttemptResult {
  attemptId: number;
  isCorrect: boolean | null;
  correctAnswer: string | null;
  /** Luckfråga: fel svar som bara var några bokstäver bort. */
  nearMiss?: boolean;
  sorting: {
    perItem: SortingItemResult[];
    correctCount: number;
    total: number;
    allCorrect: boolean;
  } | null;
  exemplars: ExemplarView[] | null;
  /** Fritextövning: eleven sätter hela betyget själv efter exempelsvaren */
  selfAssess: boolean;
  appliedGrade: number;
  /**
   * Styr det här svaret schemat? False = frågan är redan avräknad idag
   * (omkörning i passet, eller ett skarpt quiz tidigare på dagen). Svaret
   * sparas och frågan kan läggas tillbaka i kön, men nästa repetition
   * flyttas inte - därför visas inga dagsetiketter på knapparna.
   */
  schedulesToday: boolean;
  nextDueDays: number | null;
  mastered: boolean;
  intervals: { again: number; hard: number; good: number; easy: number };
}

interface Props {
  questions: PracticeQuestion[];
  /** Vart knappen i "Passet klart" leder. Default: elevens dashboard. */
  doneHref?: string;
  doneLabel?: string;
  /**
   * Vart "Fortsätt senare" leder. Utelämnad = ingen sådan knapp.
   *
   * En veckoövning är 30 kort; ingen sitter igenom det i ett svep. Knappen
   * gör avbrottet till ett val i stället för att eleven stänger fliken -
   * och det som är gjort är sparat kort för kort, inget går förlorat.
   */
  pauseHref?: string;
  pauseLabel?: string;
}

function inDays(days: number): string {
  return days <= 1 ? "imorgon" : `om ${days} dagar`;
}

/**
 * Dagsetiketten under en betygsknapp. Visas bara när svaret faktiskt styr
 * schemat - på en omkörning vore den ett löfte appen inte håller.
 */
function IntervalHint({
  show,
  days,
  muted = true,
}: {
  show: boolean;
  days: number;
  muted?: boolean;
}) {
  if (!show) return null;
  return (
    <span className={muted ? "text-xs text-muted" : "text-xs opacity-80"}>
      {inDays(days)}
    </span>
  );
}

/**
 * Huvudknappen, med "Fortsätt senare" bredvid när passet går att avbryta.
 *
 * Knappen står här och inte i framstegsraden av ett enkelt skäl: det är hit
 * eleven tittar. Valet att sluta ska vara lika synligt som valet att vända
 * nästa kort - annars stänger man fliken i stället, och det ser ut som att
 * appen inte tillät en paus.
 */
function ActionRow({
  pauseHref,
  pauseLabel,
  children,
}: {
  pauseHref?: string;
  pauseLabel: string;
  children: ReactNode;
}) {
  if (!pauseHref) return <>{children}</>;
  return (
    <div className="flex items-stretch gap-3">
      <div className="flex-1">{children}</div>
      <Link
        href={pauseHref}
        className="btn-secondary py-3 px-5 flex items-center justify-center whitespace-nowrap"
      >
        {pauseLabel}
      </Link>
    </div>
  );
}

/** Förklarar varför omkörningen inte flyttar fram nästa repetition */
function RerunNote({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <p className="text-xs text-muted mt-2 text-center">
      Du har redan mött frågan idag - det här svaret hjälper dig att lära, men
      det är första gången varje dag som avgör när frågan återkommer.
    </p>
  );
}

/**
 * Luckfrågan i övningsläget. Samma rendering som i quizet: fältet ligger mitt
 * i meningen och webbläsarens rättstavning är avstängd - det är elevens
 * stavning som övas, inte telefonens.
 */
function ClozePractice({
  question,
  value,
  onChange,
  disabled,
}: {
  question: PracticeQuestion;
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
}) {
  const { before, after } = splitAtGap(question.text);
  const hint = question.cloze?.hint;
  return (
    <div className="mb-4">
      <p className="text-lg leading-relaxed">
        <span>{before}</span>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          aria-label={`Ordet som saknas i: ${before}lucka${after}`}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          className="inline-block mx-1 px-2 py-1 min-w-[8rem] w-40 text-center font-semibold border-b-2 border-primary bg-primary-light/30 rounded-t focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-70"
        />
        <span>{after}</span>
      </p>
      {hint && (
        <p className="text-sm text-muted mt-3">
          Ledtråd: <span className="font-medium">{hint}</span>
        </p>
      )}
    </div>
  );
}

export default function PracticeRunner({
  questions,
  doneHref = "/student",
  doneLabel = "Tillbaka till dashboard",
  pauseHref,
  pauseLabel = "Fortsätt senare",
}: Props) {
  // Passkö i Anki-stil: fel/osäker/"om igen" lägger tillbaka frågan sist i
  // kön; passet är klart först när varje fråga klarats av en gång.
  const [queue, setQueue] = useState<PracticeQuestion[]>(questions);
  const [selected, setSelected] = useState<string | null>(null);
  const [placements, setPlacements] = useState<Record<string, string>>({});
  const [freeText, setFreeText] = useState("");
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

  const isSorting = question?.type === "SORTING";
  const isFreeText = question?.type === "FREE_TEXT";
  const isFlashcard = question?.flashcard === true;
  const isCloze = question?.type === "CLOZE";
  // Luckmeningskortet: vänds som ett kort, men visar meningen på båda
  // sidorna i stället för en fras på framsidan och ett ord på baksidan.
  const isClozeCard = question?.type === "CLOZE_CARD";

  function buildValue(): string | null {
    // Kortet har inget att fylla i - att vända det ÄR svaret, och baksidan
    // kommer tillbaka i svaret från servern.
    if (isFlashcard) return FLASHCARD_REVEAL;
    if (isSorting) {
      const items = question.sorting?.items ?? [];
      if (items.some((i) => !placements[i])) return null;
      return JSON.stringify(placements);
    }
    if (isFreeText || isCloze) {
      const trimmed = freeText.trim();
      return trimmed.length > 0 ? trimmed : null;
    }
    return selected;
  }

  const readyToSubmit = !finished && buildValue() !== null;

  async function handleSubmit() {
    const value = buildValue();
    if (!question || !value || submitting) return;
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/student/practice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId: question.id, value }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Något gick fel");
        return;
      }
      setResult(data);
      if (data.isCorrect === true) {
        if (!missedIds.has(question.id)) setFirstTryCorrect((c) => c + 1);
      } else if (data.isCorrect === false) {
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
    setPlacements({});
    setFreeText("");
    setResult(null);
  }

  // Självskattning i Anki-stil. För rätta svar är Bra redan sparat på
  // servern (Svårt/Lätt justeras via PATCH). För fritextövningar sätter
  // eleven hela betyget själv efter exempelsvaren - "Om igen" (1) lägger
  // tillbaka frågan i passkön. Misslyckad PATCH stoppar inte passet.
  async function handleGrade(grade: 1 | 2 | 3 | 4) {
    if (!result || grading) return;
    const requeue = grade === 1;
    if (!requeue && result.mastered) setMasteredCount((c) => c + 1);
    if (requeue && question) {
      setMissedIds((prev) => new Set(prev).add(question.id));
    }
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
    advance(requeue);
  }

  if (finished) {
    return (
      <div className="card p-6 text-center animate-fade-in">
        <h2 className="text-2xl font-bold tracking-tight mb-2">Passet klart!</h2>
        <p className="text-lg mb-1">
          {completedCount} av {uniqueTotal} klara
        </p>
        {firstTryCorrect > 0 && (
          <p className="text-sm text-muted mb-1">
            {firstTryCorrect} rätt på första försöket.
          </p>
        )}
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
        <Link href={doneHref} className="btn-primary inline-block py-3 px-6">
          {doneLabel}
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
        {isClozeCard ? (
          <div className="py-4" aria-live="polite">
            <ClozeCardFace
              text={question.text}
              hint={question.cloze?.hint}
              answer={showFeedback ? result.correctAnswer : null}
            />
          </div>
        ) : isCloze ? (
          <ClozePractice
            question={question}
            value={freeText}
            onChange={setFreeText}
            disabled={showFeedback}
          />
        ) : (
          <p
            className={
              isFlashcard
                ? "text-center text-xl font-semibold tracking-tight px-2 py-4"
                : "font-semibold tracking-tight mb-4"
            }
          >
            {question.text}
          </p>
        )}

        {/* Luckmeningskortet vänder meningen på plats ovan - ingen egen baksida. */}
        {isCloze || isClozeCard ? null : isFlashcard ? (
          showFeedback && (
            <>
              <div className="border-t border-border-light mb-6" />
              <p
                className="text-center text-2xl font-bold text-primary px-2"
                role="status"
              >
                {result.correctAnswer}
              </p>
            </>
          )
        ) : isSorting && question.sorting ? (
          <div className="flex flex-col gap-3">
            {question.sorting.items.map((item) => {
              const itemResult = result?.sorting?.perItem.find(
                (r) => r.text === item
              );
              return (
                <div
                  key={item}
                  className={`p-3 border rounded-xl ${
                    itemResult
                      ? itemResult.isCorrect
                        ? "border-success bg-success-light"
                        : "border-error bg-error-light"
                      : "border-border-light"
                  }`}
                >
                  <p className="text-base mb-2">{item}</p>
                  <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={item}>
                    {question.sorting!.categories.map((cat) => {
                      const chosen = placements[item] === cat;
                      const isCorrectCat = itemResult?.correct === cat;
                      return (
                        <button
                          key={cat}
                          type="button"
                          disabled={showFeedback}
                          onClick={() =>
                            setPlacements((p) => ({ ...p, [item]: cat }))
                          }
                          aria-pressed={chosen}
                          className={`text-sm px-3 py-1.5 rounded-full border transition-all duration-150 ${
                            showFeedback && isCorrectCat
                              ? "border-success bg-success-light font-semibold"
                              : chosen
                                ? showFeedback
                                  ? "border-error bg-error-light"
                                  : "border-primary bg-primary-light font-semibold"
                                : "border-border-light hover:border-border"
                          } ${showFeedback ? "cursor-default" : "cursor-pointer"}`}
                        >
                          {cat}
                          {showFeedback && isCorrectCat && " ✓"}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        ) : isFreeText ? (
          <textarea
            value={freeText}
            onChange={(e) => setFreeText(e.target.value)}
            disabled={showFeedback}
            rows={8}
            placeholder="Skriv ditt resonemang i löpande text..."
            className="input-field"
          />
        ) : (
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
        )}

        {showFeedback && result.isCorrect !== null && (
          <div
            className={`mt-4 p-4 rounded-xl ${
              result.isCorrect
                ? "bg-success-light text-success-dark"
                : "bg-error-light text-error"
            }`}
            role="status"
          >
            {result.isCorrect ? (
              <p className="font-semibold">
                Rätt! Hur kändes frågan? Ditt svar styr när den återkommer.
              </p>
            ) : result.sorting ? (
              <p className="font-semibold">
                {result.sorting.correctCount} av {result.sorting.total} rätt
                placerade. Titta på de markerade - frågan återkommer senare i
                passet.
              </p>
            ) : isCloze ? (
              <p className="font-semibold">
                {result.nearMiss
                  ? "Nästan! Rätt ord - men kolla stavningen."
                  : "Inte rätt."}{" "}
                Rätt svar: {result.correctAnswer}. Frågan återkommer senare i
                passet.
              </p>
            ) : (
              <p className="font-semibold">
                {selected === "__UNSURE__" ? "Du var osäker." : "Inte rätt."}{" "}
                Läs det rätta svaret ovan - frågan återkommer senare i passet.
              </p>
            )}
          </div>
        )}

        {showFeedback && result.exemplars && result.exemplars.length > 0 && (
          <ExemplarPanel exemplars={result.exemplars} />
        )}

        {error && (
          <p className="text-error text-sm font-medium mt-3" role="alert">
            {error}
          </p>
        )}
      </div>

      {showFeedback ? (
        result.selfAssess ? (
          <div>
            <p className="text-sm text-muted mb-2 text-center">
              {isClozeCard
                ? "Hur gick det? Ditt svar styr när meningen kommer tillbaka."
                : isFlashcard
                  ? "Hur gick det? Ditt svar styr när ordet kommer tillbaka."
                  : "Jämför med exempelsvaren: hur väl stod sig ditt resonemang?"}
            </p>
            <div className="grid grid-cols-4 gap-2">
              <button
                onClick={() => handleGrade(1)}
                disabled={grading}
                className="btn-secondary py-3 flex flex-col items-center"
              >
                <span className="font-semibold">Om igen</span>
                <span className="text-xs text-muted">senare i passet</span>
              </button>
              <button
                onClick={() => handleGrade(2)}
                disabled={grading}
                className="btn-secondary py-3 flex flex-col items-center"
              >
                <span className="font-semibold">Svårt</span>
                <IntervalHint show={result.schedulesToday} days={result.intervals.hard} />
              </button>
              <button
                onClick={() => handleGrade(3)}
                disabled={grading}
                className="btn-primary py-3 flex flex-col items-center"
              >
                <span className="font-semibold">Bra</span>
                <IntervalHint
                  show={result.schedulesToday}
                  days={result.intervals.good}
                  muted={false}
                />
              </button>
              <button
                onClick={() => handleGrade(4)}
                disabled={grading}
                className="btn-secondary py-3 flex flex-col items-center"
              >
                <span className="font-semibold">Lätt</span>
                <IntervalHint show={result.schedulesToday} days={result.intervals.easy} />
              </button>
            </div>
            <RerunNote show={!result.schedulesToday} />
          </div>
        ) : result.isCorrect === true ? (
          <div>
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => handleGrade(2)}
                disabled={grading}
                className="btn-secondary py-3 flex flex-col items-center"
              >
                <span className="font-semibold">Svårt</span>
                <IntervalHint show={result.schedulesToday} days={result.intervals.hard} />
              </button>
              <button
                onClick={() => handleGrade(3)}
                disabled={grading}
                className="btn-primary py-3 flex flex-col items-center"
              >
                <span className="font-semibold">Bra</span>
                <IntervalHint
                  show={result.schedulesToday}
                  days={result.intervals.good}
                  muted={false}
                />
              </button>
              <button
                onClick={() => handleGrade(4)}
                disabled={grading}
                className="btn-secondary py-3 flex flex-col items-center"
              >
                <span className="font-semibold">Lätt</span>
                <IntervalHint show={result.schedulesToday} days={result.intervals.easy} />
              </button>
            </div>
            <RerunNote show={!result.schedulesToday} />
          </div>
        ) : (
          <ActionRow pauseHref={pauseHref} pauseLabel={pauseLabel}>
            <button
              onClick={() => advance(true)}
              className="btn-primary w-full py-3"
            >
              Nästa fråga
            </button>
          </ActionRow>
        )
      ) : (
        <ActionRow pauseHref={pauseHref} pauseLabel={pauseLabel}>
          <button
            onClick={handleSubmit}
            disabled={!readyToSubmit || submitting}
            className="btn-primary w-full py-3"
          >
            {submitting
              ? isFlashcard
                ? "Vänder..."
                : isFreeText
                  ? "Skickar..."
                  : "Rättar..."
              : isFlashcard
                ? "Visa svar"
                : "Svara"}
          </button>
        </ActionRow>
      )}
    </div>
  );
}
