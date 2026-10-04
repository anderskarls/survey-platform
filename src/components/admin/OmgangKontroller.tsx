"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { OmgangsStatus } from "@/lib/tidslinjespel";

/**
 * Knapparna för en omgång: släpp, stäng, öppna igen, lotta om och ta bort.
 * Lotta om och ta bort finns bara så länge ingen elev har börjat - servern
 * vägrar annars ändå. Borttagning kräver en andra tryckning i stället för en
 * webbläsardialog.
 */
export default function OmgangKontroller({
  courseId,
  releaseId,
  status,
  harSpelats,
}: {
  courseId: number;
  releaseId: number;
  status: OmgangsStatus;
  harSpelats: boolean;
}) {
  const router = useRouter();
  const [upptagen, setUpptagen] = useState(false);
  const [fel, setFel] = useState<string | null>(null);
  const [bekraftaBort, setBekraftaBort] = useState(false);
  const url = `/api/courses/${courseId}/tidslinjespel/omgangar/${releaseId}`;

  async function anropa(init: RequestInit, efter?: () => void) {
    setUpptagen(true);
    setFel(null);
    try {
      const res = await fetch(url, init);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Det gick inte");
      if (efter) efter();
      else router.refresh();
    } catch (e) {
      setFel(e instanceof Error ? e.message : "Något gick fel");
    } finally {
      setUpptagen(false);
    }
  }

  const atgard = (action: string) =>
    anropa({
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {status === "dold" && (
          <button type="button" className="btn-primary" disabled={upptagen} onClick={() => atgard("slapp")}>
            Släpp nu
          </button>
        )}
        {status === "oppen" && (
          <button type="button" className="btn-secondary" disabled={upptagen} onClick={() => atgard("stang")}>
            Stäng omgången
          </button>
        )}
        {status === "stangd" && (
          <button type="button" className="btn-secondary" disabled={upptagen} onClick={() => atgard("oppna")}>
            Öppna igen
          </button>
        )}
        {!harSpelats && (
          <button type="button" className="btn-secondary" disabled={upptagen} onClick={() => atgard("lotta-om")}>
            Lotta nya uppgifter
          </button>
        )}
        {!harSpelats &&
          (bekraftaBort ? (
            <button
              type="button"
              className="btn-secondary text-error"
              disabled={upptagen}
              onClick={() =>
                anropa({ method: "DELETE" }, () => router.push(`/admin/courses/${courseId}/tidslinjespel`))
              }
            >
              Ja, ta bort
            </button>
          ) : (
            <button type="button" className="btn-secondary" disabled={upptagen} onClick={() => setBekraftaBort(true)}>
              Ta bort
            </button>
          ))}
      </div>
      {fel && (
        <p className="text-sm text-error mt-2" role="alert">
          {fel}
        </p>
      )}
    </div>
  );
}
