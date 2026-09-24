"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import { isManualRelease } from "@/lib/survey-release";
import type { VersionCandidate } from "@/lib/survey-version";

export interface VeckotestKurs {
  id: number;
  name: string;
  code: string;
  /** Näst på tur att öppnas, eller null när kursen inte har något ostängt kvar. */
  next: {
    id: number;
    title: string;
    questionCount: number;
    /** ISO-sträng - Date överlever inte vägen från serverkomponenten. */
    openAt: string;
  } | null;
  /** Titlarna som står på tur efter nästa, högst tre, så ordningen syns. */
  sedanStar: string[];
  queueLength: number;
  openCount: number;
  totalCount: number;
  /** Öppnade test som kan skickas ut i en ny version, i titelordning. */
  versioner: VersionCandidate[];
}

/**
 * Fast tidszon i stället för webbläsarens egen.
 *
 * Kortet renderas både på servern (UTC på Vercel) och i webbläsaren. Läser de
 * två klockorna olika blir det en hydreringsmiss mitt i sidan, och ett
 * schemalagt släpp kan dessutom visas två timmar fel. Alla kurser ligger i
 * samma tidszon som skolan.
 */
const tid = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Europe/Stockholm",
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * Ett kurskort med veckans nästa test och knappen som öppnar det.
 *
 * Knappen frågar en gång innan den gör något. Ett öppnat test går inte att
 * stänga igen - spärren har inget `closeAt`, för att den som varit sjuk ska
 * kunna ta igen - så ett felklick lämnar nästa veckas ord framme för hela
 * klassen. Steget kostar en sekund och är det enda som skiljer den här knappen
 * från "Släpp nu" i enkätlistan.
 */
