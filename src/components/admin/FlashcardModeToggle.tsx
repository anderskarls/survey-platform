"use client";

import { useState } from "react";

/**
 * Slår på flashcardläget för en kurs. Läget byter bara presentation:
 * flervalsfrågorna i banken är oförändrade och kan när som helst visas som
 * alternativlistor igen, utan att elevernas historik påverkas.
 */
export default function FlashcardModeToggle({
  courseId,
  initial,
}: {
  courseId: number;
  initial: boolean;
}) {
  const [enabled, setEnabled] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function toggle() {
    const next = !enabled;
    setSaving(true);
    setError("");
    // Optimistiskt: knappen svarar direkt och rullas tillbaka om anropet fallerar
    setEnabled(next);
    try {
      const res = await fetch(`/api/courses/${courseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flashcardMode: next }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setEnabled(!next);
        setError(data.error || "Kunde inte spara inställningen");
      }
    } catch {
      setEnabled(!next);
      setError("Kunde inte spara. Kontrollera din internetanslutning.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card p-5 mb-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-semibold tracking-tight">Flashcardläge</h2>
          <p className="text-sm text-muted mt-1 max-w-prose">
            Visar kursens flervalsfrågor som Anki-kort: eleven ser framsidan,
            försöker minnas, vänder kortet och skattar sig själv. Påverkar både
            quiz och övning i den här kursen. Frågorna i banken ändras inte.
          </p>
        </div>
        <button
          type="button"
          onClick={toggle}
          disabled={saving}
          role="switch"
          aria-checked={enabled}
          aria-label="Flashcardläge"
          className={`shrink-0 relative inline-flex h-7 w-12 items-center rounded-full transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
            enabled ? "bg-primary" : "bg-surface-muted"
          } ${saving ? "opacity-60" : ""}`}
        >
          <span
            className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform duration-150 ${
              enabled ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </button>
      </div>
      {error && (
        <p className="text-error text-sm font-medium mt-3" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
