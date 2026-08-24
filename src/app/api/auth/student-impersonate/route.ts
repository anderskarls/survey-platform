import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createStudentSession, COOKIE_NAME } from "@/lib/student-session";
import { studentImpersonateSchema } from "@/lib/validators";
import { handleApiError } from "@/lib/api-helpers";
import { requireAdmin } from "@/lib/require-auth";
import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";
import { randomBytes } from "node:crypto";

/**
 * Låter en inloggad lärare se en kurs med elevens ögon utan elevlösenord.
 * Läraren har redan full insyn i kursen via adminvyn, så inget nytt blottas -
 * det som tillkommer är elevens vy av samma data.
 *
 * Bara provkonton (isTest) går att gå in i. En riktig elevs konto är aldrig
 * åtkomligt den här vägen: dess svar och feedback är elevens, inte lärarens
 * att agera i. Saknar kursen provkonto skapas ett, länkat via personKey till
 * lärarens övriga provkonton så att kursväxlaren i elevvyn når hela raden.
 */

// Provkontot får ett nummer långt ovanför en verklig klasslista
const TEST_STUDENT_NUMBER = 99;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { courseId } = studentImpersonateSchema.parse(body);

    // "Visa som elev" tar kursen ur bodyn, inte ur URL:en. Utan kontrollen
    // här vore knappen en genväg in i vilken kurs som helst.
    const authError = await requireAdmin(courseId);
    if (authError) return authError;

    const course = await prisma.course.findUnique({
      where: { id: courseId },
      select: { id: true, name: true, code: true },
    });
    if (!course) {
      return NextResponse.json({ error: "Kursen hittades inte" }, { status: 404 });
    }

    let student = await prisma.student.findFirst({
      where: { courseId: course.id, isTest: true },
      select: { id: true, number: true },
      orderBy: { number: "asc" },
    });

    let created = false;
    if (!student) {
      student = await createTestStudent(course);
      created = true;
    }

    const token = await createStudentSession({
      studentId: student.id,
      studentNumber: student.number,
      courseId: course.id,
      impersonated: true,
    });

    const response = NextResponse.json({
      success: true,
      studentNumber: student.number,
      courseId: course.id,
      courseName: course.name,
      created,
    });

    response.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      // Kortare än elevens 30 dagar: det här är en titt, inte en inloggning
      maxAge: 60 * 60 * 12,
      path: "/",
    });

    return response;
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * Skapar kursens provkonto. Lösenordet är slumpat och visas aldrig - vägen in
 * är den här endpointen, inte elevinloggningen.
 */
async function createTestStudent(course: { id: number; code: string }) {
  // personKey delas med lärarens övriga provkonton, annars ser kursväxlaren
  // det nya kontot som en främmande elev och når inte de andra kurserna.
  const linked = await prisma.student.findFirst({
    where: { isTest: true, personKey: { not: null } },
    select: { personKey: true },
    orderBy: { id: "asc" },
  });
  const personKey = linked?.personKey ?? nanoid(12);

  // #99 om det är ledigt, annars första lediga numret ovanför
  const taken = await prisma.student.findMany({
    where: { courseId: course.id, number: { gte: TEST_STUDENT_NUMBER } },
    select: { number: true },
  });
  const takenSet = new Set(taken.map((s) => s.number));
  let number = TEST_STUDENT_NUMBER;
  while (takenSet.has(number)) number++;

  let username = `${course.code.toLowerCase()}-${number}`;
  const collision = await prisma.student.findUnique({
    where: { username },
    select: { id: true },
  });
  if (collision) username = `${username}-${nanoid(4)}`;

  return prisma.student.create({
    data: {
      number,
      username,
      passwordHash: await bcrypt.hash(randomBytes(24).toString("base64url"), 12),
      courseId: course.id,
      personKey,
      isTest: true,
    },
    select: { id: true, number: true },
  });
}
