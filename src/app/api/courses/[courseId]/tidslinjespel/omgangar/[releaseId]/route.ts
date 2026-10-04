import { NextResponse } from "next/server";
import { randomInt } from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handleApiError } from "@/lib/api-helpers";
import { requireCourseAccess } from "@/lib/require-auth";
import { genereraRunda, tidslinjespelDataSchema, urval } from "@/lib/tidslinjespel";

type Params = { params: Promise<{ courseId: string; releaseId: string }> };

async function hamtaOmgang(params: Params["params"]) {
  const { courseId, releaseId } = await params;
  const id = Number(releaseId);
  if (!Number.isInteger(id)) return null;
  const omgang = await prisma.timelineGameRelease.findUnique({
    where: { id },
    include: { game: { select: { data: true } }, _count: { select: { rounds: true } } },
  });
  return omgang && omgang.courseId === Number(courseId) ? omgang : null;
}

const atgardSchema = z.object({
  action: z.enum(["slapp", "stang", "oppna", "lotta-om"]),
});

/**
 * slapp     släpp omgången till eleverna nu
 * stang     stäng den - påbörjade försök kan inte längre besvaras
 * oppna     öppna en stängd omgång igen
 * lotta-om  nya uppgifter ur samma urval; bara så länge ingen elev börjat
 */
export async function PATCH(request: Request, { params }: Params) {
  const authError = await requireCourseAccess(params);
  if (authError) return authError;

  try {
    const { action } = atgardSchema.parse(await request.json());
    const omgang = await hamtaOmgang(params);
    if (!omgang) return NextResponse.json({ error: "Omgången hittades inte" }, { status: 404 });

    if (action === "lotta-om") {
      if (omgang._count.rounds > 0) {
        return NextResponse.json(
          { error: "Elever har redan börjat - uppgifterna kan inte bytas." },
          { status: 409 }
        );
      }
      // Lottas ur dagens korpus; har den ändrats sedan omgången skapades
      // följer det nya urvalet med.
      const data = tidslinjespelDataSchema.parse(omgang.game.data);
      const seed = randomInt(0, 2 ** 31 - 1);
      const items = genereraRunda(data, seed, {
        mal: urval(data, omgang.fran, omgang.till, omgang.excluded),
        fonster: { fran: omgang.fran, till: omgang.till },
      });
      await prisma.timelineGameRelease.update({ where: { id: omgang.id }, data: { seed, items } });
      return NextResponse.json({ ok: true });
    }

    const nu = new Date();
    const data =
      action === "slapp"
        ? { releasedAt: omgang.releasedAt ?? nu, closedAt: null }
        : action === "stang"
          ? { closedAt: nu }
          : { closedAt: null };
    await prisma.timelineGameRelease.update({ where: { id: omgang.id }, data });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}

/** Tar bort en omgång som ingen elev har börjat på. Elevresultat raderas aldrig härifrån. */
export async function DELETE(_request: Request, { params }: Params) {
  const authError = await requireCourseAccess(params);
  if (authError) return authError;

  try {
    const omgang = await hamtaOmgang(params);
    if (!omgang) return NextResponse.json({ error: "Omgången hittades inte" }, { status: 404 });
    if (omgang._count.rounds > 0) {
      return NextResponse.json(
        { error: "Elever har spelat omgången - stäng den i stället för att ta bort den." },
        { status: 409 }
      );
    }
    await prisma.timelineGameRelease.delete({ where: { id: omgang.id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
