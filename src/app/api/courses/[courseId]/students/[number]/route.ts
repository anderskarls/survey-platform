import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-auth";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ courseId: string; number: string }> }
) {
  const authError = await requireAdmin();
  if (authError) return authError;

  const { courseId, number } = await params;
  const cId = Number(courseId);
  const studentNumber = Number(number);
  if (isNaN(cId) || isNaN(studentNumber)) {
    return NextResponse.json({ error: "Ogiltigt ID" }, { status: 400 });
  }

  const student = await prisma.student.findUnique({
    where: { courseId_number: { courseId: cId, number: studentNumber } },
  });

  if (!student) {
    return NextResponse.json({ error: "Eleven hittades inte" }, { status: 404 });
  }

  const responses = await prisma.response.findMany({
    where: { studentId: student.id },
    include: {
      survey: { select: { id: true, title: true, mode: true } },
      answers: {
        include: {
          question: { select: { id: true, text: true, type: true } },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const surveys = responses.map((r) => {
    const correctCount = r.answers.filter((a) => a.isCorrect === true).length;
    const totalQuestions = r.answers.length;
    return {
      surveyId: r.survey.id,
      surveyTitle: r.survey.title,
      mode: r.survey.mode,
      respondedAt: r.createdAt,
      score: r.survey.mode === "QUIZ" ? { correct: correctCount, total: totalQuestions } : null,
      answers: r.answers.map((a) => ({
        questionId: a.question.id,
        questionText: a.question.text,
        questionType: a.question.type,
        value: a.value,
        isCorrect: a.isCorrect,
        feedback: a.feedback,
      })),
    };
  });

  // Förmågeträning: aggregerad övningsaktivitet (för Elevlägesbildens brygga).
  // Sammanfattning per delfärdighet + per ISO-vecka - aldrig svarstexterna.
  const attempts = await prisma.practiceAttempt.findMany({
    where: { studentId: student.id },
    select: {
      isCorrect: true,
      value: true,
      createdAt: true,
      question: { select: { subskill: true, topic: { select: { name: true } } } },
    },
    orderBy: { createdAt: "asc" },
  });

  const isoWeek = (d: Date) => {
    const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
    const week = Math.ceil(((t.getTime() - Date.UTC(t.getUTCFullYear(), 0, 1)) / 86400000 + 1) / 7);
    return `${t.getUTCFullYear()}-v${String(week).padStart(2, "0")}`;
  };

  const bySubskill: Record<
    string,
    { attempts: number; correct: number; incorrect: number; unsure: number; lastAttemptAt: string }
  > = {};
  const byWeek: Record<string, { attempts: number; correct: number }> = {};
  for (const a of attempts) {
    const key = a.question.subskill ?? a.question.topic.name;
    const s = (bySubskill[key] ??= { attempts: 0, correct: 0, incorrect: 0, unsure: 0, lastAttemptAt: "" });
    s.attempts++;
    if (a.value === "__UNSURE__") s.unsure++;
    else if (a.isCorrect === true) s.correct++;
    else if (a.isCorrect === false) s.incorrect++;
    s.lastAttemptAt = a.createdAt.toISOString();
    const w = (byWeek[isoWeek(a.createdAt)] ??= { attempts: 0, correct: 0 });
    w.attempts++;
    if (a.isCorrect === true) w.correct++;
  }

  const practice = {
    totalAttempts: attempts.length,
    lastAttemptAt: attempts.length ? attempts[attempts.length - 1].createdAt.toISOString() : null,
    bySubskill,
    byWeek,
  };

  return NextResponse.json({ studentNumber, username: student.username, surveys, practice });
}
