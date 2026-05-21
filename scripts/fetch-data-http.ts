import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

async function main() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Check for new responses today
  const newResponses = await sql`
    SELECT r.id, r.survey_id, r.student_id, r.created_at,
           s.title as survey_title, s.mode as survey_mode,
           s.course_id,
           c.name as course_name,
           st.number as student_number
    FROM "Response" r
    JOIN "Survey" s ON s.id = r.survey_id
    JOIN "Course" c ON c.id = s.course_id
    JOIN "Student" st ON st.id = r.student_id
    WHERE r.created_at >= ${today}
    ORDER BY r.created_at DESC
  `;

  if (newResponses.length === 0) {
    console.log(JSON.stringify({ newResponses: false }));
    return;
  }

  console.error(`Hittade ${newResponses.length} nya svar idag. Hämtar fullständig data...`);

  // Get unique survey IDs
  const surveyIds = [...new Set(newResponses.map((r: any) => r.survey_id))];

  // Fetch full data for each survey
  const results: any[] = [];

  for (const surveyId of surveyIds) {
    // Get survey info with questions
    const [survey] = await sql`
      SELECT s.id, s.title, s.description, s.mode, s.share_code,
             c.name as course_name, c.code as course_code
      FROM "Survey" s
      JOIN "Course" c ON c.id = s.course_id
      WHERE s.id = ${surveyId}
    `;

    // Get questions for this survey
    const questions = await sql`
      SELECT q.id, q.text, q.type, t.name as topic_name,
             sq.order as question_order
      FROM "SurveyQuestion" sq
      JOIN "Question" q ON q.id = sq.question_id
      JOIN "Topic" t ON t.id = q.topic_id
      WHERE sq.survey_id = ${surveyId}
      ORDER BY sq.order
    `;

    // Get options for multiple choice questions
    const questionIds = questions.map((q: any) => q.id);
    let options: any[] = [];
    if (questionIds.length > 0) {
      options = await sql`
        SELECT qo.id, qo.question_id, qo.text, qo.is_correct
        FROM "QuestionOption" qo
        WHERE qo.question_id = ANY(${questionIds})
        ORDER BY qo.id
      `;
    }

    // Get all responses for this survey today
    const responses = await sql`
      SELECT r.id, r.created_at, r.lock_mode_violations,
             st.number as student_number, st.id as student_id
      FROM "Response" r
      JOIN "Student" st ON st.id = r.student_id
      WHERE r.survey_id = ${surveyId}
        AND r.created_at >= ${today}
      ORDER BY r.created_at
    `;

    // Get all answers for these responses
    const responseIds = responses.map((r: any) => r.id);
    let answers: any[] = [];
    if (responseIds.length > 0) {
      answers = await sql`
        SELECT a.id, a.response_id, a.question_id, a.value, a.feedback, a.is_correct
        FROM "Answer" a
        WHERE a.response_id = ANY(${responseIds})
        ORDER BY a.response_id, a.question_id
      `;
    }

    // Build structured result
    const questionsWithOptions = questions.map((q: any) => ({
      ...q,
      options: options.filter((o: any) => o.question_id === q.id),
    }));

    const responsesWithAnswers = responses.map((r: any) => ({
      ...r,
      answers: answers.filter((a: any) => a.response_id === r.id),
    }));

    results.push({
      survey: {
        ...survey,
        questions: questionsWithOptions,
      },
      responses: responsesWithAnswers,
      totalResponses: responses.length,
    });
  }

  console.log(JSON.stringify({ newResponses: true, surveys: results }, null, 2));
}

main().catch((e) => {
  console.error("Fel:", e.message);
  process.exit(1);
});
