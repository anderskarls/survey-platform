import { prisma } from "@/lib/prisma";
import { tidslinjespelDataSchema, type TidslinjespelData } from "@/lib/tidslinjespel";

/**
 * Spelet med det här slug:et, om det är kopplat till kursen. Null annars -
 * ett spel som inte hör till elevens kurs ska se ut som ett som inte finns.
 * Korpusen valideras vid läsning; en trasig uppladdning ger null hellre än
 * en omgång som kraschar mitt i.
 */
export async function hamtaSpelForKurs(
  slug: string,
  courseId: number
): Promise<{ id: number; slug: string; title: string; data: TidslinjespelData } | null> {
  const spel = await prisma.timelineGame.findFirst({
    where: { slug, courses: { some: { courseId } } },
    select: { id: true, slug: true, title: true, data: true },
  });
  if (!spel) return null;
  const data = tidslinjespelDataSchema.safeParse(spel.data);
  if (!data.success) {
    console.error(`Tidslinjespelet ${slug} har ogiltig korpus`, data.error.issues);
    return null;
  }
  return { ...spel, data: data.data };
}

/** Spelen kopplade till en kurs, för länkarna på elevens sidor. */
export function spelForKurs(courseId: number) {
  return prisma.timelineGame.findMany({
    where: { courses: { some: { courseId } } },
    select: { slug: true, title: true },
    orderBy: { title: "asc" },
  });
}
