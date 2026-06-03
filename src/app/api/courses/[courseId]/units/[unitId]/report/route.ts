import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-auth";

// Markdown teacher-report for a whole moment: completion per assignment,
// per-question breakdown (option counts with the correct one marked for
// quizzes, all free-text answers for surveys) and flagged questions. Mirrors
// the MCP get_moment_report tool. Returns text/markdown.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ courseId: string; unitId: string }> }
) {
  const authError = await requireAdmin();
  if (authError) return authError;

  const { courseId, unitId } = await params;
  const cId = Number(courseId);
  const uId = Number(unitId);
  if (isNaN(cId) || isNaN(uId)) {
    return NextResponse.json({ error: "Ogiltigt ID" }, { status: 400 });
  }

  const unit = await prisma.unit.findUnique({
    where: { id: uId },
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

  if (!unit || unit.courseId !== cId) {
    return NextResponse.json({ error: "Momentet hittades inte" }, { status: 404 });
  }

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

  for (const s of unit.surveys) {
    lines.push(`## ${s.title}`);
    const isQuiz = s.mode === "QUIZ";
    for (const sq of s.questions) {
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
      "Varje punkt ska leda till en konkret lärarhandling."
  );

  return new NextResponse(lines.join("\n"), {
    status: 200,
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
}
