"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export interface BegreppskortRow {
  id: number;
  term: string;
  explanation: string;
  /** Övningsförsök + svar - ett kort som mötts kan inte tas bort */
  mott: number;
}

interface Radfel {
  rad: number;
  text: string;
  orsak: string;
}

/**
 * Rutan på momentsidan där läraren fångar begrepp som kom upp i klassrummet
 * men inte stod i momentplaneringen. En rad per begrepp; korten går direkt in
 * i elevernas övning (med det vanliga dagliga taket för nya kort).
 */
export default function UnitBegreppskort({
  courseId,
  unitId,
  cards,
}: {
  courseId: number;
  unitId: number;
  cards: BegreppskortRow[];
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [fel, setFel] = useState<Radfel[]>([]);
  const [removing, setRemoving] = useState<number | null>(null);

  async function save() {
    setSaving(true);
    setStatus(null);
    setFel([]);
    try {
      const res = await fetch(`/api/courses/${courseId}/units/${unitId}/begrepp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rader: text }),
      });
      const data = await res.json().catch(() => ({}));
      const radfel: Radfel[] = Array.isArray(data.fel) ? data.fel : [];
      setFel(radfel);
      if (!res.ok) throw new Error(data.error || "Kunde inte spara");

      const delar = [
        data.skapade ? `${data.skapade} nya` : null,
        data.uppdaterade ? `${data.uppdaterade} med ny förklaring` : null,
        data.oforandrade ? `${data.oforandrade} fanns redan` : null,
      ].filter(Boolean);
      setStatus({ ok: true, msg: `Sparat: ${delar.join(", ")}` });
      // Raderna som inte gick att tolka blir kvar i rutan så de kan rättas
      setText(radfel.map((f) => f.text).join("\n"));
      router.refresh();
    } catch (e) {
      setStatus({ ok: false, msg: (e as Error).message });
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: number) {
    setRemoving(id);
    setStatus(null);
    try {
      const res = await fetch(
        `/api/courses/${courseId}/units/${unitId}/begrepp?questionId=${id}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Kunde inte ta bort");
      }
      router.refresh();
    } catch (e) {
      setStatus({ ok: false, msg: (e as Error).message });
    } finally {
      setRemoving(null);
    }
  }

  return (
    <section className="mt-10">
      <label htmlFor="begreppsruta" className="block font-semibold tracking-tight mb-1">
        Begrepp i övningen
      </label>
      <p className="text-sm text-muted mb-3">
        Begrepp som kom upp på lektionen men inte står i planeringen. En rad per begrepp,
        med bindestreck mellan begrepp och förklaring. Korten går direkt in i elevernas
        övning. Skriver du ett befintligt begrepp igen byts förklaringen ut.
      </p>
      <textarea
        id="begreppsruta"
        className="input-field font-mono text-sm"
        rows={5}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={"Legitimitet - folkets acceptans av makten\nPolis - självstyrande grekisk stadsstat"}
      />
      <div className="flex flex-wrap items-center gap-4 mt-3">
        <button
          type="button"
          onClick={save}
          disabled={saving || !text.trim()}
          className="btn-primary"
        >
          {saving ? "Sparar..." : "Lägg till i övningen"}
        </button>
        {status && (
          <span className={`text-sm ${status.ok ? "text-success" : "text-error"}`} role="status">
            {status.msg}
          </span>
        )}
      </div>

      {fel.length > 0 && (
        <ul className="mt-3 text-sm text-error space-y-1">
          {fel.map((f) => (
            <li key={f.rad}>
              Rad {f.rad}: {f.orsak} (&quot;{f.text}&quot;)
            </li>
          ))}
        </ul>
      )}

      <div className="card divide-y divide-border-light mt-6">
        {cards.map((c) => (
          <div key={c.id} className="p-4 flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <p className="font-medium">{c.term}</p>
              <p className="text-sm text-muted">{c.explanation}</p>
            </div>
            {c.mott === 0 ? (
              <button
                type="button"
                onClick={() => remove(c.id)}
                disabled={removing === c.id}
                className="text-muted hover:text-error shrink-0 px-2"
                aria-label={`Ta bort ${c.term}`}
              >
                &times;
              </button>
            ) : (
              <span className="text-xs text-muted shrink-0" title="Elever har övat på kortet">
                övat
              </span>
            )}
          </div>
        ))}
        {cards.length === 0 && (
          <div className="p-4 text-sm text-muted">Momentet har inga egna begreppskort än.</div>
        )}
      </div>
    </section>
  );
}
