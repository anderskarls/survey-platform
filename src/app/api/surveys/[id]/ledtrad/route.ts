import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { getStudentSession } from "@/lib/student-session";
import { handleApiError } from "@/lib/api-helpers";
import { isReleased } from "@/lib/survey-release";
import { rateLimit } from "@/lib/rate-limit";
import { ledtradSchema } from "@/lib/validators";
import { hamtaLedtrad, LedtradFel, MAX_RUNG, nastaRung, type LedtradKind } from "@/lib/ledtrad";
import { kanFaLedtrad } from "@/lib/ledtrad-sparr";
import { skapaLedtradKlient } from "@/lib/ledtrad-klient";

/** Ett anrop tar 3-6 s; ett omförsök efter efterfiltret får plats. */
export const maxDuration = 30;

/**
 * En ledtråd till en elev som läraren slagit på stödet för. Spärrarna ligger i
 * ledtrad-sparr.ts, anropet och reglerna i ledtrad.ts. Historiken läses här ur
 * databasen - klientens version används aldrig. Diagnosen sparas för läraren
 * och lämnar aldrig servern.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const surveyId = Number(id);
    if (isNaN(surveyId)) {
      return NextResponse.json({ error: "Ogiltigt enkät-ID" }, { status: 400 });
    }

    const session = await getStudentSession();
    if (!session) {
      return NextResponse.json({ error: "Ej inloggad" }, { status: 401 });
    }

    const { questionId, utkast } = ledtradSchema.parse(await request.json());

    const [survey, sq, student, inlamningar, tidigare] = await Promise.all([
      prisma.survey.findUnique({
        where: { id: surveyId },
        select: { mode: true, lockMode: true, courseId: true, openAt: true },
      }),
      prisma.surveyQuestion.findFirst({
        where: { surveyId, questionId },
        select: { question: { select: { text: true, type: true, hintBasis: true } } },
      }),
      // Färskt ur databasen, inte ur sessionen: stänger läraren av stödet
      // gäller det från nästa klick.
      prisma.student.findUnique({ where: { id: session.studentId }, select: { hintsEnabled: true } }),
      prisma.response.count({ where: { surveyId, studentId: session.studentId } }),
      prisma.hintRequest.findMany({
        where: { surveyId, questionId, studentId: session.studentId },
        select: { kind: true, rung: true, hint: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      }),
    ]);

    if (!survey) {
      return NextResponse.json({ error: "Uppgiften finns inte." }, { status: 404 });
    }

    const historik = tidigare.map((t) => ({ ...t, kind: t.kind as LedtradKind }));
    const sparr = kanFaLedtrad({
      survey: { ...survey, slappt: isReleased(survey) },
      sessionCourseId: session.courseId,
      hintsEnabled: student?.hintsEnabled ?? false,
      fraga: { type: sq?.question.type ?? "", iSurvey: sq !== null, hintBasis: sq?.question.hintBasis ?? null },
      inlamnad: inlamningar > 0,
      tidigare: historik,
      nu: new Date(),
    });
    if (!sparr.ok) {
      return NextResponse.json(
        { error: sparr.meddelande, kod: sparr.kod, sekunderKvar: sparr.sekunderKvar },
        { status: sparr.status }
      );
    }

    // Taket i databasen ovan är den hårda gränsen; rateLimit släpper igenom
    // om den själv fallerar. Den globala spärren skyddar krediterna.
    const [perElev, alla] = await Promise.all([
      rateLimit(`ledtrad:${session.studentId}`, { maxRequests: 10, windowMs: 10 * 60_000 }),
      rateLimit("ledtrad:alla", { maxRequests: 400, windowMs: 24 * 60 * 60_000 }),
    ]);
    if (!perElev.allowed || !alla.allowed) {
      return NextResponse.json(
        { error: "Ledtrådarna har pausats en stund. Skriv vidare så länge.", kod: "paus" },
        { status: 429 }
      );
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: "Ledtrådar är inte tillgängliga just nu.", kod: "ingen-nyckel" }, { status: 503 });
    }

    const { underlag } = sparr;
    let resultat;
    try {
      resultat = await hamtaLedtrad(
        {
          fraga: sq!.question.text,
          facit: underlag.facit,
          kriterier: underlag.kriterier,
          kalla: underlag.kalla,
          graf: underlag.graf,
          utkast,
          tidigare: historik,
        },
        skapaLedtradKlient()
      );
    } catch (e) {
      const timeout = e instanceof Anthropic.APIConnectionTimeoutError;
      console.error("ledtrad", surveyId, questionId, e instanceof LedtradFel ? e.orsak : e);
      return NextResponse.json(
        { error: timeout ? "Det tog för lång tid. Försök igen om en stund." : "Det gick inte att ta fram en ledtråd just nu. Försök igen om en stund.", kod: "fel" },
        { status: timeout ? 504 : 502 }
      );
    }

    const { svar } = resultat;
    await prisma.hintRequest.create({
      data: {
        studentId: session.studentId,
        surveyId,
        questionId,
        kind: svar.kind,
        rung: svar.rung,
        hint: svar.hint,
        diagnosis: svar.diagnosis,
        model: resultat.model,
        inputTokens: resultat.usage.inputTokens + resultat.usage.cacheWriteTokens,
        outputTokens: resultat.usage.outputTokens,
        cacheReadTokens: resultat.usage.cacheReadTokens,
        latencyMs: resultat.latencyMs,
        impersonated: session.impersonated === true,
      },
    });

    const nasta = nastaRung([...historik, { kind: svar.kind, rung: svar.rung, hint: svar.hint }]);
    return NextResponse.json({
      kind: svar.kind,
      rung: svar.rung,
      hint: svar.hint,
      kvar: nasta === null ? 0 : MAX_RUNG - nasta + 1,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
