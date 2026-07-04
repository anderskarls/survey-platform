import { prisma } from "../prisma.js";

export async function getMomentReport(unitId: number): Promise<string> {
  const unit = await prisma.unit.findUnique({
    where: { id: unitId },
    include: {
      course: { include: { students: true } },
      surveys: {
        orderBy: { createdAt: "asc" },
        include: {
          questions: {
            include: { question: { include: { options: true } } },
            orderBy: { order: "asc" },
          },
          responses: { include: { student: true, answers: true } },
        },
      },
    },
  });

  if (!unit) return "Moment hittades inte.";

  const lines: string[] = [];
  lines.push(`# Momentrapport: ${unit.title}`);
  lines.push(`Kurs: ${unit.course.name} (${unit.course.code})`);
  lines.push(`Antal elever i kursen: ${unit.course.students.length}`);
  lines.push(`Antal uppgifter: ${unit.surveys.length}`);
  lines.push("");

  lines.push("## Completion per uppgift");
  for (const s of unit.surveys) {
    const distinct = new Set(s.responses.map((r) => r.student.number)).size;
    lines.push(`- ${s.title} (${s.mode}): ${distinct} elever har lämnat in`);
  }
  lines.push("");

  const reflectionEntries: {
    survey: string;
    lesson: number | null;
    question: string;
    answers: { n: number; value: string }[];
  }[] = [];

  for (const s of unit.surveys) {
    // Samla reflektioner separat - självreflektion, inte bedömd, ska hållas
    // utanför quiz-/svarsprocent-statistiken och redovisas i egen sektion nedan.
    for (const sq of s.questions.filter((sq) => sq.question.type === "REFLECTION")) {
      const q = sq.question;
      const answers = s.responses.flatMap((r) =>
        r.answers
          .filter((a) => a.questionId === q.id)
          .map((a) => ({ n: r.student.number, value: a.value }))
      );
      reflectionEntries.push({ survey: s.title, lesson: s.lesson, question: q.text, answers });
    }

    const gradedQuestions = s.questions.filter((sq) => sq.question.type !== "REFLECTION");
    if (gradedQuestions.length === 0) continue; // ren reflektionsuppgift - se egen sektion

    lines.push(`## ${s.title}`);
    const isQuiz = s.mode === "QUIZ";
    for (const sq of gradedQuestions) {
      const q = sq.question;
      const ans = s.responses.flatMap((r) =>
        r.answers
          .filter((a) => a.questionId === q.id)
          .map((a) => ({
            value: a.value,
            n: r.student.number,
            isCorrect: a.isCorrect,
            feedback: a.feedback,
          }))
      );
      lines.push(`### ${q.text}`);
      if (q.type === "MULTIPLE_CHOICE") {
        const counts: Record<string, number> = {};
        q.options.forEach((o) => (counts[o.text] = 0));
        ans.forEach((a) => (counts[a.value] = (counts[a.value] || 0) + 1));
        const correct = q.options.find((o) => o.isCorrect)?.text;
        const total = ans.length || 1;
        for (const [opt, c] of Object.entries(counts)) {
          const mark = isQuiz && opt === correct ? " ✓" : "";
          lines.push(`- ${opt}: ${c} (${Math.round((c / total) * 100)}%)${mark}`);
        }
      } else {
        lines.push(`Fritextsvar (${ans.length}):`);
        ans
          .sort((a, b) => a.n - b.n)
          .forEach((a) => {
            lines.push(
              `- Elev #${a.n}: "${a.value}"${a.feedback ? " [feedback finns]" : " [SAKNAR feedback]"}`
            );
          });
      }
      lines.push("");
    }
  }

  if (reflectionEntries.length > 0) {
    lines.push("## Elevreflektioner (självreflektion - ej bedömd, ingår inte i quiz-statistiken)");
    for (const e of reflectionEntries) {
      const lessonTag = e.lesson ? ` (lektion ${e.lesson})` : "";
      lines.push(`### ${e.question}${lessonTag}`);
      lines.push(`Reflektioner (${e.answers.length}):`);
      if (e.answers.length === 0) {
        lines.push("- (inga svar än)");
      } else {
        e.answers
          .sort((a, b) => a.n - b.n)
          .forEach((a) => lines.push(`- Elev #${a.n}: "${a.value}"`));
      }
      lines.push("");
    }
  }

  const questionIds = unit.surveys.flatMap((s) => s.questions.map((sq) => sq.question.id));
  if (questionIds.length > 0) {
    const flagged = await prisma.flaggedQuestion.findMany({
      where: { questionId: { in: questionIds } },
      include: { question: true, student: true },
    });
    if (flagged.length > 0) {
      lines.push("## Flaggade frågor (elever bad om hjälp)");
      flagged.forEach((f) => lines.push(`- Elev #${f.student.number}: "${f.question.text}"`));
      lines.push("");
    }
  }

  lines.push("---");
  lines.push(
    "Skriv lärarrapporten utifrån detta underlag. Korsläs momentets bedomningskriterier.md. " +
      "Led med andel rätt och fritext-teman (INTE mastery, som är false i engångsmoment). " +
      "Ge E/C/A endast som lärarstöd-indikation, aldrig som satt betyg. Lyft elever som halkar efter. " +
      "Varje punkt ska leda till en konkret lärarhandling. " +
      "Eventuella elevreflektioner är självreflektion - använd dem som formativ signal om vad som fastnade, " +
      "bedöm dem inte och sätt aldrig betygsbokstäver i text eleven läser."
  );

  return lines.join("\n");
}
