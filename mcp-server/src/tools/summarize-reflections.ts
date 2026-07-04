import { prisma } from "../prisma.js";

export interface SummarizeReflectionsOptions {
  unitId?: number;
  lesson?: number;
  from?: string; // YYYY-MM-DD, inklusive
  to?: string; // YYYY-MM-DD, inklusive
}

/**
 * Hämtar elevernas självreflektioner (frågor med type=REFLECTION) för en kurs
 * och formaterar dem som underlag för en lärarsammanfattning. Ingen LLM i
 * verktyget - MCP-klienten (Claude) genererar sammanfattningen, precis som
 * give-feedback och get-moment-report. Reflektioner bedöms inte och ingår
 * aldrig i quiz-/svarsprocent-statistiken.
 */
export async function summarizeReflections(
  courseCode: string,
  opts: SummarizeReflectionsOptions = {}
): Promise<string> {
  const course = await prisma.course.findUnique({
    where: { code: courseCode },
  });
  if (!course) {
    return `Kurs med kod "${courseCode}" hittades inte.`;
  }

  const createdAt: { gte?: Date; lte?: Date } = {};
  if (opts.from) createdAt.gte = new Date(`${opts.from}T00:00:00.000Z`);
  if (opts.to) createdAt.lte = new Date(`${opts.to}T23:59:59.999Z`);
  const hasDateFilter = createdAt.gte !== undefined || createdAt.lte !== undefined;

  const answers = await prisma.answer.findMany({
    where: {
      question: { type: "REFLECTION" },
      response: {
        ...(hasDateFilter ? { createdAt } : {}),
        survey: {
          courseId: course.id,
          ...(opts.unitId ? { unitId: opts.unitId } : {}),
          ...(opts.lesson ? { lesson: opts.lesson } : {}),
        },
      },
    },
    include: {
      question: true,
      response: {
        include: {
          student: true,
          survey: { include: { unit: true } },
        },
      },
    },
  });

  const filterParts: string[] = [];
  if (opts.unitId) filterParts.push(`moment (unit) ${opts.unitId}`);
  if (opts.lesson) filterParts.push(`lektion ${opts.lesson}`);
  if (opts.from || opts.to) {
    filterParts.push(`period ${opts.from ?? "…"} till ${opts.to ?? "…"}`);
  }

  const lines: string[] = [];
  lines.push(`# Reflektionssammanfattning: ${course.name} (${course.code})`);
  if (filterParts.length > 0) lines.push(`Filter: ${filterParts.join(", ")}`);
  lines.push(`Antal reflektionssvar: ${answers.length}`);
  lines.push("");

  if (answers.length === 0) {
    lines.push("Inga reflektioner hittades för de angivna villkoren.");
    return lines.join("\n");
  }

  // Gruppera per uppgift (survey), och inom uppgiften per fråga.
  type SurveyGroup = {
    title: string;
    lesson: number | null;
    unitTitle: string | null;
    questions: Map<number, { text: string; answers: { n: number; value: string }[] }>;
  };
  const bySurvey = new Map<number, SurveyGroup>();

  for (const a of answers) {
    const survey = a.response.survey;
    let group = bySurvey.get(survey.id);
    if (!group) {
      group = {
        title: survey.title,
        lesson: survey.lesson,
        unitTitle: survey.unit?.title ?? null,
        questions: new Map(),
      };
      bySurvey.set(survey.id, group);
    }
    let q = group.questions.get(a.questionId);
    if (!q) {
      q = { text: a.question.text, answers: [] };
      group.questions.set(a.questionId, q);
    }
    q.answers.push({ n: a.response.student.number, value: a.value });
  }

  // Sortera uppgifter på lektionsnummer (null sist), sedan titel.
  const groups = [...bySurvey.values()].sort((x, y) => {
    const lx = x.lesson ?? Number.MAX_SAFE_INTEGER;
    const ly = y.lesson ?? Number.MAX_SAFE_INTEGER;
    if (lx !== ly) return lx - ly;
    return x.title.localeCompare(y.title, "sv");
  });

  for (const g of groups) {
    const tags: string[] = [];
    if (g.lesson) tags.push(`lektion ${g.lesson}`);
    if (g.unitTitle) tags.push(`moment "${g.unitTitle}"`);
    const tagStr = tags.length > 0 ? ` (${tags.join(", ")})` : "";
    lines.push(`## ${g.title}${tagStr}`);
    for (const q of g.questions.values()) {
      lines.push(`### ${q.text}`);
      q.answers
        .sort((a, b) => a.n - b.n)
        .forEach((a) => lines.push(`- Elev #${a.n}: "${a.value}"`));
      lines.push("");
    }
  }

  lines.push("---");
  lines.push(
    "Sammanfatta för läraren: vad fastnade eleverna på, vilka mönster syns, vad bör tas upp nästa lektion. " +
      "Lyft gärna enskilda elever som verkar ha kört fast. Detta är självreflektion - bedöm inte, " +
      "och sätt aldrig betygsbokstäver (E/C/A) i text som eleven läser."
  );

  return lines.join("\n");
}
