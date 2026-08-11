import { prisma } from "@/lib/prisma";
import { dayKey, type AttemptRecord } from "@/lib/relearning";
import {
  beraknaFront,
  byggSektorer,
  type CampaignPayload,
  valjBaslinje,
  type FrontReport,
  type TopicInfo,
} from "@/lib/kampanj";
import type { Prisma } from "@prisma/client";

export interface KampanjViewData {
  courseName: string;
  report: FrontReport;
  /** Dygnet dagsrapporten jämför mot; null första gången kampanjen visas */
  senastVisad: Date | null;
}

/**
 * Laddar kursens försökshistorik, beräknar frontläget och diffar mot
 * dagsrapportens jämförelsepunkt. Anropas när kampanjvyn öppnas.
 *
 * Jämförelsepunkten flyttas **en gång per dygn**, inte vid varje anrop. Innan
 * dess var varje sidladdning en ny dagsrapport: sex omladdningar på sex
 * sekunder tog fronten från 100 till 33 utan att en enda elev gjort något, och
 * den lärare som öppnade vyn på morgonen hade förbrukat dagens rörelse när
 * klassen kom. MAX_STEG dokumenteras som max rörelse *per dagsrapport* - den
 * här funktionen är stället där "per dagsrapport" faktiskt betyder något.
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
        response: { student: { courseId, isTest: false } },
        question: { type: "MULTIPLE_CHOICE" },
      },
      select: {
        questionId: true,
        isCorrect: true,
        response: { select: { studentId: true, createdAt: true } },
      },
    }),
    prisma.practiceAttempt.findMany({
      where: { student: { courseId, isTest: false } },
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

  const lagrat = (snapshot?.payload as unknown as CampaignPayload) ?? null;
  const idag = dayKey(now);
  const { baslinje, nyDagsrapport } = valjBaslinje(lagrat, idag);

  const report = beraknaFront(attemptsByStudent, sectors, baslinje, now);

  const nyPayload: CampaignPayload = {
    sectors: baslinje?.sectors ?? report.lage,
    senaste: report.lage,
    baslinjeDatum: idag,
  };
  const baslinjeSatt = nyDagsrapport ? now : (snapshot?.shownAt ?? now);

  await prisma.campaignSnapshot.upsert({
    where: { courseId },
    update: {
      payload: nyPayload as unknown as Prisma.InputJsonValue,
      shownAt: baslinjeSatt,
    },
    create: {
      courseId,
      payload: nyPayload as unknown as Prisma.InputJsonValue,
      shownAt: baslinjeSatt,
    },
  });

  return {
    courseName: course.name,
    report,
    // Första gången finns ingen jämförelsepunkt - rapporten säger "etablerar
    // ställningar", och då ska headern inte påstå att den jämför med något.
    senastVisad: lagrat === null ? null : (snapshot?.shownAt ?? null),
  };
}
