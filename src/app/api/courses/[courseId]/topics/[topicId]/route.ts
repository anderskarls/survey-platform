import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleApiError } from "@/lib/api-helpers";
import { requireCourseAccess } from "@/lib/require-auth";
import { z } from "zod";

const updateTopicSchema = z.object({
  practiceOpen: z.boolean(),
});

/**
 * Öppnar eller stänger ett topic för övning.
 *
 * Öppet topic = dess flervalsfrågor flödar in i elevernas övningspass utan
 * att först ha mötts i ett quiz, med ett dagligt tak (se relearning.ts).
 * Läraren släpper en vecka i taget så att korten hinner före veckotestet.
 *
 * Att stänga igen tar inte bort något: frågor eleven redan mött har egen
 * historik och ligger kvar i övningspoolen. Stängningen stoppar bara
 * inflödet av nya.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ courseId: string; topicId: string }> }
) {
  const authError = await requireCourseAccess(
    params as Promise<{ courseId: string }>
  );
  if (authError) return authError;

  try {
    const { courseId, topicId } = await params;
    const cId = Number(courseId);
    const tId = Number(topicId);
    if (isNaN(cId) || isNaN(tId)) {
      return NextResponse.json({ error: "Ogiltigt ID" }, { status: 400 });
    }

    const body = await request.json();
    const { practiceOpen } = updateTopicSchema.parse(body);

    // Topicet måste höra till kursen i URL:en - annars vore kursbehörigheten
    // ovan verkningslös och en lärare kunde öppna veckor i andras kurser.
    const topic = await prisma.topic.findFirst({
      where: { id: tId, courseId: cId },
      select: { id: true },
    });
    if (!topic) {
      return NextResponse.json({ error: "Hittades inte" }, { status: 404 });
    }

    const updated = await prisma.topic.update({
      where: { id: tId },
      data: { practiceOpen },
      select: { id: true, name: true, practiceOpen: true },
    });
    return NextResponse.json(updated);
  } catch (error) {
    return handleApiError(error);
  }
}
