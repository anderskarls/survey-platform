import { neon } from "@neondatabase/serverless";

const DB = process.env.DATABASE_URL!;
const sql = neon(DB);

async function main() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const newResponses = await sql`
    SELECT r.id, r."surveyId", r."studentId", r."createdAt",
           s.title as "surveyTitle", s.mode,
           s."courseId", c.name as "courseName",
           st.number as "studentNumber"
    FROM "Response" r
    JOIN "Survey" s ON s.id = r."surveyId"
    JOIN "Course" c ON c.id = s."courseId"
    JOIN "Student" st ON st.id = r."studentId"
    WHERE r."createdAt" >= ${today}
    ORDER BY r."createdAt" DESC
  `;

  if (newResponses.length === 0) {
    console.log(JSON.stringify({ newResponses: false }));
    return;
  }

  const surveyMap = new Map<number, any>();
  for (const r of newResponses) {
    if (!surveyMap.has(r.surveyId)) {
      surveyMap.set(r.surveyId, {
        surveyId: r.surveyId,
        surveyTitle: r.surveyTitle,
        mode: r.mode,
        courseId: r.courseId,
        courseName: r.courseName,
        studentNumbers: [],
      });
    }
    surveyMap.get(r.surveyId).studentNumbers.push(r.studentNumber);
  }

  console.log(
    JSON.stringify(
      {
        newResponses: true,
        count: newResponses.length,
        surveys: Array.from(surveyMap.values()),
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
