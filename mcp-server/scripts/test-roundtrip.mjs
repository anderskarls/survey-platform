#!/usr/bin/env node
// Skarpt end-to-end-test av create_quiz_from_csv MED stadning efteråt.
// Skapar en temp-topic + 2 fragor + 1 quiz, verifierar, och raderar allt igen.
import { prisma } from "../dist/prisma.js";
import { createQuizFromCsv } from "../dist/tools/create-quiz-from-csv.js";

const COURSE_ID = 2; // Rätten och Samhället
const TOPIC = "ZZ_TEST_INTEGRATION - radera mig";

const csv = [
  "topic,type,text,option1,option2,option3,option4,correctAnswer",
  `${TOPIC},MULTIPLE_CHOICE,Vad testar detta?,Integrationen,Vädret,Lunchen,Ingenting,Integrationen`,
  `${TOPIC},FREE_TEXT,Skriv en kort reflektion om kopplingen.,,,,,`,
].join("\n");

let surveyId = null;
try {
  console.log("1) Skapar test-quiz via create_quiz_from_csv ...");
  const raw = await createQuizFromCsv(
    COURSE_ID,
    "ZZ TEST - integration (radera mig)",
    csv,
    "Automatiskt test, raderas direkt.",
    "QUIZ",
    false
  );
  const res = JSON.parse(raw);
  surveyId = res.id;
  console.log("   Resultat:", JSON.stringify(res));

  // Verifiera att quizzen finns med ratt antal fragor i ratt ordning
  const survey = await prisma.survey.findUnique({
    where: { id: surveyId },
    include: { questions: { include: { question: { include: { options: true } } }, orderBy: { order: "asc" } } },
  });
  console.log(`2) Verifiering: mode=${survey.mode}, lockMode=${survey.lockMode}, antal fragor=${survey.questions.length}`);
  for (const sq of survey.questions) {
    const correct = sq.question.options.find((o) => o.isCorrect);
    console.log(`   [#${sq.order}] (${sq.question.type}) ${sq.question.text}${correct ? ` -> ratt: ${correct.text}` : ""}`);
  }
  const ok = survey.mode === "QUIZ" && survey.questions.length === 2;
  console.log(ok ? "   => OK" : "   => FEL: forvantade QUIZ med 2 fragor");
} finally {
  // Stadning - ta bort i FK-saker ordning
  console.log("3) Stadar upp ...");
  if (surveyId) {
    await prisma.survey.delete({ where: { id: surveyId } }); // cascade: SurveyQuestion
  }
  const topic = await prisma.topic.findUnique({
    where: { courseId_name: { courseId: COURSE_ID, name: TOPIC } },
    include: { questions: true },
  });
  if (topic) {
    for (const q of topic.questions) {
      await prisma.question.delete({ where: { id: q.id } }); // cascade: options m.m.
    }
    await prisma.topic.delete({ where: { id: topic.id } });
  }
  console.log("   Klart - all testdata borttagen.");

  // Slutkontroll: inget kvar
  const leftover = await prisma.topic.findUnique({
    where: { courseId_name: { courseId: COURSE_ID, name: TOPIC } },
  });
  console.log(leftover ? "   VARNING: temp-topic finns kvar!" : "   Bekraftat: ingen testdata kvar i databasen.");
  process.exit(0);
}
