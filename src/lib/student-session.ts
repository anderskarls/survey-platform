import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

function getSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET environment variable is required");
  }
  return new TextEncoder().encode(secret);
}

const COOKIE_NAME = "student-session";

interface StudentSession {
  studentId: number;
  studentNumber: number;
  courseId: number;
  /**
   * Satt när läraren gled in i elevvyn från adminvyn i stället för att logga
   * in med elevlösenord. Styr bara vad elevvyn visar (banner + vägen tillbaka)
   * - sessionen i övrigt är en vanlig elevsession, för det är hela poängen.
   */
  impersonated?: boolean;
}

export async function createStudentSession(session: StudentSession): Promise<string> {
  const token = await new SignJWT(session as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("30d")
    .sign(getSecret());
  return token;
}

export async function getStudentSession(): Promise<StudentSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, getSecret());
    return {
      studentId: payload.studentId as number,
      studentNumber: payload.studentNumber as number,
      courseId: payload.courseId as number,
      impersonated: payload.impersonated === true,
    };
  } catch {
    return null;
  }
}

export { COOKIE_NAME };
