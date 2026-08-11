import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  createStudentSession,
  getStudentSession,
  COOKIE_NAME,
} from "@/lib/student-session";
import { studentSwitchSchema } from "@/lib/validators";
import { handleApiError } from "@/lib/api-helpers";

/**
 * Byter den inloggade elevens session till ett annat av hens konton.
 * En elev har en rad per kurs; personKey binder ihop raderna till samma
 * fysiska elev. Bytet kräver alltså inget nytt lösenord - det är samma
 * person som redan är autentiserad, bara en annan kurs.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getStudentSession();
    if (!session) {
      return NextResponse.json({ error: "Inte inloggad" }, { status: 401 });
    }

    const body = await request.json();
    const { courseId } = studentSwitchSchema.parse(body);

    if (courseId === session.courseId) {
      return NextResponse.json({ error: "Du är redan i den kursen" }, { status: 400 });
    }

    const current = await prisma.student.findUnique({
      where: { id: session.studentId },
      select: { personKey: true },
    });
    if (!current?.personKey) {
      return NextResponse.json(
        { error: "Kontot är inte länkat till någon annan kurs" },
        { status: 400 }
      );
    }

    // personKey + kurs identifierar målkontot. Utan träff hör kursen inte till
    // den här eleven - svara 404 i stället för att avslöja att kursen finns.
    const target = await prisma.student.findFirst({
      where: { personKey: current.personKey, courseId },
      select: { id: true, number: true, courseId: true, course: { select: { name: true } } },
    });
    if (!target) {
      return NextResponse.json(
        { error: "Du har inget konto i den kursen" },
        { status: 404 }
      );
    }

    const token = await createStudentSession({
      studentId: target.id,
      studentNumber: target.number,
      courseId: target.courseId,
    });

    const response = NextResponse.json({
      success: true,
      studentNumber: target.number,
      courseId: target.courseId,
      courseName: target.course.name,
    });

    response.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30, // 30 days
      path: "/",
    });

    return response;
  } catch (error) {
    return handleApiError(error);
  }
}
