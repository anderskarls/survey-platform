// Hjälpscript för att hämta data via Neons HTTP-driver (används ej i GitHub Actions)
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

async function main() {
  const today = new Date('2026-06-12');
  today.setHours(0, 0, 0, 0);

  const newResponses = await sql`
    SELECT r.id, r."surveyId", r."studentId", r."createdAt",
           s.title as "surveyTitle", s.mode
    FROM "Response" r
    JOIN "Survey" s ON s.id = r."surveyId"
    WHERE r."createdAt" >= ${today.toISOString()}
    ORDER BY r."createdAt" DESC
  `;

  if (newResponses.length === 0) {
    console.log(JSON.stringify({ newResponses: false }));
    return;
  }

  console.log(JSON.stringify({ newResponses: true, count: newResponses.length }, null, 2));
}

main().catch((err) => {
  console.error('Fel:', err.message);
  process.exit(1);
});
