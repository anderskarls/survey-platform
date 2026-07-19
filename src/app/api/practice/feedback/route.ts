import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-auth";
import { handleApiError } from "@/lib/api-helpers";
import { submitPracticeFeedbackSchema } from "@/lib/validators";
import {
  FEEDBACK_REGLER,
  KVALITETSSPRANG,
  SUBSKILL_CRITERIA,
  Subskill,
} from "@/lib/formaga";

const TRIVIAL_VALUES = new Set(["?", ".", "!", "1", "-", ".."]);

// Feedback på förmågeövningarnas fritextsvar genereras INTE av servern -
// den skrivs via lärarens CLI-flöde, samma mönster som enkätfeedbacken
// (feedback/pending + submit). Pending-svaret bär delfärdighetens
// kvalitetskriterier och feedbackreglerna så att den som genererar alltid
// har promptunderlaget. Ingen elevidentitet exponeras - försöks-ID räcker
// för att lämna feedback.
export async function GET(request: NextRequest) {
  const authError = await requireAdmin();
  if (authError) return authError;

  try {
    const { searchParams } = request.nextUrl;
    const courseIdParam = searchParams.get("courseId");
    let courseId: number | undefined;
    if (courseIdParam !== null) {
      courseId = Number(courseIdParam);
      if (isNaN(courseId)) {
        return NextResponse.json(
          { error: "Ogiltigt kurs-ID" },
          { status: 400 }
        );
      }
    }

    const attempts = await prisma.practiceAttempt.findMany({
      where: {
        aiFeedback: null,
        question: {
          type: "FREE_TEXT",
          subskill: { not: null },
          ...(courseId !== undefined ? { topic: { courseId } } : {}),
        },
      },
      select: {
        id: true,
        value: true,
        createdAt: true,
        questionId: true,
        question: {
          select: {
            text: true,
            subskill: true,
            topic: {
              select: { name: true, course: { select: { name: true } } },
            },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    const substantial = attempts.filter(
      (a) =>
        a.value !== "__UNSURE__" &&
        a.value.trim().length > 2 &&
        !TRIVIAL_VALUES.has(a.value.trim())
    );

    const byQuestion = new Map<
      number,
      {
        question_id: number;
        question_text: string;
        subskill: string;
        topic: string;
        course: string;
        kriterier: (typeof SUBSKILL_CRITERIA)[Subskill] | null;
        attempts: { attempt_id: number; value: string; submitted_at: Date }[];
      }
    >();
    for (const a of substantial) {
      const entry = byQuestion.get(a.questionId) ?? {
        question_id: a.questionId,
        question_text: a.question.text,
        subskill: a.question.subskill ?? "",
        topic: a.question.topic.name,
        course: a.question.topic.course.name,
        kriterier:
          SUBSKILL_CRITERIA[a.question.subskill as Subskill] ?? null,
        attempts: [],
      };
      entry.attempts.push({
        attempt_id: a.id,
        value: a.value,
        submitted_at: a.createdAt,
      });
      byQuestion.set(a.questionId, entry);
    }

    const questions = Array.from(byQuestion.values()).map((q) => ({
      ...q,
      pending_count: q.attempts.length,
    }));

    return NextResponse.json({
      total_pending: substantial.length,
      regler: FEEDBACK_REGLER,
      kvalitetssprang: KVALITETSSPRANG,
      questions,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

// Skriver feedback per försöks-ID. Bara försök på förmåga-fritextfrågor
// accepteras; övriga räknas som skipped. Omskrivning är tillåten
// (idempotent re-submit av samma batch).
export async function POST(request: NextRequest) {
  const authError = await requireAdmin();
  if (authError) return authError;

  try {
    const body = await request.json();
    const { feedbacks } = submitPracticeFeedbackSchema.parse(body);

    const ids = feedbacks.map((f) => f.attempt_id);
    const attempts = await prisma.practiceAttempt.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        question: { select: { type: true, subskill: true } },
      },
    });
    const eligible = new Set(
      attempts
        .filter(
          (a) => a.question.type === "FREE_TEXT" && a.question.subskill !== null
        )
        .map((a) => a.id)
    );

    let updated = 0;
    let skipped = 0;
    for (const item of feedbacks) {
      if (!eligible.has(item.attempt_id)) {
        skipped++;
        continue;
      }
      await prisma.practiceAttempt.update({
        where: { id: item.attempt_id },
        data: { aiFeedback: item.feedback },
      });
      updated++;
    }

    return NextResponse.json({
      success: true,
      updated,
      skipped,
      message: `Feedback sparad för ${updated} försök${
        skipped > 0 ? `, ${skipped} hoppade över (fel typ eller okänt ID)` : ""
      }`,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
