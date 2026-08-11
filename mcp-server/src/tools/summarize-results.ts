import { prisma } from "../prisma.js";
import { senasteSvarPerElev } from "../svarsurval.js";
import { arOsaker, raknaSvarsalternativ } from "../svarsvarden.js";

export async function summarizeResults(surveyId: number): Promise<string> {
  const survey = await prisma.survey.findUnique({
    where: { id: surveyId },
    include: {
      questions: {
        include: { question: { include: { options: true } } },
        orderBy: { order: "asc" },
      },
      // Lärarens provkonto räknas inte i klassens siffror (isTest)
      responses: {
        where: { student: { isTest: false } },
        include: { student: true, answers: true },
      },
    },
  });

  if (!survey) return "Enkät hittades inte.";

  const isQuiz = survey.mode === "QUIZ";
  // Omtag: varje elev väger en gång, precis som i webbappens resultatvyer
  const responses = senasteSvarPerElev(survey.responses);
  const lines: string[] = [];
  lines.push(`# Sammanfattning: ${survey.title}`);
  lines.push(`Läge: ${isQuiz ? "Quiz" : "Enkät"}`);
  lines.push(`Totalt antal svar: ${responses.length}`);
  lines.push("");

  const studentNumbers = [...new Set(responses.map((r) => r.student.number))].sort((a, b) => a - b);
  lines.push(`Antal unika elever: ${studentNumbers.length}`);
  lines.push(`Elevnummer: ${studentNumbers.map((n) => `#${n}`).join(", ")}`);
  lines.push("");

  if (isQuiz) {
    lines.push("## Poäng per elev");
    for (const r of [...responses].sort((a, b) => a.student.number - b.student.number)) {
      const correct = r.answers.filter((a) => a.isCorrect === true).length;
      const total = r.answers.filter((a) => a.isCorrect !== null).length;
      const pct = total > 0 ? Math.round((correct / total) * 100) : 0;
      lines.push(`- Elev #${r.student.number}: ${correct}/${total} (${pct}%)`);
    }
    lines.push("");
  }

  for (const sq of survey.questions) {
    const q = sq.question;
    const correctOption = q.options.find((o) => o.isCorrect);
    const answersWithStudent = responses.flatMap((r) =>
      r.answers
        .filter((a) => a.questionId === q.id)
        .map((a) => ({ value: a.value, studentNumber: r.student.number, isCorrect: a.isCorrect }))
    );

    lines.push(`## ${q.text}`);
    if (isQuiz && correctOption) {
      lines.push(`Rätt svar: ${correctOption.text}`);
    }

    if (q.type === "MULTIPLE_CHOICE") {
      const { optionCounts, osakra, avgivna } = raknaSvarsalternativ(
        q.options.map((o) => o.text),
        answersWithStudent.map((a) => a.value)
      );

      const namnare = avgivna || 1;
      for (const [option, count] of Object.entries(optionCounts)) {
        const pct = Math.round((count / namnare) * 100);
        const marker = isQuiz && correctOption?.text === option ? " ✓" : "";
        lines.push(`- ${option}: ${count} svar (${pct}%)${marker}`);
      }
      if (osakra > 0) {
        lines.push(
          `_Utöver fördelningen: ${osakra} elev${osakra === 1 ? "" : "er"} markerade ` +
            `"Jag är osäker" i stället för att svara. Det är inte ett fel svar och ingår ` +
            `inte i procenten ovan._`
        );
      }

      lines.push("");
      lines.push("Per elev:");
      [...answersWithStudent]
        .sort((a, b) => a.studentNumber - b.studentNumber)
        .forEach((a) => {
          if (arOsaker(a.value)) {
            lines.push(`- Elev #${a.studentNumber}: osäker (inget svar avgivet)`);
            return;
          }
          const marker = isQuiz ? (a.isCorrect ? " ✓" : " ✗") : "";
          lines.push(`- Elev #${a.studentNumber}: ${a.value}${marker}`);
        });
    } else if (q.type === "REFLECTION") {
      lines.push("_Självreflektion - ej bedömd, ingår inte i någon svarsprocent_");
      lines.push(`Antal reflektioner: ${answersWithStudent.length}`);
      if (answersWithStudent.length > 0) {
        lines.push("");
        lines.push("Reflektioner:");
        answersWithStudent
          .sort((a, b) => a.studentNumber - b.studentNumber)
          .forEach((a) => {
            lines.push(`- Elev #${a.studentNumber}: "${a.value}"`);
          });
      }
    } else {
      lines.push(`Antal fritextsvar: ${answersWithStudent.length}`);
      if (answersWithStudent.length > 0) {
        lines.push("");
        lines.push("Fritextsvar:");
        answersWithStudent
          .sort((a, b) => a.studentNumber - b.studentNumber)
          .forEach((a) => {
            lines.push(`- Elev #${a.studentNumber}: "${a.value}"`);
          });
      }
    }
    lines.push("");
  }

  lines.push("---");
  lines.push(
    "Sammanfatta gärna fritextsvaren och reflektionerna ovan och identifiera teman och mönster. " +
      "Reflektioner är självreflektion - bedöm dem inte och sätt aldrig betygsbokstäver i text eleven läser."
  );

  return lines.join("\n");
}
