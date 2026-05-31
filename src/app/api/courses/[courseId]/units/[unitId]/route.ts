import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-auth";

interface LessonPatch {
  n: number;
  title: string;
  note?: string;
  date?: string;
  week?: string;
}

// Keep only valid lesson entries; preserve title/note, accept ISO date + free week label.
function cleanLesson(raw: unknown): LessonPatch | null {
  if (!raw || typeof raw !== "object") return null;
  const l = raw as Record<string, unknown>;
  const n = Number(l.n);
  const title = typeof l.title === "string" ? l.title : "";
  if (!Number.isFinite(n) || !title) return null;
  const out: LessonPatch = { n, title };
  if (typeof l.note === "string" && l.note.trim()) out.note = l.note.trim();
  if (typeof l.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(l.date)) out.date = l.date;
  if (typeof l.week === "string" && l.week.trim()) out.week = l.week.trim();
  return out;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ courseId: string; unitId: string }> }
) {
  const authError = await requireAdmin();
  if (authError) return authError;

  const { courseId, unitId } = await params;
  const cId = Number(courseId);
  const uId = Number(unitId);
  if (isNaN(cId) || isNaN(uId)) {
    return NextResponse.json({ error: "Ogiltigt ID" }, { status: 400 });
  }

  const unit = await prisma.unit.findUnique({ where: { id: uId } });
  if (!unit || unit.courseId !== cId) {
    return NextResponse.json({ error: "Momentet hittades inte" }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ogiltig JSON" }, { status: 400 });
  }

  const period =
    typeof body.period === "string" && body.period.trim() ? body.period.trim() : null;
  const goals = Array.isArray(body.goals)
    ? body.goals.map((g) => String(g).trim()).filter(Boolean)
    : [];
  const lessons = Array.isArray(body.lessons)
    ? body.lessons.map(cleanLesson).filter((l): l is LessonPatch => l !== null).sort((a, b) => a.n - b.n)
    : [];

  await prisma.unit.update({
    where: { id: uId },
    data: { period, goals, lessons: lessons as unknown as Prisma.InputJsonValue },
  });

  return NextResponse.json({ ok: true });
}
