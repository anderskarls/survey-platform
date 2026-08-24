import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { nanoid } from "nanoid";
import { createCourseSchema } from "@/lib/validators";
import { handleApiError } from "@/lib/api-helpers";
import { requireAdminScope, requireOwner } from "@/lib/require-auth";
import { ownCoursesWhere } from "@/lib/authz";

function generateCourseCode(): string {
  return nanoid(6).toUpperCase().replace(/[_-]/g, "X");
}

export async function GET() {
  const scope = await requireAdminScope();
  if (scope instanceof NextResponse) return scope;

  // Kurslistan är lärarens hela karta över plattformen - filtret här avgör
  // vad hen ens vet finns.
  const courses = await prisma.course.findMany({
    where: ownCoursesWhere(scope),
    include: {
      _count: { select: { topics: true, surveys: true, students: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(courses);
}

export async function POST(request: Request) {
  // Att grunda en kurs är ägarens sak. En lärare förvaltar de kurser hen
  // tilldelats - annars kunde hen skapa en kurs åt sig själv och kringgå
  // hela tilldelningen.
  const authError = await requireOwner();
  if (authError) return authError;

  try {
    const body = await request.json();
    const { name } = createCourseSchema.parse(body);
    const course = await prisma.course.create({
      data: { name, code: generateCourseCode() },
    });
    return NextResponse.json(course, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
