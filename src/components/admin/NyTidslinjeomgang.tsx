"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatAr } from "@/lib/tidslinje";
import { tolkaArtal } from "@/lib/tidslinjespel";

/**
 * Formuläret för en ny omgång: moment, tidsspann (förifyllt ur tidslinjens
 * vyer) och händelserna i spannet att bocka ur. Uppgifterna lottas på
 * servern när omgången skapas; den skapas dold och släpps från omgångens sida.
 */

interface Handelse {
  ar: number;
  rubrik: string;
  cirka?: boolean;
}

interface Spel {
  slug: string;
  title: string;
  handelser: Handelse[];
  vyer: { namn: string; fran: number; till: number }[];
}

interface Props {
  courseId: number;
  spel: Spel[];
  moment: { id: number; title: string }[];
  minUrval: number;
}

const nyckel = (h: Handelse) => `${h.ar}|${h.rubrik}`;

export default function NyTidslinjeomgang({ courseId, spel, moment, minUrval }: Props) {
  const router = useRouter();
  const [slug, setSlug] = useState(spel[0]?.slug ?? "");
  const valtSpel = spel.find((s) => s.slug === slug) ?? spel[0];
  const [unitId, setUnitId] = useState<number | null>(moment[0]?.id ?? null);
  const [titel, setTitel] = useState(moment[0] ? `Tidslinjen: ${moment[0].title}` : "Tidslinjen");
  const [titelRord, setTitelRord] = useState(false);
  const [franText, setFranText] = useState("");
  const [tillText, setTillText] = useState("");
  const [uteslutna, setUteslutna] = useState<Set<string>>(new Set());
  const [sparar, setSparar] = useState(false);
  const [fel, setFel] = useState<string | null>(null);

  const fran = tolkaArtal(franText);
  const till = tolkaArtal(tillText);
  const spannOk = fran !== null && till !== null && till > fran;

  const iSpannet = useMemo(
    () =>
      spannOk && valtSpel
        ? valtSpel.handelser.filter((h) => h.ar >= fran! && h.ar <= till!).sort((a, b) => a.ar - b.ar)
        : [],
    [spannOk, valtSpel, fran, till]
  );
  const valda = iSpannet.filter((h) => !uteslutna.has(nyckel(h)));

  function valjMoment(id: number | null) {
    setUnitId(id);
    if (!titelRord) {
      const m = moment.find((x) => x.id === id);
      setTitel(m ? `Tidslinjen: ${m.title}` : "Tidslinjen");
    }
  }

  function valjVy(namn: string) {
    const vy = valtSpel?.vyer.find((v) => v.namn === namn);
    if (!vy) return;
    setFranText(formatAr(vy.fran));
    setTillText(formatAr(vy.till));
  }

  function vaxla(h: Handelse) {
    setUteslutna((u) => {
      const ny = new Set(u);
      if (ny.has(nyckel(h))) ny.delete(nyckel(h));
      else ny.add(nyckel(h));
      return ny;
    });
  }

  async function skapa() {
    if (!spannOk || valda.length < minUrval) return;
    setSparar(true);
    setFel(null);
    try {
      const res = await fetch(`/api/courses/${courseId}/tidslinjespel/omgangar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          unitId,
          title: titel,
          fran,
          till,
          // Bara de urbockade som faktiskt ligger i spannet följer med.
          excluded: iSpannet.filter((h) => uteslutna.has(nyckel(h))).map(nyckel),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Omgången kunde inte skapas");
      router.push(`/admin/courses/${courseId}/tidslinjespel/omgang/${data.id}`);
    } catch (e) {
      setFel(e instanceof Error ? e.message : "Något gick fel");
      setSparar(false);
    }
  }

  if (!valtSpel) {
    return <p className="text-muted">Kursen är inte kopplad till något tidslinjespel.</p>;
  }

  return (
    <div className="card p-6 space-y-6 max-w-2xl">
      {spel.length > 1 && (
        <label className="block">
          <span className="text-sm font-medium">Tidslinje</span>
          <select className="input-field mt-1" value={slug} onChange={(e) => setSlug(e.target.value)}>
            {spel.map((s) => (
              <option key={s.slug} value={s.slug}>
                {s.title}
              </option>
            ))}
          </select>
        </label>
      )}

      <label className="block">
        <span className="text-sm font-medium">Moment</span>
        <select
          className="input-field mt-1"
          value={unitId ?? ""}
          onChange={(e) => valjMoment(e.target.value ? Number(e.target.value) : null)}
        >
          {moment.map((m) => (
            <option key={m.id} value={m.id}>
              {m.title}
            </option>
          ))}
          <option value="">Inget moment (visas på startsidan)</option>
        </select>
        <span className="text-xs text-muted">Omgången visas på momentets sida för eleverna.</span>
      </label>

      <label className="block">
        <span className="text-sm font-medium">Namn på omgången</span>
        <input
          className="input-field mt-1"
          value={titel}
          maxLength={120}
          onChange={(e) => {
            setTitel(e.target.value);
            setTitelRord(true);
          }}
        />
      </label>

      <div>
        <span className="text-sm font-medium">Tidsspann</span>
        {valtSpel.vyer.length > 0 && (
          <select
            className="input-field mt-1"
            defaultValue=""
            onChange={(e) => valjVy(e.target.value)}
            aria-label="Hämta spannet från en vy i tidslinjen"
          >
            <option value="" disabled>
              Hämta från tidslinjens vyer...
            </option>
            {valtSpel.vyer.map((v) => (
              <option key={v.namn} value={v.namn}>
                {v.namn} ({formatAr(v.fran)} - {formatAr(v.till)})
              </option>
            ))}
          </select>
        )}
        <div className="flex flex-wrap items-center gap-3 mt-2">
          <input
            className="input-field w-40"
            placeholder="från, t.ex. 2000 f.Kr."
            aria-label="Från år"
            value={franText}
            onChange={(e) => setFranText(e.target.value)}
          />
          <span className="text-muted">till</span>
          <input
            className="input-field w-40"
            placeholder="till, t.ex. 476"
            aria-label="Till år"
            value={tillText}
            onChange={(e) => setTillText(e.target.value)}
          />
        </div>
        {(franText || tillText) && !spannOk && (
          <p className="text-xs text-error mt-1">Skriv två årtal, det senare efter det tidigare (t.ex. 509 f.Kr.).</p>
        )}
      </div>

      {spannOk && (
        <div>
          <div className="text-sm font-medium mb-2">
            Händelser i spannet: {valda.length} av {iSpannet.length} med
          </div>
          {iSpannet.length === 0 ? (
            <p className="text-sm text-muted">Inga händelser i tidslinjen mellan de åren.</p>
          ) : (
            <ul className="border border-border-light rounded-lg divide-y divide-border-light max-h-96 overflow-y-auto">
              {iSpannet.map((h) => (
                <li key={nyckel(h)}>
                  <label className="flex items-center gap-3 px-3 py-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={!uteslutna.has(nyckel(h))} onChange={() => vaxla(h)} />
                    <span className="tabular-nums text-muted w-24 shrink-0">{formatAr(h.ar, h.cirka)}</span>
                    <span>{h.rubrik}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          {valda.length > 0 && valda.length < minUrval && (
            <p className="text-xs text-error mt-2">Det behövs minst {minUrval} händelser.</p>
          )}
          {valda.length >= minUrval && valda.length < 7 && (
            <p className="text-xs text-muted mt-2">
              Med {valda.length} händelser blir omgången kortare än tio uppgifter - varje händelse blir en
              uppgift, plus tre ordna-uppgifter.
            </p>
          )}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          className="btn-primary"
          disabled={sparar || !spannOk || valda.length < minUrval || titel.trim() === ""}
          onClick={skapa}
        >
          {sparar ? "Skapar..." : "Skapa omgången"}
        </button>
        <span className="text-xs text-muted">Den skapas dold - du ser uppgifterna innan du släpper den.</span>
      </div>
      {fel && (
        <p className="text-sm text-error" role="alert">
          {fel}
        </p>
      )}
    </div>
  );
}
