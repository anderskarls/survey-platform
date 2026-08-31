"use client";

import { useState } from "react";

export interface PracticeTopicRow {
  id: number;
  name: string;
  questionCount: number;
  practiceOpen: boolean;
}

/**
 * Släpper veckor till elevernas övningspass, en i taget.
 *
 * En öppnad vecka låter sina flervalsfrågor flöda in som nya kort, med
 * dagligt tak - läraren styr alltså takten, inte eleven. Att stänga igen
 * stoppar bara inflödet: ord eleven redan mött ligger kvar i övningen med
 * sin historik.
 */
export default function PracticeTopicRelease({
  courseId,
  topics,
  dailyCap,
}: {
  courseId: number;
  topics: PracticeTopicRow[];
  /** DAILY_NEW_CARD_CAP, skickad från serversidan så talet i texten
   *  inte kan hamna på efterkälken när taket ändras. */
  dailyCap: number;
}) {
  const [open, setOpen] = useState<Record<number, boolean>>(
    Object.fromEntries(topics.map((t) => [t.id, t.practiceOpen]))
  );
  const [saving, setSaving] = useState<number | null>(null);
  const [error, setError] = useState("");

  async function toggle(topicId: number) {
    const next = !open[topicId];
    setSaving(topicId);
    setError("");
    // Optimistiskt, som flashcardreglaget - rullas tillbaka om anropet fallerar
    setOpen((prev) => ({ ...prev, [topicId]: next }));
    try {
      const res = await fetch(`/api/courses/${courseId}/topics/${topicId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ practiceOpen: next }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setOpen((prev) => ({ ...prev, [topicId]: !next }));
        setError(data.error || "Kunde inte spara");
      }
    } catch {
      setOpen((prev) => ({ ...prev, [topicId]: !next }));
      setError("Kunde inte spara. Kontrollera din internetanslutning.");
    } finally {
      setSaving(null);
    }
  }

  const openCount = topics.filter((t) => open[t.id]).length;

  if (topics.length === 0) return null;

  return (
    <div className="card p-5 mb-8">
      <h2 className="font-semibold tracking-tight">Öppna för övning</h2>
      <p className="text-sm text-muted mt-1 mb-4 max-w-prose">
        En öppnad vecka börjar mata elevernas övningspass med sina ord, högst{" "}
        {dailyCap} nya per dag och elev. Repetitioner går alltid före nya ord. Stäng
        igen när du vill - ord eleverna redan mött ligger kvar och fortsätter
        repeteras. {openCount} av {topics.length} veckor är öppna.
      </p>
      {error && (
        <p className="text-error text-sm font-medium mb-3" role="alert">
          {error}
        </p>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        {topics.map((t) => {
          const isOpen = open[t.id];
          return (
            <div
              key={t.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-border-light px-3 py-2"
            >
              <div className="min-w-0">
                <div className="text-sm font-medium truncate" title={t.name}>
                  {t.name}
                </div>
                <div className="text-xs text-muted-light">
                  {t.questionCount}{" "}
                  {t.questionCount === 1 ? "fråga" : "frågor"}
                </div>
              </div>
              <button
                type="button"
                onClick={() => toggle(t.id)}
                disabled={saving === t.id}
                role="switch"
                aria-checked={isOpen}
                aria-label={`Öppna ${t.name} för övning`}
                className={`shrink-0 relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
                  isOpen ? "bg-primary" : "bg-surface-muted"
                } ${saving === t.id ? "opacity-60" : ""}`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-150 ${
                    isOpen ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
