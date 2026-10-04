import Link from "next/link";

/**
 * Länkkorten till tidslinjespelen kursen är kopplad till. Visas på elevens
 * startsida och på momentsidorna; finns inga spel syns ingenting.
 */
export default function SpelKort({ spel }: { spel: { slug: string; title: string }[] }) {
  if (spel.length === 0) return null;
  return (
    <div className="space-y-2">
      {spel.map((s) => (
        <div key={s.slug} className="card p-4 flex items-center justify-between gap-4">
          <div>
            <span className="font-medium">Tidslinjespelet: {s.title}</span>
            <p className="text-sm text-muted mt-0.5">
              Placera händelser, skriv årtal och sätt dem i ordning - tio uppgifter per omgång.
            </p>
          </div>
          <Link href={`/spel/tidslinje/${s.slug}`} className="btn-accent inline-block shrink-0">
            Spela
          </Link>
        </div>
      ))}
    </div>
  );
}
