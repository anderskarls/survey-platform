import { prisma } from "@/lib/prisma";
import { dayKey } from "@/lib/relearning";
import { releasedWhere } from "@/lib/survey-release";
import type { WeekTopicInput } from "@/lib/week-practice";

/**
 * Veckorna eleven får öva i en kurs: kortformskurs, släppt enkät, och minst
 * ett kort i ämnet.
 *
 * "Släppt" avgörs av enkäten, inte av ämnet: ett ämne är öppet så snart någon
 * av dess frågor ingår i en enkät vars `openAt` passerat. Veckotestet och
 * glosekorten delar ämne (`Vecka 07`), så när testet släpps blir veckans ord
 * övningsbara - och inte en minut tidigare.
 *
 * Returnerar tom lista för kurser utan kortform. Det är avsiktligt: i en
 * vanlig kurs vore listan en väg att köra om quizfrågor utanför provet.
 */
export async function loadWeekPracticeTopics(
  courseId: number,
  now: Date = new Date()
): Promise<WeekTopicInput[]> {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { flashcardMode: true },
  });
  if (!course?.flashcardMode) return [];

  // Ämnen som har minst en fråga i en släppt enkät i samma kurs.
  const released = await prisma.question.findMany({
    where: {
      topic: { courseId },
      surveyQuestions: {
        some: { survey: { courseId, ...releasedWhere(now) } },
      },
    },
    select: { topicId: true },
    distinct: ["topicId"],
  });
  const releasedTopicIds = released.map((q) => q.topicId);
  if (releasedTopicIds.length === 0) return [];

  // Korten: bara flervalsfrågor: det är de som visas i kortform. Luckfrågorna
  // i veckotestet hålls utanför övningen, precis som i det dagliga passet.
  const topics = await prisma.topic.findMany({
    where: { courseId, id: { in: releasedTopicIds } },
    select: {
      id: true,
      name: true,
      questions: {
        where: { type: "MULTIPLE_CHOICE" },
        select: { id: true },
        orderBy: { id: "asc" },
      },
    },
  });

  return topics
    .filter((t) => t.questions.length > 0)
    .map((t) => ({
      id: t.id,
      name: t.name,
      questionIds: t.questions.map((q) => q.id),
    }));
}

/**
 * Korten eleven redan gjort IDAG, av de frågor som skickas in.
 *
 * Räknar både övningsförsök och quizsvar, av samma skäl som `hasAttemptOnDay`
 * gör det: har frågan mötts i ett skarpt quiz tidigare på dagen är den redan
 * avräknad, och en repris i drillen flyttar inget.
 *
 * Dygnet är elevens, inte serverns. Därför hämtas två dygn bakåt och jämförs
 * på `dayKey` (Europe/Stockholm) i stället för att räkna på UTC-midnatt.
 */
export async function loadDoneToday(
  studentId: number,
  questionIds: number[],
  now: Date = new Date()
): Promise<Set<number>> {
  if (questionIds.length === 0) return new Set();
  const idag = dayKey(now);
  const sedan = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

  const [ovning, svar] = await Promise.all([
    prisma.practiceAttempt.findMany({
      where: {
        studentId,
        questionId: { in: questionIds },
        createdAt: { gte: sedan },
      },
      select: { questionId: true, createdAt: true },
    }),
    prisma.answer.findMany({
      where: {
        questionId: { in: questionIds },
        response: { studentId, createdAt: { gte: sedan } },
      },
      select: { questionId: true, response: { select: { createdAt: true } } },
    }),
  ]);

  const gjorda = new Set<number>();
  for (const a of ovning) {
    if (dayKey(a.createdAt) === idag) gjorda.add(a.questionId);
  }
  for (const a of svar) {
    if (dayKey(a.response.createdAt) === idag) gjorda.add(a.questionId);
  }
  return gjorda;
}
