/**
 * En enkät får bara innehålla frågor ur sin egen kurs.
 *
 * Kontrollen fanns bara på kursvägen (`/api/courses/[courseId]/surveys`). Den
 * kursfria `/api/surveys` och MCP:ns `create_survey` skapade glatt en enkät med
 * frågor ur en annan kurs, och konsekvensen låg långt bort från felklicket:
 * eleven svarar på frågan, den hamnar i FSRS-poolen och läggs först i
 * övningspasset - men `POST /api/student/practice` 404:ar på den, eftersom
 * frågans kurs inte finns bland elevens konton. Passet gick aldrig att
 * slutföra, tyst, och bara för de elever som råkade svara.
 *
 * Signaturen är strukturell i stället för Prisma-typad så att både webbappens
 * och MCP-serverns klient duger.
 */
interface FragelasareLike {
  question: {
    findMany(args: {
      where: { id: { in: number[] }; topic: { courseId: number } };
      select: { id: true };
    }): Promise<{ id: number }[]>;
  };
}

/** Returnerar de fråge-id som INTE hör till kursen (tom lista = allt ok) */
export async function fragorUtanforKursen(
  db: FragelasareLike,
  courseId: number,
  questionIds: number[]
): Promise<number[]> {
  if (questionIds.length === 0) return [];
  const giltiga = await db.question.findMany({
    where: { id: { in: questionIds }, topic: { courseId } },
    select: { id: true },
  });
  const giltigaIds = new Set(giltiga.map((q) => q.id));
  return questionIds.filter((id) => !giltigaIds.has(id));
}
