import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { handleApiError } from "@/lib/api-helpers";
import { getStudentSession } from "@/lib/student-session";
import { MAX_POANG, klientItem, lasRunda, omgangsStatus } from "@/lib/tidslinjespel";

/**
 * Elevens försök på en lärarsläppt omgång. Ett försök per elev: finns det
 * redan ett returneras det, med de uppgifter som är besvarade, så att en
 * elev som tappade nätet eller stängde fliken fortsätter där hen var.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ releaseId: string }> }
) {
  try {
    const session = await getStudentSession();
    if (!session) {
      return NextResponse.json({ error: "Du måste vara inloggad för att spela." }, { status: 401 });
    }
    const releaseId = Number((await params).releaseId);
    if (!Number.isInteger(releaseId)) {
      return NextResponse.json({ error: "Ogiltig omgång" }, { status: 400 });
    }

    const omgang = await prisma.timelineGameRelease.findUnique({ where: { id: releaseId } });
    // En dold omgång ska se ut som en som inte finns.
    if (!omgang || omgang.courseId !== session.courseId || omgangsStatus(omgang) === "dold") {
      return NextResponse.json({ error: "Omgången hittades inte" }, { status: 404 });
    }

    const where = { releaseId_studentId: { releaseId, studentId: session.studentId } };
    let runda = await prisma.timelineGameRound.findUnique({ where });
    if (!runda) {
      if (omgangsStatus(omgang) === "stangd") {
        return NextResponse.json({ error: "Omgången är stängd." }, { status: 409 });
      }
      const items = lasRunda(omgang.items);
      try {
        runda = await prisma.timelineGameRound.create({
          data: {
            gameId: omgang.gameId,
            studentId: session.studentId,
            releaseId,
            seed: omgang.seed,
            items,
            maxScore: items.length * MAX_POANG,
          },
        });
      } catch (e) {
        // Två flikar samtidigt: den andra hittar den första flikens försök.
        if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e;
        runda = await prisma.timelineGameRound.findUniqueOrThrow({ where });
      }
    }

    const items = lasRunda(runda.items);
    return NextResponse.json({
      roundId: runda.id,
      items: items.map(klientItem),
      answered: runda.answered,
      score: runda.score,
      poang: items.slice(0, runda.answered).map((i) => i.poang ?? 0),
      klar: runda.finishedAt !== null,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
