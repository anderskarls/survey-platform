import { prisma } from "@/lib/prisma";
import type { AttemptRecord } from "@/lib/relearning";
import {
  beraknaFront,
  byggSektorer,
  type CampaignPayload,
  type FrontReport,
  type TopicInfo,
} from "@/lib/kampanj";
import type { Prisma } from "@prisma/client";

export interface KampanjViewData {
  courseName: string;
  report: FrontReport;
  /** När fronten senast visades (dagsrapportens jämförelsepunkt); null första gången */
  senastVisad: Date | null;
}

/**
 * Laddar kursens försökshistorik, beräknar frontläget, diffar mot senast
 * visade snapshot och persisterar det nya läget. Anropas när kampanjvyn
 * öppnas - dagsrapporten berättar rörelsen sedan förra visningen.
 */
export async function loadKampanjView(
  courseId: number,
  now: Date = new Date()
): Promise<KampanjViewData | null> {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { id: true, name: true },
  });
  if (!course) return null;

  const [topics, answers, practice, snapshot] = await Promise.all([
    prisma.topic.findMany({
      where: { courseId },
      orderBy: { id: "asc" },
      select: {
        id: true,
        name: true,
        unitId: true,
        unit: { select: { title: true } },
        questions: {
          where: { type: "MULTIPLE_CHOICE" },
          select: { id: true },
        },
      },
    }),
    prisma.answer.findMany({
      where: {
        response: { student: { courseId } },
        question: { type: "MULTIPLE_CHOICE" },
      },
      select: {
        questionId: true,
        isCorrect: true,
        response: { select: { studentId: true, createdAt: true } },
      },
    }),
    prisma.practiceAttempt.findMany({
      where: { student: { courseId } },
      select: {
        studentId: true,
        questionId: true,
        isCorrect: true,
        grade: true,
        createdAt: true,
      },
    }),
    prisma.campaignSnapshot.findUnique({ where: { courseId } }),
  ]);

  const topicInfos: TopicInfo[] = topics.map((t) => ({
    id: t.id,
    name: t.name,
    unitId: t.unitId,
    unitTitle: t.unit?.title ?? null,
    questionIds: t.questions.map((q) => q.id),
  }));
  const sectors = byggSektorer(topicInfos);

  const attemptsByStudent = new Map<number, AttemptRecord[]>();
  function push(studentId: number, record: AttemptRecord) {
    const list = attemptsByStudent.get(studentId);
    if (list) list.push(record);
    else attemptsByStudent.set(studentId, [record]);
  }
  for (const a of answers) {
    push(a.response.studentId, {
      questionId: a.questionId,
      isCorrect: a.isCorrect,
      createdAt: a.response.createdAt,
      source: "answer",
    });
  }
  for (const p of practice) {
    push(p.studentId, {
      questionId: p.questionId,
      isCorrect: p.isCorrect,
      grade: p.grade,
      createdAt: p.createdAt,
      source: "practice",
    });
  }

  const previous = (snapshot?.payload as unknown as CampaignPayload) ?? null;
  const report = beraknaFront(attemptsByStudent, sectors, previous, now);

  await prisma.campaignSnapshot.upsert({
    where: { courseId },
    update: {
      payload: report.payload as unknown as Prisma.InputJsonValue,
      shownAt: now,
    },
    create: {
      courseId,
      payload: report.payload as unknown as Prisma.InputJsonValue,
      shownAt: now,
    },
  });

  return {
    courseName: course.name,
    report,
    senastVisad: snapshot?.shownAt ?? null,
  };
}
