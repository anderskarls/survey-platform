import { NextRequest, NextResponse } from "next/server";
import { randomInt } from "crypto";
import { prisma } from "@/lib/prisma";
import { handleApiError } from "@/lib/api-helpers";
import { getStudentSession } from "@/lib/student-session";
import { rateLimit } from "@/lib/rate-limit";
import { hamtaSpelForKurs } from "@/lib/tidslinjespel-db";
import { MAX_POANG, genereraRunda, klientItem } from "@/lib/tidslinjespel";

// Ny omgång. Servern lottar uppgifterna, sparar dem med facit och skickar
// bara det klientItem() släpper igenom. Omgångar som aldrig spelas klart
// blir kvar med finishedAt null - läraren ser dem som påbörjade.
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const session = await getStudentSession();
    if (!session) {
      return NextResponse.json({ error: "Du måste vara inloggad för att spela." }, { status: 401 });
    }
    const { slug } = await params;

    // En omgång tar minuter att spela; trettio på tio minuter är någon som
    // klickar "Spela igen" utan att spela.
    const grans = await rateLimit(`tidslinjespel:${session.studentId}`, {
      maxRequests: 30,
      windowMs: 10 * 60_000,
    });
    if (!grans.allowed) {
      return NextResponse.json({ error: "Vänta en stund innan du startar en ny omgång." }, { status: 429 });
    }

    const spel = await hamtaSpelForKurs(slug, session.courseId);
    if (!spel) {
      return NextResponse.json({ error: "Spelet hittades inte" }, { status: 404 });
    }

    const seed = randomInt(0, 2 ** 31 - 1);
    const items = genereraRunda(spel.data, seed);
    const runda = await prisma.timelineGameRound.create({
      data: {
        gameId: spel.id,
        studentId: session.studentId,
        seed,
        items,
        maxScore: items.length * MAX_POANG,
      },
      select: { id: true },
    });

    return NextResponse.json({ roundId: runda.id, items: items.map(klientItem) });
  } catch (error) {
    return handleApiError(error);
  }
}
