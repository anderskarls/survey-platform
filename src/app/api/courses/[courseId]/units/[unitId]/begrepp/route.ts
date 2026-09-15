import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCourseAccess } from "@/lib/require-auth";
import { handleApiError } from "@/lib/api-helpers";
import { parseBegreppsrader } from "@/lib/begreppskort";
import { sparaBegrepp, taBortBegrepp } from "@/lib/begreppskort-db";

type Params = { params: Promise<{ courseId: string; unitId: string }> };

async function loadUnit(params: Params["params"]) {
  const { courseId, unitId } = await params;
  const cId = Number(courseId);
  const uId = Number(unitId);
  if (isNaN(cId) || isNaN(uId)) return null;
  const unit = await prisma.unit.findUnique({ where: { id: uId } });
  return unit && unit.courseId === cId ? unit : null;
}

/**
 * Lägger till begrepp i momentets övning: en rad per begrepp, "Begrepp -
 * förklaring". Se sparaBegrepp för vart korten tar vägen.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const authError = await requireCourseAccess(params);
  if (authError) return authError;

  try {
    const unit = await loadUnit(params);
    if (!unit) {
      return NextResponse.json({ error: "Momentet hittades inte" }, { status: 404 });
    }

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Ogiltig JSON" }, { status: 400 });
    }
    if (typeof body.rader !== "string") {
      return NextResponse.json({ error: "rader måste vara text" }, { status: 400 });
    }

    const { rader, fel } = parseBegreppsrader(body.rader);
    if (rader.length === 0) {
      return NextResponse.json(
        {
          error: fel.length > 0 ? "Ingen rad gick att tolka" : "Skriv minst ett begrepp",
          fel,
        },
        { status: 400 }
      );
    }

    const result = await sparaBegrepp(prisma, unit, rader);
    return NextResponse.json({ ...result, fel }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

/** Tar bort ett begreppskort som ingen elev mött. Se taBortBegrepp. */
export async function DELETE(request: NextRequest, { params }: Params) {
  const authError = await requireCourseAccess(params);
  if (authError) return authError;

  try {
    const unit = await loadUnit(params);
    if (!unit) {
      return NextResponse.json({ error: "Momentet hittades inte" }, { status: 404 });
    }

    const questionId = Number(request.nextUrl.searchParams.get("questionId"));
    if (!Number.isInteger(questionId) || questionId <= 0) {
      return NextResponse.json({ error: "Ogiltigt fråge-ID" }, { status: 400 });
    }

    const utfall = await taBortBegrepp(prisma, unit, questionId);
    return utfall.ok
      ? NextResponse.json({ ok: true })
      : NextResponse.json({ error: utfall.error }, { status: utfall.status });
  } catch (error) {
    return handleApiError(error);
  }
}
