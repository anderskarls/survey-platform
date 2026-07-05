import { prisma } from "@/lib/prisma";
import {
  AttemptRecord,
  PracticeCandidate,
  QuestionPracticeState,
  buildRelearningStates,
  summarizeStates,
} from "@/lib/relearning";

export interface LinkedAccount {
  studentId: number;
  courseId: number;
  courseName: string;
}

/**
 * Slår upp alla elevkonton som hör till samma fysiska elev via personKey.
 * Utan personKey är eleven bara sitt eget konto.
 */
export async function resolveLinkedAccounts(
  studentId: number
): Promise<LinkedAccount[]> {
  const self = await prisma.student.findUnique({
    where: { id: studentId },
    select: {
      id: true,
      personKey: true,
      courseId: true,
      course: { select: { name: true } },
    },
  });
  if (!self) return [];
  if (!self.personKey) {
    return [
      { studentId: self.id, courseId: self.courseId, courseName: self.course.name },
    ];
  }
  const accounts = await prisma.student.findMany({
    where: { personKey: self.personKey },
    select: {
      id: true,
      courseId: true,
      course: { select: { name: true } },
    },
    orderBy: { id: "asc" },
  });
  return accounts.map((a) => ({
    studentId: a.id,
    courseId: a.courseId,
    courseName: a.course.name,
  }));
}

export interface PracticeQuestionInfo {
  courseId: number;
  courseName: string;
  ownerStudentId: number;
}

export interface RelearningData {
  accounts: LinkedAccount[];
  states: Map<number, QuestionPracticeState>;
  candidates: PracticeCandidate[];
  questionInfo: Map<number, PracticeQuestionInfo>;
}

/**
 * Laddar elevens samlade försökshistorik (skarpa quiz-svar + övningsförsök)
 * för flervalsfrågor och beräknar FSRS-status. Poolen = alla frågor eleven
 * mött (minst ett försök). Länkade konton (samma personKey, t.ex. samma elev
 * i två kurser) slås ihop så att övningen täcker alla kurser oavsett vilket
 * konto eleven är inloggad på. Varje fråga hör till exakt en kurs, så
 * historiken per fråga blandas aldrig mellan konton.
 */
export async function loadRelearningData(
  studentId: number,
  now: Date = new Date()
): Promise<RelearningData> {
  const accounts = await resolveLinkedAccounts(studentId);
  const studentIds = accounts.map((a) => a.studentId);
  const accountByCourse = new Map(accounts.map((a) => [a.courseId, a]));

  const [answers, practice] = await Promise.all([
    prisma.answer.findMany({
      where: {
        response: { studentId: { in: studentIds } },
        question: { type: "MULTIPLE_CHOICE" },
      },
      select: {
        questionId: true,
        isCorrect: true,
        response: { select: { createdAt: true } },
        question: {
          select: { topicId: true, topic: { select: { courseId: true } } },
        },
      },
    }),
    prisma.practiceAttempt.findMany({
      where: { studentId: { in: studentIds } },
      select: {
        questionId: true,
        isCorrect: true,
        grade: true,
        createdAt: true,
        question: {
          select: { topicId: true, topic: { select: { courseId: true } } },
        },
      },
    }),
  ]);

  const attempts: AttemptRecord[] = [
    ...answers.map(
      (a): AttemptRecord => ({
        questionId: a.questionId,
        isCorrect: a.isCorrect,
        createdAt: a.response.createdAt,
        source: "answer",
      })
    ),
    ...practice.map(
      (p): AttemptRecord => ({
        questionId: p.questionId,
        isCorrect: p.isCorrect,
        grade: p.grade,
        createdAt: p.createdAt,
        source: "practice",
      })
    ),
  ];

  const topicByQuestion = new Map<number, number>();
  const questionInfo = new Map<number, PracticeQuestionInfo>();
  function register(questionId: number, topicId: number, courseId: number) {
    topicByQuestion.set(questionId, topicId);
    const account = accountByCourse.get(courseId);
    if (account && !questionInfo.has(questionId)) {
      questionInfo.set(questionId, {
        courseId,
        courseName: account.courseName,
        ownerStudentId: account.studentId,
      });
    }
  }
  for (const a of answers)
    register(a.questionId, a.question.topicId, a.question.topic.courseId);
  for (const p of practice)
    register(p.questionId, p.question.topicId, p.question.topic.courseId);

  const states = buildRelearningStates(attempts, now);
  const candidates: PracticeCandidate[] = Array.from(states.keys()).map(
    (questionId) => ({
      questionId,
      topicId: topicByQuestion.get(questionId) ?? 0,
    })
  );

  return { accounts, states, candidates, questionInfo };
}

