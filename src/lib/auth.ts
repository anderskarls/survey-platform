import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";
import { rateLimit } from "./rate-limit";
import { getClientIp } from "./client-ip";

const BCRYPT_ROUNDS = 12;

/**
 * Adminkontot är ett enda konto med ett lösenord - utan bromsning kan det
 * gissas obegränsat. Tio försök per tio minuter räcker gott för en lärare
 * som slarvar med lösenordet, men gör uttömmande gissning meningslös.
 */
const ADMIN_LOGIN_FORSOK = 10;
const ADMIN_LOGIN_FONSTER_MS = 10 * 60_000;

/** Signalerar 429 till inloggningsformuläret via `result.code`. */
class ForManyInloggningsforsok extends CredentialsSignin {
  code = "rate_limit";
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

function isLegacySha256(hash: string): boolean {
  return /^[a-f0-9]{64}$/i.test(hash);
}

async function sha256Hex(password: string): Promise<string> {
  const data = new TextEncoder().encode(password);
  const buffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function verifyPassword(
  password: string,
  storedHash: string
): Promise<boolean> {
  // Support legacy SHA-256 hashes (64 hex chars). Callers should upgrade them
  // to bcrypt on first successful login.
  if (isLegacySha256(storedHash)) {
    return (await sha256Hex(password)) === storedHash;
  }
  return bcrypt.compare(password, storedHash);
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email" },
        password: { label: "Lösenord", type: "password" },
      },
      async authorize(credentials, request) {
        if (!credentials?.email || !credentials?.password) return null;

        // Två axlar: IP kan spoofas, e-postadressen kan den som gissar inte
        // byta bort - båda måste ha kvot kvar.
        const ip = getClientIp(request.headers);
        const email = (credentials.email as string).toLowerCase();
        for (const key of [`admin-login-ip:${ip}`, `admin-login-user:${email}`]) {
          const { allowed } = await rateLimit(key, {
            maxRequests: ADMIN_LOGIN_FORSOK,
            windowMs: ADMIN_LOGIN_FONSTER_MS,
          });
          if (!allowed) throw new ForManyInloggningsforsok();
        }

        const admin = await prisma.admin.findUnique({
          where: { email: credentials.email as string },
        });

        if (
          !admin ||
          !(await verifyPassword(
            credentials.password as string,
            admin.passwordHash
          ))
        ) {
          return null;
        }

        // Upgrade legacy SHA-256 hashes to bcrypt on successful login
        if (isLegacySha256(admin.passwordHash)) {
          await prisma.admin.update({
            where: { id: admin.id },
            data: { passwordHash: await hashPassword(credentials.password as string) },
          });
        }

        return {
          id: String(admin.id),
          email: admin.email,
          name: admin.name,
        };
      },
    }),
  ],
  pages: {
    signIn: "/admin/login",
  },
  session: {
    strategy: "jwt",
  },
});
