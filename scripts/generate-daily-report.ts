import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";

const prisma = new PrismaClient();

function formatDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

async function main() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dateStr = formatDate(today);

  // Check for new responses
  const newResponseCount = await prisma.response.count({
    where: { createdAt: { gte: today } },
  });

  if (newResponseCount === 0) {
    console.log("Inga nya svar idag.");
    await prisma.$disconnect();
    return;
  }

  console.log(`Hittade ${newResponseCount} nya svar. Hämtar fullständig data...`);

  // Get all surveys with responses today
  const surveysWithResponses = await prisma.survey.findMany({
    where: {
      responses: { some: { createdAt: { gte: today } } },
    },
    include: {
      course: true,
      unit: true,
      questions: {
        orderBy: { order: "asc" },
        include: {
          question: {
            include: {
              options: true,
              topic: true,
            },
          },
        },
      },
      responses: {
        where: { createdAt: { gte: today } },
        include: {
          student: true,
          answers: {
            include: { question: true },
          },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  let report = `# Pedagogisk Feedback-rapport – ${dateStr}\n\n`;
  report += `*Genererad automatiskt baserat på svar inkomna ${dateStr}.*\n\n`;
  report += `**Totalt antal svar:** ${newResponseCount}  \n`;
  report += `**Antal enkäter/quiz:** ${surveysWithResponses.length}\n\n`;
  report += `---\n\n`;

  for (const survey of surveysWithResponses) {
    const isQuiz = survey.mode === "QUIZ";
    const responses = survey.responses;
    const studentCount = responses.length;

    report += `## ${isQuiz ? "Quiz" : "Enkät"}: ${survey.title}\n\n`;
    report += `**Kurs:** ${survey.course.name} (${survey.course.code})  \n`;
    if (survey.unit) {
      report += `**Lektion/Enhet:** ${survey.unit.title}${survey.lesson ? `, lektion ${survey.lesson}` : ""}  \n`;
    }
    report += `**Antal svar:** ${studentCount}  \n`;
    report += `**Typ:** ${isQuiz ? "Quiz (poängsatt)" : "Enkät"}  \n\n`;

    if (isQuiz) {
      report += analyzeQuiz(survey, responses);
    } else {
      report += analyzeSurvey(survey, responses);
    }

    report += `---\n\n`;
  }

  report += `## Övergripande Rekommendationer\n\n`;
  report += generateOverallRecommendations(surveysWithResponses);

  // Save report
  const reportsDir = path.join(process.cwd(), "reports");
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }

  const reportPath = path.join(reportsDir, `feedback-${dateStr}.md`);
  fs.writeFileSync(reportPath, report, "utf-8");
  console.log(`Rapport sparad: ${reportPath}`);

  await prisma.$disconnect();
}

function analyzeQuiz(survey: any, responses: any[]): string {
  let text = "";
  const questions = survey.questions.map((sq: any) => sq.question);
  const totalStudents = responses.length;

  text += `### Resultat per fråga\n\n`;

  const questionStats: Array<{
    question: any;
    correctCount: number;
    totalAnswered: number;
    incorrectStudents: number[];
  }> = [];

  for (const sq of survey.questions) {
    const q = sq.question;
    if (q.type !== "MULTIPLE_CHOICE") continue;

    let correctCount = 0;
    let totalAnswered = 0;
    const incorrectStudents: number[] = [];

    for (const response of responses) {
      const answer = response.answers.find((a: any) => a.questionId === q.id);
      if (!answer) continue;
      totalAnswered++;
      if (answer.isCorrect) {
        correctCount++;
      } else {
        incorrectStudents.push(response.student.number);
      }
    }

    questionStats.push({ question: q, correctCount, totalAnswered, incorrectStudents });

    const pct = totalAnswered > 0 ? Math.round((correctCount / totalAnswered) * 100) : 0;
    const icon = pct >= 80 ? "✅" : pct >= 50 ? "⚠️" : "❌";

    text += `**${icon} ${q.text}**  \n`;
    text += `Ämne: *${q.topic.name}*  \n`;
    text += `Rätt svar: ${correctCount}/${totalAnswered} (${pct}%)  \n`;

    if (pct < 80 && incorrectStudents.length > 0) {
      text += `Elever som svarade fel: ${incorrectStudents.map((n) => `Elev ${n}`).join(", ")}  \n`;
    }
    text += `\n`;
  }

  const freeTextQs = questions.filter((q: any) => q.type === "FREE_TEXT");
  if (freeTextQs.length > 0) {
    text += `### Fritextsvar i quiz\n\n`;
    for (const q of freeTextQs) {
      text += `**${q.text}**\n\n`;
      for (const response of responses) {
        const answer = response.answers.find((a: any) => a.questionId === q.id);
        if (answer) {
          text += `- Elev ${response.student.number}: "${answer.value}"${answer.feedback ? ` *(Feedback: ${answer.feedback})*` : ""}  \n`;
        }
      }
      text += `\n`;
    }
  }

  const mcQuestions = questions.filter((q: any) => q.type === "MULTIPLE_CHOICE");
  if (mcQuestions.length > 0) {
    text += `### Sammanfattning – Elevers totala poäng\n\n`;

    const studentScores = responses.map((response: any) => {
      let correct = 0;
      let total = 0;
      for (const q of mcQuestions) {
        const answer = response.answers.find((a: any) => a.questionId === q.id);
        if (answer) {
          total++;
          if (answer.isCorrect) correct++;
        }
      }
      return { studentNumber: response.student.number, correct, total };
    });

    studentScores.sort((a, b) => a.correct / (a.total || 1) - b.correct / (b.total || 1));

    for (const s of studentScores) {
      const pct = s.total > 0 ? Math.round((s.correct / s.total) * 100) : 0;
      const bar = "█".repeat(Math.round(pct / 10)) + "░".repeat(10 - Math.round(pct / 10));
      text += `Elev ${s.studentNumber}: ${bar} ${s.correct}/${s.total} (${pct}%)  \n`;
    }
    text += `\n`;

    const needsSupport = studentScores.filter((s) => s.total > 0 && s.correct / s.total < 0.5);
    if (needsSupport.length > 0) {
      text += `### ⚠️ Elever som kan behöva extra stöd\n\n`;
      text += `Följande elever svarade rätt på mindre än hälften av frågorna:\n\n`;
      for (const s of needsSupport) {
        text += `- **Elev ${s.studentNumber}**: ${s.correct}/${s.total} rätt\n`;
      }
      text += `\n`;
    }

    const topicStats: Record<string, { correct: number; total: number }> = {};
    for (const stat of questionStats) {
      const topic = stat.question.topic.name;
      if (!topicStats[topic]) topicStats[topic] = { correct: 0, total: 0 };
      topicStats[topic].correct += stat.correctCount;
      topicStats[topic].total += stat.totalAnswered;
    }

    text += `### Kunskapsluckor per ämnesområde\n\n`;
    for (const [topic, stats] of Object.entries(topicStats)) {
      if (stats.total === 0) continue;
      const pct = Math.round((stats.correct / stats.total) * 100);
      const icon = pct >= 80 ? "✅" : pct >= 50 ? "⚠️" : "❌";
      text += `${icon} **${topic}**: ${pct}% rätt  \n`;
    }
    text += `\n`;
  }

  text += `### Rekommendationer för uppföljning\n\n`;
  const weakAreas = questionStats.filter(
    (s) => s.totalAnswered > 0 && s.correctCount / s.totalAnswered < 0.6
  );
  if (weakAreas.length === 0) {
    text += `- Klassen visade generellt god förståelse. Fokusera på fördjupning för de elever som vill.\n`;
  } else {
    text += `- Genomgång rekommenderas för: ${weakAreas.map((s) => `*${s.question.text.substring(0, 50)}...*`).join(", ")}.\n`;
    text += `- Erbjud extra övningsuppgifter inom de ämnesområden med lägst svarsfrekvens.\n`;
    text += `- Boka individuella samtal med elever som behöver stöd.\n`;
  }
  text += `\n`;

  return text;
}

function analyzeSurvey(survey: any, responses: any[]): string {
  let text = "";
  const questions = survey.questions.map((sq: any) => sq.question);

  text += `### Svar per fråga\n\n`;

  for (const sq of survey.questions) {
    const q = sq.question;
    text += `**${q.text}**  \n`;
    text += `Typ: ${q.type === "MULTIPLE_CHOICE" ? "Flervalsfråga" : "Fritextsvar"}  \n\n`;

    if (q.type === "MULTIPLE_CHOICE") {
      const optionCounts: Record<string, number> = {};
      for (const opt of q.options) {
        optionCounts[opt.text] = 0;
      }

      for (const response of responses) {
        const answer = response.answers.find((a: any) => a.questionId === q.id);
        if (answer) {
          const opt = q.options.find((o: any) => o.id === parseInt(answer.value));
          if (opt) optionCounts[opt.text] = (optionCounts[opt.text] || 0) + 1;
        }
      }

      const total = responses.length;
      for (const [optText, count] of Object.entries(optionCounts)) {
        const pct = total > 0 ? Math.round((count / total) * 100) : 0;
        const bar = "█".repeat(Math.round(pct / 10)) + "░".repeat(10 - Math.round(pct / 10));
        text += `  ${bar} ${optText}: ${count} svar (${pct}%)  \n`;
      }
      text += `\n`;
    } else {
      const answers: string[] = [];
      for (const response of responses) {
        const answer = response.answers.find((a: any) => a.questionId === q.id);
        if (answer && answer.value.trim()) {
          answers.push(answer.value.trim());
        }
      }

      if (answers.length === 0) {
        text += `*Inga svar lämnades på denna fråga.*\n\n`;
      } else {
        text += `Inkomna svar:\n\n`;
        answers.forEach((ans, i) => {
          text += `${i + 1}. "${ans}"\n`;
        });
        text += `\n`;
        text += identifyThemes(q.text, answers);
      }
    }
  }

  text += `### Mönster och observationer\n\n`;
  const answeredAll = responses.filter((r: any) => r.answers.length === questions.length).length;
  const pctComplete = responses.length > 0 ? Math.round((answeredAll / responses.length) * 100) : 0;
  text += `- **Svarsfrekvens:** ${pctComplete}% av eleverna besvarade alla frågor.\n`;

  if (pctComplete < 90) {
    const incomplete = responses
      .filter((r: any) => r.answers.length < questions.length)
      .map((r: any) => `Elev ${r.student.number}`);
    text += `- Ofullständiga svar från: ${incomplete.join(", ")}\n`;
  }

  text += `\n### Rekommendationer\n\n`;
  text += `- Sammanfatta enkätresultaten för klassen vid nästa lektion för att stänga feedbackloopen.\n`;
  text += `- Använd fritextsvaren som utgångspunkt för klassrumsdiskussion.\n`;
  text += `- Elever med ofullständiga svar bör påminnas om att slutföra enkäten.\n`;
  text += `\n`;

  return text;
}

function identifyThemes(question: string, answers: string[]): string {
  if (answers.length < 2) return "";

  const wordFreq: Record<string, number> = {};
  const stopWords = new Set(["och", "att", "är", "det", "en", "ett", "i", "på", "av", "för", "med", "som", "den", "de", "till", "har", "inte", "om", "men", "vi", "sig", "kan", "var", "min", "jag", "du", "han", "hon", "the", "a", "an", "is", "it", "in", "of", "to", "and", "that", "this", "was", "are", "for", "on", "with"]);

  for (const ans of answers) {
    const words = ans.toLowerCase().replace(/[.,!?;:]/g, "").split(/\s+/);
    for (const word of words) {
      if (word.length > 3 && !stopWords.has(word)) {
        wordFreq[word] = (wordFreq[word] || 0) + 1;
      }
    }
  }

  const topWords = Object.entries(wordFreq)
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([word]) => word);

  if (topWords.length === 0) return "";

  return `*Återkommande teman i svaren: ${topWords.join(", ")}*\n\n`;
}

function generateOverallRecommendations(surveys: any[]): string {
  let text = "";
  const quizzes = surveys.filter((s) => s.mode === "QUIZ");
  const enkater = surveys.filter((s) => s.mode !== "QUIZ");

  if (quizzes.length > 0) {
    text += `### Quiz-uppföljning\n\n`;
    text += `- Gå igenom frågorna med lägst andel rätta svar som helklass.\n`;
    text += `- Erbjud frivilliga fördjupningsuppgifter för elever som vill förbättra sina resultat.\n`;
    text += `- Kontakta elever som presterade under 50% för att planera extra stöd.\n\n`;
  }

  if (enkater.length > 0) {
    text += `### Enkät-uppföljning\n\n`;
    text += `- Presentera anonymiserade enkätresultat för klassen – det visar att deras röster hörs.\n`;
    text += `- Identifiera 2–3 nyckelteman från fritextsvaren och planera in tid att adressera dem.\n`;
    text += `- Spara enkätdata för jämförelse med kommande enkäter om samma ämne.\n\n`;
  }

  text += `### Generella tips\n\n`;
  text += `- Schemalägg en kort återkoppling (5–10 min) vid nästa lektionstillfälle.\n`;
  text += `- Dokumentera åtgärder som vidtas baserat på denna rapport.\n`;

  return text;
}

main().catch((err) => {
  console.error("Fel vid generering av rapport:", err);
  process.exit(1);
});
