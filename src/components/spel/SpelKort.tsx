import Link from "next/link";
import type { ElevOmgang } from "@/lib/tidslinjespel-db";

/**
 * Länkkorten till tidslinjespelet: först lärarens släppta omgångar, sedan
 * det fria spelet mot hela tidslinjen. Visas på elevens startsida och på
 * momentsidorna; finns inget syns ingenting.
 */
export default function SpelKort({
  spel,
  omgangar = [],
}: {
  spel: { slug: string; title: string }[];
  omgangar?: ElevOmgang[];
}) {
  if (spel.length === 0 && omgangar.length === 0) return null;
  return (
    <div className="space-y-2">
      {omgangar.map((o) => (
        <OmgangsKort key={o.id} omgang={o} />
      ))}
      {spel.map((s) => (
        <div key={s.slug} className="card p-4 flex items-center justify-between gap-4">
          <div>
            <span className="font-medium">Tidslinjespelet: {s.title}</span>
            <p className="text-sm text-muted mt-0.5">
              Fritt spel mot hela tidslinjen - tio nya uppgifter varje omgång.
            </p>
          </div>
          <Link href={`/spel/tidslinje/${s.slug}`} className="btn-secondary inline-block shrink-0">
            Spela
          </Link>
        </div>
      ))}
    </div>
  );
}

function OmgangsKort({ omgang: o }: { omgang: ElevOmgang }) {
  const href = `/spel/tidslinje/omgang/${o.id}`;
  let text: string;
  let knapp: { text: string; klass: string } | null;
  if (o.poang !== null) {
    text = `Klar: ${o.poang} av ${o.maxPoang} poäng.`;
    knapp = { text: "Se resultat", klass: "btn-secondary" };
  } else if (o.status === "stangd") {
    text = o.besvarade ? "Stängd innan du hann spela klart." : "Stängd.";
    knapp = null;
  } else if (o.besvarade) {
    text = `Påbörjad - ${o.besvarade} av ${o.antalUppgifter} uppgifter besvarade.`;
    knapp = { text: "Fortsätt", klass: "btn-accent" };
  } else {
    text = `${o.antalUppgifter} uppgifter, ett försök.`;
    knapp = { text: "Spela", klass: "btn-accent" };
  }
  return (
    <div className="card p-4 flex items-center justify-between gap-4">
      <div>
        <span className="font-medium">{o.title}</span>
        <p className="text-sm text-muted mt-0.5">{text}</p>
      </div>
      {knapp && (
        <Link href={href} className={`${knapp.klass} inline-block shrink-0`}>
          {knapp.text}
        </Link>
      )}
    </div>
  );
}
