import { prisma } from "../prisma.js";
import { senasteSvarPerElev } from "../svarsurval.js";
import { raknaSvarsalternativ } from "../svarsvarden.js";

/**
 * Tidslinjesvaret är JSON: `{"ar":-3000}` eller `{"ordning":[...]}`. Utan det
 * här skulle rapporten bära elevens datastruktur i stället för hens svar.
 *
 * Kanoniska implementationen är `formateraTidslinjesvar` och `formatAr` i
 * webbappens src/lib/tidslinje.ts. Den här är en medveten kopia, av samma skäl
 * som schemat i csv-question.ts: MCP-servern byggs för sig och får inte
 * importera över paketgränsen.
 */
function formatAr(ar: number, cirka?: boolean): string {
  const bas = ar < 0 ? `${Math.abs(ar)} f.Kr.` : String(ar);
  return cirka ? `ca ${bas}` : bas;
}

function tidslinjesvar(value: string): string | null {
  let rått: unknown;
  try {
    rått = JSON.parse(value);
  } catch {
    return null;
  }
  if (!rått || typeof rått !== "object") return null;
  const o = rått as { ar?: unknown; ordning?: unknown };
  if (Array.isArray(o.ordning)) {
    const ar = o.ordning.filter((x): x is number => typeof x === "number");
    return ar.length > 0 ? ar.map((x) => formatAr(x)).join(" · ") : null;
  }
  return typeof o.ar === "number" ? formatAr(o.ar) : null;
}

/** Facit i klartext: "Antiken börjar (ca 3000 f.Kr.)". */
function tidslinjefacit(config: unknown): string | null {
  const mal = (config as { mal?: { ar: number; rubrik: string; cirka?: boolean }[] })?.mal;
  if (!Array.isArray(mal) || mal.length === 0) return null;
  return mal.map((m) => `${m.rubrik} (${formatAr(m.ar, m.cirka)})`).join(" · ");
}

export async function getResults(surveyId: number): Promise<string> {
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

  if (!survey) return JSON.stringify({ error: "Enkät hittades inte" });

  const isQuiz = survey.mode === "QUIZ";
  // Omtag: varje elev väger en gång, precis som i webbappens resultatvyer
  const responses = senasteSvarPerElev(survey.responses);

  const questions = survey.questions.map((sq) => {
    const q = sq.question;
    const correctOption = q.options.find((o) => o.isCorrect);
    const answersWithStudent = responses.flatMap((r) =>
      r.answers
        .filter((a) => a.questionId === q.id)
        .map((a) => ({ value: a.value, studentNumber: r.student.number, isCorrect: a.isCorrect }))
    );

    if (q.type === "MULTIPLE_CHOICE") {
      const { optionCounts, osakra } = raknaSvarsalternativ(
        q.options.map((o) => o.text),
        answersWithStudent.map((a) => a.value)
      );
      return {
        id: q.id, text: q.text, type: q.type, optionCounts, osakra,
        correctAnswer: isQuiz ? correctOption?.text || null : null,
        studentAnswers: answersWithStudent.map((a) => ({
          studentNumber: a.studentNumber, value: a.value, isCorrect: a.isCorrect,
        })),
      };
    }

    // Tidslinjefrågan rättas mot facit som flervalsfrågan, men har inga
    // alternativ att fördela svaren över. Rapporten får antalet rätt och
    // facit i klartext - annars såg en tidslinjefråga orättad ut här medan
    // webbappens resultatvy visade "X av Y rätt".
    if (q.type === "TIMELINE") {
      return {
        id: q.id,
        text: q.text,
        type: q.type,
        ratt: answersWithStudent.filter((a) => a.isCorrect === true).length,
        besvarad: answersWithStudent.length,
        correctAnswer: isQuiz ? tidslinjefacit(q.config) : null,
        studentAnswers: answersWithStudent.map((a) => ({
          studentNumber: a.studentNumber,
          value: tidslinjesvar(a.value) ?? a.value,
          isCorrect: a.isCorrect,
        })),
      };
    }

    return {
      id: q.id,
      text: q.text,
      type: q.type,
      textResponses: answersWithStudent.map((a) => a.value),
      studentAnswers: answersWithStudent.map((a) => ({
        studentNumber: a.studentNumber, value: a.value,
      })),
    };
  });

  return JSON.stringify({
    survey: {
      id: survey.id,
      title: survey.title,
      mode: survey.mode,
      responseCount: responses.length,
    },
    questions,
  }, null, 2);
}
