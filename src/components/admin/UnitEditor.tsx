"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { LessonOutline } from "@/lib/moment-status";

interface UnitEditorProps {
  courseId: number;
  unitId: number;
  initialPeriod: string;
  initialGoals: string[];
  initialLessons: LessonOutline[];
}

export default function UnitEditor({
  courseId,
  unitId,
  initialPeriod,
  initialGoals,
  initialLessons,
}: UnitEditorProps) {
  const router = useRouter();
  const [period, setPeriod] = useState(initialPeriod);
  const [goals, setGoals] = useState<string[]>(initialGoals.length ? initialGoals : [""]);
  const [lessons, setLessons] = useState<LessonOutline[]>(
    [...initialLessons].sort((a, b) => a.n - b.n)
  );
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);

  const setLesson = (n: number, patch: Partial<LessonOutline>) =>
    setLessons((ls) => ls.map((l) => (l.n === n ? { ...l, ...patch } : l)));

  async function save() {
    setSaving(true);
    setStatus(null);
    try {
      const res = await fetch(`/api/courses/${courseId}/units/${unitId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          period,
          goals: goals.map((g) => g.trim()).filter(Boolean),
          lessons: lessons.map((l) => ({
            n: l.n,
            title: l.title,
            note: l.note,
            date: l.date || undefined,
            week: l.week || undefined,
          })),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Kunde inte spara");
      }
      setStatus({ ok: true, msg: "Sparat" });
      router.refresh();
    } catch (e) {
      setStatus({ ok: false, msg: (e as Error).message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-8">
      {/* Period */}
      <section>
        <label className="block font-semibold tracking-tight mb-1">Tidsperiod</label>
        <p className="text-sm text-muted mb-2">Visas i elevens momenthuvud, t.ex. &quot;ca 800-300 f.Kr.&quot;</p>
        <input
          className="input-field max-w-sm"
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          placeholder="ca 800-300 f.Kr."
        />
      </section>

      {/* Goals */}
      <section>
        <label className="block font-semibold tracking-tight mb-1">Lärandemål</label>
        <p className="text-sm text-muted mb-3">Mål på momentnivå som visas för eleven.</p>
        <div className="space-y-2">
          {goals.map((g, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="font-mono text-xs text-muted w-7 shrink-0">{String(i + 1).padStart(2, "0")}</span>
              <input
                className="input-field"
                value={g}
                onChange={(e) => setGoals((gs) => gs.map((x, j) => (j === i ? e.target.value : x)))}
                placeholder="Lärandemål..."
              />
              <button
                type="button"
                onClick={() => setGoals((gs) => gs.filter((_, j) => j !== i))}
                className="text-muted hover:text-error shrink-0 px-2"
                aria-label="Ta bort mål"
              >
                &times;
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setGoals((gs) => [...gs, ""])}
          className="btn-secondary text-sm mt-3"
        >
          + Lägg till mål
        </button>
      </section>

      {/* Lessons */}
      <section>
        <label className="block font-semibold tracking-tight mb-1">Lektioner - rekommenderade datum</label>
        <p className="text-sm text-muted mb-3">
          Självgående takt: datumen är rekommendationer, inget låses. De driver &quot;missad&quot;/&quot;kommande&quot; och veckogruppering i elevvyn. Vecka är valfri (t.ex. &quot;v.17&quot;).
        </p>
        <div className="card divide-y divide-border-light">
          {lessons.map((l) => (
            <div key={l.n} className="p-4 flex flex-wrap items-center gap-3">
              <span className="font-mono text-xs text-muted w-7 shrink-0">{String(l.n).padStart(2, "0")}</span>
              <span className="font-medium flex-1 min-w-[10rem]">{l.title}</span>
              <input
                type="date"
                className="input-field w-auto"
                value={l.date ?? ""}
                onChange={(e) => setLesson(l.n, { date: e.target.value })}
              />
              <input
                className="input-field w-24"
                value={l.week ?? ""}
                onChange={(e) => setLesson(l.n, { week: e.target.value })}
                placeholder="v.17"
              />
            </div>
          ))}
          {lessons.length === 0 && (
            <div className="p-4 text-sm text-muted">Momentet har inga lektioner i lektionsbågen.</div>
          )}
        </div>
      </section>

      <div className="flex items-center gap-4">
        <button onClick={save} disabled={saving} className="btn-primary">
          {saving ? "Sparar..." : "Spara"}
        </button>
        {status && (
          <span className={`text-sm ${status.ok ? "text-success" : "text-error"}`}>{status.msg}</span>
        )}
      </div>
    </div>
  );
}
