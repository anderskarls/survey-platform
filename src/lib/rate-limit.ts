import { prisma } from "@/lib/prisma";

/**
 * Rate limiter med delad store i Postgres.
 *
 * Tidigare låg räknaren i en process-lokal Map. På Vercel är varje anrop en
 * egen funktionsinstans, så minnet nollställdes mellan försöken och gränsen
 * var i praktiken aldrig nådd - en no-op. Databasen är den enda state som
 * faktiskt delas mellan instanserna, så räknaren bor där.
 *
 * Hela fönsterlogiken ligger i ett enda INSERT ... ON CONFLICT så att två
 * samtidiga försök inte kan läsa samma värde och båda släppas igenom.
 * `NOW() AT TIME ZONE 'utc'` eftersom Prisma lagrar DateTime som timestamp
 * utan tidszon i UTC - en rak NOW() hade jämförts i serverns tidszon.
 *
 * Vid databasfel släpps anropet igenom (fail open). Endpointen bakom kräver
 * ändå databasen för att kunna logga in någon, så ett hårt nej hade bara
 * gjort ett driftavbrott värre utan att skydda något.
 */

export interface RateLimitOptions {
  /** Antal tillåtna anrop per fönster. */
  maxRequests?: number;
  /** Fönstrets längd i millisekunder. */
  windowMs?: number;
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfterMs: number;
}

interface RateLimitRow {
  count: number;
  resetAt: Date;
}

/** Andel anrop som passar på att städa bort utgångna rader. */
const STADSANNOLIKHET = 0.02;

export async function rateLimit(
  key: string,
  { maxRequests = 10, windowMs = 60_000 }: RateLimitOptions = {}
): Promise<RateLimitResult> {
  const resetAt = new Date(Date.now() + windowMs);

  try {
    const rows = await prisma.$queryRaw<RateLimitRow[]>`
      INSERT INTO "RateLimit" ("key", "count", "resetAt")
      VALUES (${key}, 1, ${resetAt})
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE
          WHEN "RateLimit"."resetAt" <= (NOW() AT TIME ZONE 'utc') THEN 1
          ELSE "RateLimit"."count" + 1
        END,
        "resetAt" = CASE
          WHEN "RateLimit"."resetAt" <= (NOW() AT TIME ZONE 'utc') THEN ${resetAt}
          ELSE "RateLimit"."resetAt"
        END
      RETURNING "count", "resetAt"
    `;

    if (Math.random() < STADSANNOLIKHET) {
      void stadaUtgangna();
    }

    const row = rows[0];
    if (!row) return { allowed: true, retryAfterMs: 0 };

    if (Number(row.count) > maxRequests) {
      return {
        allowed: false,
        retryAfterMs: Math.max(0, row.resetAt.getTime() - Date.now()),
      };
    }

    return { allowed: true, retryAfterMs: 0 };
  } catch (error) {
    console.error("[rate-limit] kunde inte läsa räknaren, släpper igenom", error);
    return { allowed: true, retryAfterMs: 0 };
  }
}

/** Rader vars fönster gick ut för länge sedan fyller bara tabellen. */
async function stadaUtgangna(): Promise<void> {
  try {
    await prisma.$executeRaw`
      DELETE FROM "RateLimit"
      WHERE "resetAt" < (NOW() AT TIME ZONE 'utc') - INTERVAL '1 hour'
    `;
  } catch {
    // Städning är opportunistisk - ett misslyckande ska aldrig störa anropet.
  }
}
