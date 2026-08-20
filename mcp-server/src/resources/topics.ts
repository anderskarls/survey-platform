import { prisma } from "../prisma.js";

export async function listTopics(courseId: number): Promise<string> {
  const topics = await prisma.topic.findMany({
    where: { courseId },
    include: { _count: { select: { questions: true } } },
    orderBy: { name: "asc" },
  });

  return JSON.stringify(
    topics.map((t) => ({
      id: t.id,
      name: t.name,
      questionCount: t._count.questions,
    })),
    null,
    2
  );
}

/**
 * Konkreta fråge-URI:er, en per ämne. Motsvarigheten till
 * listTopicResourceUris för survey://topics/{topicId}/questions.
 */
export async function listQuestionResourceUris() {
  const topics = await prisma.topic.findMany({
    select: { id: true, name: true, course: { select: { name: true } } },
    orderBy: [{ course: { name: "asc" } }, { name: "asc" }],
  });
  return topics.map((t) => ({
    uri: `survey://topics/${t.id}/questions`,
    name: `${t.course.name} - ${t.name}`,
    mimeType: "application/json",
  }));
}
