import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";
import { checkRateLimit, recordFailure, resetRateLimit } from "./rate-limit";
import { getClientIp } from "./client-ip";

const BCRYPT_ROUNDS = 12;
/** Felaktiga lösenord per lärarkonto innan spärr */
const LOGIN_MAX_FEL = 10;
const LOGIN_FONSTER_MS = 15 * 60_000;

/** Signalerar spärr till inloggningssidan via `?code=` i omdirigeringen */
class ForManga extends CredentialsSignin {
  code: string;
  constructor(minuterKvar: number) {
    super();
    this.code = `for_manga_forsok:${minuterKvar}`;
  }
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
        // byta bort - båda måste ha kvot kvar. Bara misslyckade försök kostar
        // kvot: en lärare som loggar in rätt ska aldrig räknas mot taket.
        const ip = getClientIp(request.headers);
        const email = String(credentials.email).toLowerCase();
        const limitKeys = [`admin-login-ip:${ip}`, `admin-login-user:${email}`];
        for (const key of limitKeys) {
          const sparr = await checkRateLimit(key, { maxRequests: LOGIN_MAX_FEL });
          if (!sparr.allowed) {
            console.warn(
              `[auth] Lärarinloggning spärrad efter ${LOGIN_MAX_FEL} felaktiga försök: ${email}`
            );
            // Egen kod så inloggningssidan kan säga att kontot är spärrat och
            // hur länge. Utan den ser den utelåsta läraren "fel lösenord" fast
            // lösenordet är rätt, mitt i en lektion, utan väg framåt.
            throw new ForManga(
              Math.max(1, Math.ceil(sparr.retryAfterMs / 60_000))
            );
          }
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
          // Bara misslyckade försök kostar kvot
          for (const key of limitKeys) {
            await recordFailure(key, { windowMs: LOGIN_FONSTER_MS });
          }
          return null;
        }

        // Rätt lösenord rensar kontots egen spärr; IP-axeln lämnas orörd så att
        // en angripare inte kan nolla den med ett konto hen redan kan.
        await resetRateLimit(`admin-login-user:${email}`);

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
