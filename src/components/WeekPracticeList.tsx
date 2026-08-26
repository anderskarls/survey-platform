import Link from "next/link";
import { weekStatusLabel, type WeekPracticeTopic } from "@/lib/week-practice";

/**
 * Veckolistan under dagens pass: elevens väg att öva en bestämd vecka i
 * stället för det kön ger. Renderas bara när det finns släppta veckor, så
 * kurser utan kortform ser ingenting.
 */
export default function WeekPracticeList({
  topics,
}: {
  topics: WeekPracticeTopic[];
}) {
  if (topics.length === 0) return null;

  return (
    <section className="mt-10">
      <h3 className="text-lg font-bold tracking-tight mb-1">Öva en vecka</h3>
      <p className="text-sm text-muted mb-4">
        Här ligger orden vecka för vecka, som kort. Välj den vecka du vill nöta
        - inför ett veckotest, eller för att ta igen en vecka du missat. Det du
        gör här räknas som övning: orden återkommer sedan i passet ovan.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {topics.map((t) => {
          const allMastered = t.total > 0 && t.mastered === t.total;
          return (
            <Link
              key={t.topicId}
              href={`/student/practice/${t.topicId}`}
              className="card p-4 flex items-center justify-between gap-3 hover:border-primary transition-colors"
            >
              <div className="min-w-0">
                <div className="font-semibold tracking-tight truncate">
                  {t.name}
                </div>
                <div className="text-xs text-muted mt-0.5">
                  {weekStatusLabel(t)}
                </div>
              </div>
              {allMastered ? (
                <span className="badge bg-success-light text-success-dark shrink-0">
                  Sitter
                </span>
              ) : t.due > 0 ? (
                <span className="badge bg-surface-muted text-muted shrink-0">
                  {t.due}
                </span>
              ) : null}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
