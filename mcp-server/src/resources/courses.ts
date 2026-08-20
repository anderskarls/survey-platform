import { prisma } from "../prisma.js";

export async function listCourses(): Promise<string> {
  const courses = await prisma.course.findMany({
    include: {
      _count: { select: { topics: true, surveys: true, students: true } },
    },
    orderBy: { name: "asc" },
  });

  return JSON.stringify(
    courses.map((c) => ({
      id: c.id,
      name: c.name,
      code: c.code,
      // Kortläget syns här så att det går att läsa av utan adminnyckel -
      // annars är det osynligt utifrån om en kurs kör flashcards.
      flashcardMode: c.flashcardMode,
      topicCount: c._count.topics,
      surveyCount: c._count.surveys,
      studentCount: c._count.students,
    })),
    null,
    2
  );
}

/**
 * Konkreta ämnes-URI:er, en per kurs. Utan den här listan är
 * survey://courses/{courseId}/topics osynlig för klienten: en mall utan
 * list-callback går bara att läsa av den som redan gissat rätt URI.
 */
export async function listTopicResourceUris() {
  const courses = await prisma.course.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  return courses.map((c) => ({
    uri: `survey://courses/${c.id}/topics`,
    name: `Ämnen i ${c.name}`,
    mimeType: "application/json",
  }));
}
