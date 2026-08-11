import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createStudentSession, COOKIE_NAME } from "@/lib/student-session";
import { studentLoginSchema } from "@/lib/validators";
import { handleApiError } from "@/lib/api-helpers";
import { checkRateLimit, recordFailure, resetRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/client-ip";
import bcrypt from "bcryptjs";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { username, password } = studentLoginSchema.parse(body);

    // Rate limit by IP AND by username - 10 *misslyckade* försök per minut på
    // varje axel. Två axlar så att IP-spoofing inte låter en angripare
    // brute-force:a ett enskilt användarnamn, och en delad IP inte låser ute
    // alla. Bara misslyckade försök kostar kvot: en hel klass loggar in från
    // skolans enda utgående IP vid lektionsstart, och de eleverna har gjort
    // rätt.
    const ip = getClientIp(request.headers);
    const limitKeys = [
      `student-login-ip:${ip}`,
      `student-login-user:${username}`,
    ];
    for (const key of limitKeys) {
      const { allowed, retryAfterMs } = await checkRateLimit(key, { maxRequests: 10 });
      if (!allowed) {
        return NextResponse.json(
          { error: "För många inloggningsförsök. Försök igen senare." },
          {
            status: 429,
            headers: { "Retry-After": String(Math.ceil(retryAfterMs / 1000)) },
          }
        );
      }
    }

    const student = await prisma.student.findUnique({
      where: { username },
      include: { course: true },
    });

    if (!student || !(await bcrypt.compare(password, student.passwordHash))) {
      for (const key of limitKeys) {
        await recordFailure(key, { windowMs: 60_000 });
      }
      return NextResponse.json(
        { error: "Ogiltigt användarnamn eller lösenord" },
        { status: 401 }
      );
    }

    // Rätt lösenord rensar kontots egen spärr; IP-axeln lämnas orörd så att
    // en angripare inte kan nolla den med ett konto hen redan kan.
    await resetRateLimit(`student-login-user:${username}`);

    const token = await createStudentSession({
      studentId: student.id,
      studentNumber: student.number,
      courseId: student.courseId,
    });

    const response = NextResponse.json({
      success: true,
      studentNumber: student.number,
      courseId: student.courseId,
      courseName: student.course.name,
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
