import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createStudentsSchema } from "@/lib/validators";
import { handleApiError } from "@/lib/api-helpers";
import { requireAdmin } from "@/lib/require-auth";
import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";
import { randomInt } from "node:crypto";

function generatePassword(): string {
  // 8 chars, alphanumeric, easy to read (no ambiguous chars)
  const chars = "abcdefghjkmnpqrstuvwxyz23456789";
  let pw = "";
  for (let i = 0; i < 8; i++) {
    pw += chars[randomInt(0, chars.length)];
  }
  return pw;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ courseId: string }> }
) {
  const authError = await requireAdmin();
  if (authError) return authError;

  const { courseId } = await params;
  const cId = Number(courseId);
  if (isNaN(cId)) {
    return NextResponse.json({ error: "Ogiltigt kurs-ID" }, { status: 400 });
  }

  const students = await prisma.student.findMany({
    where: { courseId: cId },
    include: { _count: { select: { responses: true } } },
    orderBy: { number: "asc" },
  });

  // Länkade konton i andra kurser (samma personKey = samma fysiska elev)
  const personKeys = students
    .map((s) => s.personKey)
    .filter((k): k is string => k !== null);
  const siblings =
    personKeys.length > 0
      ? await prisma.student.findMany({
          where: { personKey: { in: personKeys }, courseId: { not: cId } },
          select: {
            personKey: true,
            course: { select: { name: true } },
          },
        })
      : [];
  const linkedCoursesByKey = new Map<string, string[]>();
  for (const sib of siblings) {
    if (sib.personKey === null) continue;
    const list = linkedCoursesByKey.get(sib.personKey) ?? [];
    list.push(sib.course.name);
    linkedCoursesByKey.set(sib.personKey, list);
  }

  return NextResponse.json(
    students.map((s) => ({
      id: s.id,
      number: s.number,
      username: s.username,
      responseCount: s._count.responses,
      linkedCourses: s.personKey
        ? (linkedCoursesByKey.get(s.personKey) ?? [])
        : [],
    }))
  );
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ courseId: string }> }
) {
  const authError = await requireAdmin();
  if (authError) return authError;

  try {
    const { courseId } = await params;
    const cId = Number(courseId);
    if (isNaN(cId)) {
      return NextResponse.json({ error: "Ogiltigt kurs-ID" }, { status: 400 });
    }

    // Get course code for username generation
    const course = await prisma.course.findUnique({ where: { id: cId } });
    if (!course) {
      return NextResponse.json({ error: "Kursen hittades inte" }, { status: 404 });
    }

    const body = await request.json();
    const parsed = createStudentsSchema.parse(body);

    // Valfri länkning: samma elevnummer i annan kurs = samma fysiska elev
    const linkCourseId = parsed.linkCourseId;
    if (linkCourseId !== undefined) {
      if (linkCourseId === cId) {
        return NextResponse.json(
          { error: "En kurs kan inte länkas mot sig själv" },
          { status: 400 }
        );
      }
      const linkCourse = await prisma.course.findUnique({
        where: { id: linkCourseId },
      });
      if (!linkCourse) {
        return NextResponse.json(
          { error: "Kursen att länka mot hittades inte" },
          { status: 404 }
        );
      }
    }

    // Support single number or array of numbers
    const numbers: number[] =
      "numbers" in parsed
        ? parsed.numbers
        : "count" in parsed
          ? Array.from({ length: parsed.count }, (_, i) => i + 1)
          : [parsed.number];

    // Get existing student numbers to skip duplicates
    const existing = await prisma.student.findMany({
      where: { courseId: cId, number: { in: numbers } },
      select: { number: true },
    });
    const existingSet = new Set(existing.map((s) => s.number));
    const toCreate = numbers.filter((n) => !existingSet.has(n));

    if (toCreate.length === 0) {
      return NextResponse.json({ created: 0, credentials: [] }, { status: 201 });
    }

    // Generate credentials
    const credentials = toCreate.map((number) => {
      const password = generatePassword();
      const username = `${course.code.toLowerCase()}-${number}`;
      return { number, username, password };
    });

    // Check for username collisions and add suffix if needed
    const usernames = credentials.map((c) => c.username);
    const existingUsernames = await prisma.student.findMany({
      where: { username: { in: usernames } },
      select: { username: true },
    });
    const existingUsernameSet = new Set(existingUsernames.map((s) => s.username));

    for (const cred of credentials) {
      if (existingUsernameSet.has(cred.username)) {
        cred.username = `${cred.username}-${nanoid(4)}`;
      }
    }

    // Länkning: para nya konton med samma elevnummer i länk-kursen via personKey
    const personKeyByNumber = new Map<number, string>();
    const linkUpdates: { id: number; personKey: string }[] = [];
    if (linkCourseId !== undefined) {
      const linkStudents = await prisma.student.findMany({
        where: { courseId: linkCourseId, number: { in: toCreate } },
        select: { id: true, number: true, personKey: true },
      });
      for (const ls of linkStudents) {
        const key = ls.personKey ?? nanoid(12);
        personKeyByNumber.set(ls.number, key);
        if (ls.personKey === null) {
          linkUpdates.push({ id: ls.id, personKey: key });
        }
      }
    }

    // Hash passwords
    const hashedData = await Promise.all(
      credentials.map(async (c) => ({
        number: c.number,
        username: c.username,
        passwordHash: await bcrypt.hash(c.password, 12),
        courseId: cId,
        personKey: personKeyByNumber.get(c.number) ?? null,
      }))
    );

    await prisma.$transaction([
      ...linkUpdates.map((u) =>
        prisma.student.update({
          where: { id: u.id },
          data: { personKey: u.personKey },
        })
      ),
      prisma.student.createMany({ data: hashedData }),
    ]);

    return NextResponse.json(
      {
        created: toCreate.length,
        linked: personKeyByNumber.size,
        credentials: credentials.map((c) => ({
          number: c.number,
          username: c.username,
          password: c.password,
        })),
      },
      { status: 201 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
