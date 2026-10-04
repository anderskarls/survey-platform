import { NextResponse } from "next/server";
import { randomInt } from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handleApiError } from "@/lib/api-helpers";
import { requireCourseAccess } from "@/lib/require-auth";
import { hamtaSpelForKurs } from "@/lib/tidslinjespel-db";
import { MIN_URVAL, genereraRunda, urval } from "@/lib/tidslinjespel";

const skapaSchema = z
  .object({
    slug: z.string().min(1).max(80),
    unitId: z.number().int().positive().nullable(),
    title: z.string().trim().min(1).max(120),
    fran: z.number().int().min(-20000).max(5000),
    till: z.number().int().min(-20000).max(5000),
    excluded: z.array(z.string().max(300)).max(1000).default([]),
  })
  .refine((d) => d.till > d.fran, { message: "Till-året måste vara efter från-året" });

/**
 * Skapar en omgång ur ett tidsspann. Uppgifterna lottas här, en gång, och
 * sparas med omgången - alla elever får samma. Omgången skapas dold; den
 * släpps med PATCH (action "slapp").
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ courseId: string }> }
) {
  const authError = await requireCourseAccess(params);
  if (authError) return authError;

  try {
    const courseId = Number((await params).courseId);
    const body = skapaSchema.parse(await request.json());

    const spel = await hamtaSpelForKurs(body.slug, courseId);
    if (!spel) {
      return NextResponse.json({ error: "Spelet är inte kopplat till kursen" }, { status: 404 });
    }
    if (body.unitId !== null) {
      const unit = await prisma.unit.findUnique({ where: { id: body.unitId }, select: { courseId: true } });
      if (!unit || unit.courseId !== courseId) {
        return NextResponse.json({ error: "Momentet hör inte till kursen" }, { status: 400 });
      }
    }

    const mal = urval(spel.data, body.fran, body.till, body.excluded);
    if (mal.length < MIN_URVAL) {
      return NextResponse.json(
        { error: `Urvalet har ${mal.length} händelser - det behövs minst ${MIN_URVAL}.` },
        { status: 400 }
      );
    }

    const seed = randomInt(0, 2 ** 31 - 1);
    const items = genereraRunda(spel.data, seed, {
      mal,
      fonster: { fran: body.fran, till: body.till },
    });
    const omgang = await prisma.timelineGameRelease.create({
      data: {
        gameId: spel.id,
        courseId,
        unitId: body.unitId,
        title: body.title,
        fran: body.fran,
        till: body.till,
        excluded: body.excluded,
        seed,
        items,
      },
      select: { id: true },
    });
    return NextResponse.json({ id: omgang.id }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
