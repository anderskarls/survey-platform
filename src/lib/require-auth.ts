import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { timingSafeEqual } from "crypto";
import { auth } from "./auth";
import { prisma } from "./prisma";
import { AdminScope, fullScope, scopeAllowsCourse, scopeIsOwner } from "./authz";

export type { AdminScope };

/**
 * Löser upp vem som gör anropet och vad hen når.
 *
 * Två vägar in, precis som förut:
 *  - `Authorization: Bearer <ADMIN_API_KEY>` (CLI och MCP) - en delad nyckel
 *    utan identitet, som därför behåller full åtkomst. Nyckeln delas inte ut
 *    till lärarkonton; kursbegränsningen gäller webbgränssnittet.
 *  - NextAuth-sessionscookie (adminwebben) - rollen och kurslistan läses ur
 *    databasen vid varje anrop, inte ur JWT:n. Ett extra anrop, men en
 *    indragen behörighet börjar gälla direkt i stället för vid nästa
 *    inloggning.
 *
 * Returnerar null när den anropande inte är autentiserad alls, och
 * `"invalid-key"` när en Bearer-nyckel presenterades men inte stämde - det
 * fallet förtjänar ett eget felmeddelande, annars felsöker CLI-användaren
 * blint mot ett generiskt 401.
 */
export type ScopeLookup = AdminScope | "invalid-key" | null;

export async function getAdminScope(): Promise<ScopeLookup> {
  const headersList = await headers();
  const authHeader = headersList.get("authorization");

  if (authHeader?.startsWith("Bearer ")) {
    const presented = authHeader.slice("Bearer ".length).trim();
    const expected = process.env.ADMIN_API_KEY;
    if (expected && constantTimeEqual(presented, expected)) {
      return fullScope(null, "API-nyckel");
    }
    return "invalid-key";
  }

  const session = await auth();
  const email = session?.user?.email;
  if (!email) return null;

  const admin = await prisma.admin.findUnique({
    where: { email },
    select: {
      id: true,
      name: true,
      role: true,
      courses: { select: { courseId: true } },
    },
  });

  // Kontot kan ha raderats medan sessionscookien lever kvar. Att slå mot
  // databasen i stället för att lita på cookien är just vad som gör att en
  // borttagen lärare tappar åtkomsten direkt.
  if (!admin) return null;

  if (admin.role === "OWNER") return fullScope(admin.id, admin.name);

  return {
    adminId: admin.id,
    name: admin.name,
    isOwner: false,
    courseIds: admin.courses.map((c) => c.courseId),
  };
}

/**
 * Behörighetskontroll för admin-API-routes.
 *
 * Utan `courseId` kontrolleras bara att anroparen är inloggad - använd det
 * bara för routes som själva filtrerar sitt svar på scopet. Har routen en
 * kurs ska den skickas med; då nekas en lärare som inte äger kursen.
 *
 * Returnerar null vid OK, annars ett felsvar att returnera direkt.
 */
export async function requireAdmin(
  courseId?: number
): Promise<NextResponse | null> {
  const result = await requireAdminScope(courseId);
  return result instanceof NextResponse ? result : null;
}

/**
 * Som `requireAdmin`, men lämnar tillbaka scopet så att routen kan filtrera
 * sitt svar. Diskriminera på `instanceof NextResponse`.
 */
export async function requireAdminScope(
  courseId?: number
): Promise<AdminScope | NextResponse> {
  const scope = await getAdminScope();
  if (scope === "invalid-key") {
    return NextResponse.json({ error: "Ogiltig API-nyckel" }, { status: 401 });
  }
  if (!scope) {
    return NextResponse.json({ error: "Ej autentiserad" }, { status: 401 });
  }
  if (courseId !== undefined && !scopeAllowsCourse(scope, courseId)) {
    return forbidden();
  }
  return scope;
}

/**
 * Behörighetskontroll för routerna under `/api/courses/[courseId]/...`.
 *
 * Tar route-params direkt i stället för ett färdigt tal, så att kontrollen
 * kan stå först i handlern - före all annan utläsning. Det är avsiktligt:
 * ligger den efter är det bara en tidsfråga innan någon lägger till en
 * databasfråga ovanför den.
 *
 * Att invänta `params` en gång till längre ner i handlern är gratis; ett
 * redan uppfyllt löfte löses om utan nytt arbete.
 */
export async function requireCourseAccess(
  params: Promise<{ courseId: string }>
): Promise<NextResponse | null> {
  const { courseId } = await params;
  const cId = Number(courseId);
  if (!Number.isInteger(cId) || cId <= 0) {
    return NextResponse.json({ error: "Ogiltigt kurs-ID" }, { status: 400 });
  }
  return requireAdmin(cId);
}

/**
 * Behörighetskontroll för de globala routerna, där kursen inte står i
 * URL:en utan måste härledas ur resursen.
 *
 * Ägaren och API-nyckeln slipper uppslaget helt - de når allt ändå, och det
 * vore ett extra databasanrop per begäran utan verkan.
 *
 * Ett saknat objekt ger samma 403 som ett otillåtet. Skillnaden vore
 * annars en orakelfunktion: prova id efter id och läs av vilka som finns.
 */
async function requireDerivedCourseAccess(
  lookup: () => Promise<number | null>
): Promise<NextResponse | null> {
  const scope = await requireAdminScope();
  if (scope instanceof NextResponse) return scope;
  if (scope.courseIds === null) return null;

  const courseId = await lookup();
  if (courseId === null || !scopeAllowsCourse(scope, courseId)) {
    return forbidden();
  }
  return null;
}

/** Når anroparen enkäten? Kursen läses ur `Survey.courseId`. */
export async function requireSurveyAccess(
  surveyId: number
): Promise<NextResponse | null> {
  return requireDerivedCourseAccess(async () => {
    if (!Number.isInteger(surveyId)) return null;
    const survey = await prisma.survey.findUnique({
      where: { id: surveyId },
      select: { courseId: true },
    });
    return survey?.courseId ?? null;
  });
}

/**
 * Når anroparen frågan? Question saknar egen `courseId` och når kursen via
 * ämnet - därför uppslaget genom `topic`.
 */
export async function requireQuestionAccess(
  questionId: number
): Promise<NextResponse | null> {
  return requireDerivedCourseAccess(async () => {
    if (!Number.isInteger(questionId)) return null;
    const question = await prisma.question.findUnique({
      where: { id: questionId },
      select: { topic: { select: { courseId: true } } },
    });
    return question?.topic.courseId ?? null;
  });
}

/** Når anroparen ämnet? */
export async function requireTopicAccess(
  topicId: number
): Promise<NextResponse | null> {
  return requireDerivedCourseAccess(async () => {
    if (!Number.isInteger(topicId)) return null;
    const topic = await prisma.topic.findUnique({
      where: { id: topicId },
      select: { courseId: true },
    });
    return topic?.courseId ?? null;
  });
}

/** Kräver ägarbehörighet: skapa och radera kurser, administrera konton. */
export async function requireOwner(): Promise<NextResponse | null> {
  const scope = await requireAdminScope();
  if (scope instanceof NextResponse) return scope;
  if (!scopeIsOwner(scope)) return forbidden();
  return null;
}

/**
 * 403 med samma text oavsett om kursen inte finns eller ligger utanför
 * behörigheten. Att skilja på fallen skulle avslöja vilka kurs-id som finns.
 */
export function forbidden(): NextResponse {
  return NextResponse.json(
    { error: "Du har inte behörighet till den här kursen" },
    { status: 403 }
  );
}

function constantTimeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}
