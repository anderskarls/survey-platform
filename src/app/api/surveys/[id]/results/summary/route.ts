import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSurveyAccess } from "@/lib/require-auth";
import { answerLabel } from "@/lib/blank-answer";
import { senasteSvarPerElev } from "@/lib/svarsurval";
import { arOsaker, raknaSvarsalternativ } from "@/lib/svarsvarden";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const surveyId = Number(id);
  if (isNaN(surveyId)) {
    return NextResponse.json({ error: "Ogiltigt enkät-ID" }, { status: 400 });
  }

  const authError = await requireSurveyAccess(surveyId);
  if (authError) return authError;

  const survey = await prisma.survey.findUnique({
    where: { id: surveyId },
    include: {
      questions: {
        include: { question: { include: { options: true } } },
        orderBy: { order: "asc" },
      },
      // Lärarens provkonto hör inte till klassens siffror
      responses: {
        where: { student: { isTest: false } },
        include: { student: true, answers: true },
      },
    },
  });

  if (!survey) {
    return NextResponse.json({ error: "Enkät hittades inte" }, { status: 404 });
  }

  // Omtag: en elev väger en gång, senaste inlämningen gäller
  survey.responses = senasteSvarPerElev(survey.responses);

  const isQuiz = survey.mode === "QUIZ";
  const lines: string[] = [];
  lines.push(`# Sammanfattning: ${survey.title}`);
  lines.push(`Läge: ${isQuiz ? "Quiz" : "Enkät"}`);
  lines.push(`Totalt antal svar: ${survey.responses.length}`);
  lines.push("");

  const studentNumbers = [
    ...new Set(survey.responses.map((r) => r.student.number)),
  ].sort((a, b) => a - b);
  lines.push(`Antal unika elever: ${studentNumbers.length}`);
  lines.push(`Elevnummer: ${studentNumbers.map((n) => `#${n}`).join(", ")}`);
  lines.push("");

  if (isQuiz) {
    lines.push("## Poäng per elev");
    for (const r of [...survey.responses].sort(
      (a, b) => a.student.number - b.student.number
    )) {
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
    const answersWithStudent = survey.responses.flatMap((r) =>
      r.answers
        .filter((a) => a.questionId === q.id)
        .map((a) => ({
          // Obesvarade frågor sparas som tomma rader - i sammanställningen
          // ska de synas som "(inget svar)", inte som en tom sträng.
          value: answerLabel(a.value),
          studentNumber: r.student.number,
          isCorrect: a.isCorrect,
        }))
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
    } else {
      lines.push(`Antal fritextsvar: ${answersWithStudent.length}`);
      if (answersWithStudent.length > 0) {
        lines.push("");
        lines.push("Fritextsvar:");
        [...answersWithStudent]
          .sort((a, b) => a.studentNumber - b.studentNumber)
          .forEach((a) => {
            lines.push(`- Elev #${a.studentNumber}: "${a.value}"`);
          });
      }
    }
    lines.push("");
  }

  return new NextResponse(lines.join("\n"), {
    status: 200,
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
}
