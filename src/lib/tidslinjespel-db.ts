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

export interface ElevOmgang {
  id: number;
  title: string;
  unitId: number | null;
  status: "oppen" | "stangd";
  /** null = inte påbörjad */
  besvarade: number | null;
  antalUppgifter: number;
  /** satt när eleven spelat klart */
  poang: number | null;
  maxPoang: number;
}

/**
 * De släppta omgångarna i elevens kurs med elevens läge i var och en. Dolda
 * omgångar finns inte för eleven. `unitId` avgränsar till ett moment.
 */
export async function omgangarForElev(
  courseId: number,
  studentId: number,
  unitId?: number
): Promise<ElevOmgang[]> {
  const omgangar = await prisma.timelineGameRelease.findMany({
    where: { courseId, releasedAt: { not: null }, ...(unitId !== undefined ? { unitId } : {}) },
    orderBy: { releasedAt: "desc" },
    select: {
      id: true,
      title: true,
      unitId: true,
      closedAt: true,
      items: true,
      rounds: {
        where: { studentId },
        select: { answered: true, score: true, maxScore: true, finishedAt: true },
      },
    },
  });
  return omgangar.map((o) => {
    const r = o.rounds[0];
    const antal = Array.isArray(o.items) ? o.items.length : 0;
    return {
      id: o.id,
      title: o.title,
      unitId: o.unitId,
      status: o.closedAt ? "stangd" : "oppen",
      besvarade: r ? r.answered : null,
      antalUppgifter: antal,
      poang: r?.finishedAt ? r.score : null,
      maxPoang: r?.maxScore ?? antal * 100,
    };
  });
}

/** Spelen kopplade till en kurs, för länkarna på elevens sidor. */
export function spelForKurs(courseId: number) {
  return prisma.timelineGame.findMany({
    where: { courses: { some: { courseId } } },
    select: { slug: true, title: true },
    orderBy: { title: "asc" },
  });
}
