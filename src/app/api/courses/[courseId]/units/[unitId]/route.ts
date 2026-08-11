import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireCourseAccess } from "@/lib/require-auth";

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
  const authError = await requireCourseAccess(params);
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

  // PATCH är partiell: bara fält som faktiskt finns i kroppen rörs.
  //
  // Tidigare byggdes alltid alla tre fälten, med tom lista som default. En
  // klient som följde openapi.yaml - där inget fält är obligatoriskt - och
  // bara skickade `period` raderade därmed momentets mål och hela
  // lektionsplanen, och fick `{"ok":true}` tillbaka. Webb-UI:t skickar alltid
  // alla tre och drabbades aldrig; risken satt hos CLI:t och MCP:n.
  const data: {
    period?: string | null;
    goals?: string[];
    lessons?: Prisma.InputJsonValue;
  } = {};

  if ("period" in body) {
    if (body.period !== null && typeof body.period !== "string") {
      return NextResponse.json(
        { error: "period måste vara en sträng eller null" },
        { status: 400 }
      );
    }
    const trimmad = typeof body.period === "string" ? body.period.trim() : "";
    data.period = trimmad || null;
  }

  if ("goals" in body) {
    if (!Array.isArray(body.goals)) {
      return NextResponse.json(
        { error: "goals måste vara en lista" },
        { status: 400 }
      );
    }
    data.goals = body.goals.map((g) => String(g).trim()).filter(Boolean);
  }

  if ("lessons" in body) {
    if (!Array.isArray(body.lessons)) {
      return NextResponse.json(
        { error: "lessons måste vara en lista" },
        { status: 400 }
      );
    }
    data.lessons = body.lessons
      .map(cleanLesson)
      .filter((l): l is LessonPatch => l !== null)
      .sort((a, b) => a.n - b.n) as unknown as Prisma.InputJsonValue;
  }

  const andrade = Object.keys(data);
  if (andrade.length === 0) {
    return NextResponse.json(
      { error: "Inget att uppdatera - ange period, goals eller lessons" },
      { status: 400 }
    );
  }

  await prisma.unit.update({ where: { id: uId }, data });

  // Namnge fälten som faktiskt skrevs, så en klient ser om den tömde något
  return NextResponse.json({ ok: true, updated: andrade });
}