export interface StudentPracticeOverview {
  studentId: number;
  due: number;
  learning: number;
  graduated: number;
  attempts7d: number;
  lastPractice: Date | null;
}

export interface QuestionGapOverview {
  questionId: number;
  text: string;
  topicName: string;
  studentsInLearning: number;
  studentsDue: number;
}

export interface CourseRelearningOverview {
  byStudent: Map<number, StudentPracticeOverview>;
  questionGaps: QuestionGapOverview[];
  totals: {
    due: number;
    learning: number;
    graduated: number;
    activePractitioners7d: number;
    attempts7d: number;
  };
}

/**
 * Lärarvyn: ominlärningsläget för en hel kurs - per elev (pool, due,
 * aktivitet) och per fråga (hur många elever som har frågan som lucka).
 */
export async function loadCourseRelearningOverview(
  courseId: number,
  now: Date = new Date()
): Promise<CourseRelearningOverview> {
  const [answers, practice] = await Promise.all([
    prisma.answer.findMany({
      where: {
        response: { student: { courseId } },
        question: { type: "MULTIPLE_CHOICE" },
      },
      select: {
        questionId: true,
        isCorrect: true,
        response: { select: { studentId: true, createdAt: true } },
        question: {
          select: { text: true, topic: { select: { name: true } } },
        },
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
  ]);

  // Frågemetadata för luck-listan (alla poolfrågor har minst ett quiz-svar)
  const questionMeta = new Map<number, { text: string; topicName: string }>();
  for (const a of answers) {
    if (!questionMeta.has(a.questionId)) {
      questionMeta.set(a.questionId, {
        text: a.question.text,
        topicName: a.question.topic.name,
      });
    }
  }

  // Försökshistorik per elev
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

  // Övningsaktivitet per elev (bara PracticeAttempt, inte skarpa quiz)
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const activityByStudent = new Map<
    number,
    { attempts7d: number; lastPractice: Date | null }
  >();
  for (const p of practice) {
    const act = activityByStudent.get(p.studentId) ?? {
      attempts7d: 0,
      lastPractice: null,
    };
    if (p.createdAt >= weekAgo) act.attempts7d++;
    if (act.lastPractice === null || p.createdAt > act.lastPractice) {
      act.lastPractice = p.createdAt;
    }
    activityByStudent.set(p.studentId, act);
  }

  const byStudent = new Map<number, StudentPracticeOverview>();
  const gapCounters = new Map<
    number,
    { studentsInLearning: number; studentsDue: number }
  >();
  const totals = {
    due: 0,
    learning: 0,
    graduated: 0,
    activePractitioners7d: 0,
    attempts7d: 0,
  };

  for (const [studentId, records] of attemptsByStudent) {
    const states = buildRelearningStates(records, now);
    const summary = summarizeStates(states);
    const activity = activityByStudent.get(studentId) ?? {
      attempts7d: 0,
      lastPractice: null,
    };

    byStudent.set(studentId, {
      studentId,
      due: summary.due,
      learning: summary.learning,
      graduated: summary.graduated,
      attempts7d: activity.attempts7d,
      lastPractice: activity.lastPractice,
    });

    totals.due += summary.due;
    totals.learning += summary.learning;
    totals.graduated += summary.graduated;
    totals.attempts7d += activity.attempts7d;
    if (activity.attempts7d > 0) totals.activePractitioners7d++;

    for (const s of states.values()) {
      if (s.mastered) continue;
      const counter = gapCounters.get(s.questionId) ?? {
        studentsInLearning: 0,
        studentsDue: 0,
      };
      counter.studentsInLearning++;
      if (s.isDue) counter.studentsDue++;
      gapCounters.set(s.questionId, counter);
    }
  }

  const questionGaps: QuestionGapOverview[] = Array.from(gapCounters.entries())
    .map(([questionId, c]) => ({
      questionId,
      text: questionMeta.get(questionId)?.text ?? `Fråga ${questionId}`,
      topicName: questionMeta.get(questionId)?.topicName ?? "",
      studentsInLearning: c.studentsInLearning,
      studentsDue: c.studentsDue,
    }))
    .sort(
      (a, b) =>
        b.studentsInLearning - a.studentsInLearning ||
        a.text.localeCompare(b.text, "sv")
    );

  return { byStudent, questionGaps, totals };
}
