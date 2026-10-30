import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { answerLabel } from "@/lib/blank-answer";
import { ledtradEtikett, ledtradNyckel, postEtikett, sammanfattaLedtradar } from "@/lib/ledtrad-rapport";
import { requireCourseAccess } from "@/lib/require-auth";
import { gallandeSvarPerElev } from "@/lib/svarsurval";
import { raknaSvarsalternativ } from "@/lib/svarsvarden";

// Markdown teacher-report for a whole moment: completion per assignment,
// per-question breakdown (option counts with the correct one marked for
// quizzes, all free-text answers for surveys) and flagged questions. Mirrors
// the MCP get_moment_report tool. Returns text/markdown.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ courseId: string; unitId: string }> }
) {
  const authError = await requireCourseAccess(params);
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
      // Lärarens provkonto hör inte till klassens siffror
      course: { include: { students: { where: { isTest: false } } } },
      surveys: {
        orderBy: { createdAt: "asc" },
        include: {
          questions: {
            include: { question: { include: { options: true } } },
            orderBy: { order: "asc" },
          },
          responses: {
            where: { student: { isTest: false } },
            include: { student: true, answers: true },
          },
        },
      },
    },
  });

  if (!unit || unit.courseId !== cId) {
    return NextResponse.json({ error: "Momentet hittades inte" }, { status: 404 });
  }

  // Omtag: en elev väger en gång per uppgift. Utan det här sa rapporten
  // "7 elever har lämnat in" och redovisade samtidigt en fördelning byggd på
  // nio svarsrader. Vilken inlämning som gäller beror på uppgiftens läge -
  // se svarsurval.ts.
  for (const s of unit.surveys) {
    s.responses = gallandeSvarPerElev(s.responses, { quiz: s.mode === "QUIZ" });
  }

  // Ledtrådar: bara elevernas egna. Lärarens provning (impersonated) och
  // provkontot hör inte till klassens bild.
  const hintRows = await prisma.hintRequest.findMany({
    where: {
      surveyId: { in: unit.surveys.map((s) => s.id) },
      impersonated: false,
      student: { isTest: false },
    },
    include: { student: { select: { number: true } } },
  });
  const ledtradar = sammanfattaLedtradar(hintRows);

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
            // Tom rad = obesvarad fråga. Se blank-answer.ts.
            value: answerLabel(a.value),
            n: r.student.number,
            sid: r.student.id,
            isCorrect: a.isCorrect,
            feedback: a.feedback,
          }))
      );
      lines.push(`### ${q.text}`);
      if (q.type === "MULTIPLE_CHOICE") {
        const { optionCounts, osakra, avgivna } = raknaSvarsalternativ(
          q.options.map((o) => o.text),
          ans.map((a) => a.value)
        );
        const correct = q.options.find((o) => o.isCorrect)?.text;
        const namnare = avgivna || 1;
        for (const [opt, c] of Object.entries(optionCounts)) {
          const mark = isQuiz && opt === correct ? " ✓" : "";
          lines.push(`- ${opt}: ${c} (${Math.round((c / namnare) * 100)}%)${mark}`);
        }
        if (osakra > 0) {
          lines.push(
            `_Utöver fördelningen: ${osakra} elev${osakra === 1 ? "" : "er"} markerade ` +
              `"Jag är osäker". Det är inte ett fel svar och ingår inte i procenten ovan._`
          );
        }
      } else {
        lines.push(`Fritextsvar (${ans.length}):`);
        ans
          .sort((a, b) => a.n - b.n)
          .forEach((a) => {
            const hj = ledtradar.get(ledtradNyckel(s.id, a.sid, q.id));
            lines.push(
              `- Elev #${a.n}: "${a.value}"${a.feedback ? " [feedback finns]" : " [SAKNAR feedback]"}` +
                (hj ? ` [fick ${ledtradEtikett(hj)}]` : "")
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

  if (ledtradar.size > 0) {
    lines.push("## Ledtrådar (AI-stöd för utvalda elever)");
    lines.push(
      "_Diagnosen är AI:ns bild av var resonemanget brast när eleven bad om hjälp - " +
        "eleven har aldrig sett den. Svaren ovan skrevs efter ledtrådarna._"
    );
    for (const s of unit.surveys) {
      for (const sq of s.questions) {
        const q = sq.question;
        const elever = [...new Map(
          hintRows
            .filter((h) => h.surveyId === s.id && h.questionId === q.id)
            .map((h) => [h.studentId, h.student.number])
        )].sort((a, b) => a[1] - b[1]);
        if (elever.length === 0) continue;
        lines.push(`### ${s.title}: ${q.text}`);
        for (const [sid, n] of elever) {
          const sam = ledtradar.get(ledtradNyckel(s.id, sid, q.id))!;
          const inlamnad = s.responses.some((r) => r.student.id === sid);
          lines.push(`- Elev #${n}: ${ledtradEtikett(sam)}${inlamnad ? "" : " (har inte lämnat in)"}`);
          for (const p of sam.poster) {
            lines.push(`  - ${postEtikett(p)}: "${p.hint}"`);
            lines.push(`    - Diagnos: ${p.diagnosis}`);
          }
        }
        lines.push("");
      }
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
