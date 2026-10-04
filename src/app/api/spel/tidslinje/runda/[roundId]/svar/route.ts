import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handleApiError } from "@/lib/api-helpers";
import { getStudentSession } from "@/lib/student-session";
import { beskrivTimelineResultat } from "@/lib/tidslinje";
import { lasRunda, rattaItem, spelSvarSchema } from "@/lib/tidslinjespel";

const bodySchema = z.object({
  index: z.number().int().min(0).max(50),
  svar: spelSvarSchema,
});

// Svar på en uppgift. Uppgifterna besvaras i tur och ordning - index måste
// vara nästa obesvarade - och skrivningen är villkorad på `answered`, så att
// ett dubbelklick eller två flikar inte kan räkna samma uppgift två gånger.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ roundId: string }> }
) {
  try {
    const session = await getStudentSession();
    if (!session) {
      return NextResponse.json({ error: "Du måste vara inloggad för att spela." }, { status: 401 });
    }
    const { roundId } = await params;
    const id = Number(roundId);
    if (!Number.isInteger(id)) {
      return NextResponse.json({ error: "Ogiltig omgång" }, { status: 400 });
    }
    const { index, svar } = bodySchema.parse(await request.json());

    const runda = await prisma.timelineGameRound.findUnique({ where: { id } });
    if (!runda || runda.studentId !== session.studentId) {
      return NextResponse.json({ error: "Omgången hittades inte" }, { status: 404 });
    }
    if (runda.finishedAt || index !== runda.answered) {
      return NextResponse.json({ error: "Uppgiften är redan besvarad" }, { status: 409 });
    }

    const items = lasRunda(runda.items);
    const item = items[index];
    if (!item) {
      return NextResponse.json({ error: "Uppgiften finns inte" }, { status: 400 });
    }
    const rattning = rattaItem(item, svar);
    if (!rattning) {
      return NextResponse.json({ error: "Svaret passar inte uppgiften" }, { status: 400 });
    }

    items[index] = { ...item, svar, poang: rattning.poang, utfall: rattning.utfall };
    const klar = index === items.length - 1;
    const uppdaterad = await prisma.timelineGameRound.updateMany({
      where: { id, answered: index, finishedAt: null },
      data: {
        items,
        answered: index + 1,
        score: { increment: rattning.poang },
        correctCount: { increment: rattning.utfall === "ratt" ? 1 : 0 },
        ...(klar ? { finishedAt: new Date() } : {}),
      },
    });
    if (uppdaterad.count === 0) {
      return NextResponse.json({ error: "Uppgiften är redan besvarad" }, { status: 409 });
    }

    return NextResponse.json({
      poang: rattning.poang,
      utfall: rattning.utfall,
      result: rattning.result,
      visning: rattning.visning,
      text: rattning.utfall === "ratt" ? null : beskrivTimelineResultat(rattning.result),
      score: runda.score + rattning.poang,
      klar,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