export default function VeckotestKort({ kurs }: { kurs: VeckotestKurs }) {
  const { showToast } = useToast();
  const router = useRouter();
  const [fragar, setFragar] = useState(false);
  const [oppnar, setOppnar] = useState(false);
  const next = kurs.next;

  async function slapp() {
    if (!next) return;
    setOppnar(true);
    try {
      // Den kursfria routen: den läser kursen ur enkäten och prövar
      // behörigheten mot den, så kortet slipper bära kurs-id in i URL:en.
      const res = await fetch(`/api/surveys/${next.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ openAt: null }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        showToast(data.error || "Kunde inte öppna testet", "error");
        return;
      }
      // Släppet öppnar också veckans ord för övning i kortkurserna - säg det,
      // annars ser läraren en tyst sidoeffekt på övningssidan.
      const data = await res.json().catch(() => null);
      const oppnadeVeckor = data?.impact?.openedPracticeTopics ?? 0;
      showToast(
        oppnadeVeckor > 0
          ? `${next.title} är öppet - och veckans ord öppnades för övning`
          : `${next.title} är öppet`
      );
      setFragar(false);
      router.refresh();
    } catch {
      showToast(
        "Kunde inte öppna testet. Kontrollera din internetanslutning.",
        "error"
      );
    } finally {
      setOppnar(false);
    }
  }

  const vantelage = next
    ? isManualRelease({ openAt: new Date(next.openAt) })
      ? "väntar på dig"
      : `öppnar annars ${tid.format(new Date(next.openAt))}`
    : "";

  return (
    <div className="card p-5 flex flex-col">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="font-semibold tracking-tight truncate">{kurs.name}</h2>
          <div className="text-xs text-muted font-mono tracking-wider mt-0.5">
            {kurs.code}
          </div>
        </div>
        <Link
          href={`/admin/courses/${kurs.id}/surveys`}
          className="text-sm text-primary hover:underline shrink-0"
        >
          Alla test
        </Link>
      </div>

      {next ? (
        <>
          <div className="mt-5">
            <div className="text-xs uppercase tracking-wide text-muted">
              Näst på tur
            </div>
            <div className="text-lg font-semibold tracking-tight mt-0.5">
              {next.title}
            </div>
            <div className="text-sm text-muted mt-0.5">
              {next.questionCount} frågor &middot; {vantelage}
            </div>
          </div>

          <div className="mt-4">
            {fragar ? (
              <div className="rounded-lg border border-border bg-surface-muted/50 p-3">
                <p className="text-sm mb-3">
                  Öppna <strong>{next.title}</strong> för klassen nu? Ett öppnat
                  test går inte att stänga igen.
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={slapp}
                    disabled={oppnar}
                    className="btn-primary"
                  >
                    {oppnar ? "Öppnar..." : "Ja, öppna"}
                  </button>
                  <button
                    onClick={() => setFragar(false)}
                    disabled={oppnar}
                    className="btn-secondary"
                  >
                    Avbryt
                  </button>
                </div>
              </div>
            ) : (
              <button onClick={() => setFragar(true)} className="btn-primary w-full">
                Öppna {next.title}
              </button>
            )}
          </div>
        </>
      ) : (
        <p className="text-sm text-muted mt-5">
          Alla test i kursen är öppna.
        </p>
      )}

      {kurs.versioner.length > 0 && <NyVersion versioner={kurs.versioner} />}

      <div className="mt-auto pt-4 text-xs text-muted">
        <div>
          {kurs.openCount} av {kurs.totalCount} test är öppna
        </div>
        {kurs.sedanStar.length > 0 && (
          <div className="mt-1 truncate">
            Sedan står: {kurs.sedanStar.join(", ")}
            {kurs.queueLength > kurs.sedanStar.length + 1 && " ..."}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Skicka ut ett redan öppnat test igen: samma ord, nya meningar.
 *
 * Förvalt är det senaste öppnade testet i titelordning - det är det läraren
 * nästan alltid menar ("veckans test en gång till"). Knappen frågar en gång,
 * av samma skäl som öppningsknappen: versionen öppnas för klassen direkt och
 * kan inte dras tillbaka härifrån.
 */
function NyVersion({ versioner }: { versioner: VersionCandidate[] }) {
  const { showToast } = useToast();
  const router = useRouter();
  const [valdId, setValdId] = useState(versioner[versioner.length - 1].id);
  const [fragar, setFragar] = useState(false);
  const [skickar, setSkickar] = useState(false);
  const vald = versioner.find((v) => v.id === valdId) ?? versioner[versioner.length - 1];

  async function skicka() {
    setSkickar(true);
    try {
      const res = await fetch(`/api/surveys/${vald.id}/versions`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(data.error || "Kunde inte skapa versionen", "error");
        return;
      }
      showToast(`${data.survey?.title ?? "Versionen"} är öppen för klassen`);
      setFragar(false);
      router.refresh();
    } catch {
      showToast(
        "Kunde inte skapa versionen. Kontrollera din internetanslutning.",
        "error"
      );
    } finally {
      setSkickar(false);
    }
  }

  return (
    <div className="mt-5 pt-4 border-t border-border">
      <div className="text-xs uppercase tracking-wide text-muted">
        Ny version av ett öppnat test
      </div>
      <p className="text-sm text-muted mt-0.5">
        Samma ord, nya meningar. Blir ett eget test bredvid originalet.
      </p>
      <div className="mt-3 flex items-center gap-2">
        <select
          value={vald.id}
          onChange={(e) => {
            setValdId(Number(e.target.value));
            setFragar(false);
          }}
          disabled={skickar}
          className="input-field flex-1 min-w-0"
          aria-label="Test att skicka ut igen"
        >
          {versioner.map((v) => (
            <option key={v.id} value={v.id}>
              {v.title}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-3">
        {fragar ? (
          <div className="rounded-lg border border-border bg-surface-muted/50 p-3">
            <p className="text-sm mb-3">
              Skicka ut <strong>{vald.title} - version {vald.nextVersion}</strong>{" "}
              till klassen nu? Det öppnas direkt.
            </p>
            <div className="flex items-center gap-2">
              <button onClick={skicka} disabled={skickar} className="btn-primary">
                {skickar ? "Skickar..." : "Ja, skicka ut"}
              </button>
              <button
                onClick={() => setFragar(false)}
                disabled={skickar}
                className="btn-secondary"
              >
                Avbryt
              </button>
            </div>
          </div>
        ) : (
          <button onClick={() => setFragar(true)} className="btn-secondary w-full">
            Skicka ut version {vald.nextVersion}
          </button>
        )}
        <div className="text-xs text-muted mt-1.5">
          {vald.left === 1
            ? "Det här är sista versionen som finns meningar till."
            : `Meningar finns till ${vald.left} versioner till.`}
        </div>
      </div>
    </div>
  );
}
