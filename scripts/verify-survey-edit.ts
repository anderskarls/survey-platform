/**
 * Skarp verifiering av enkätredigeringen mot prod-databasen.
 *
 * Kör appens riktiga applySurveyUpdate genom att lägga en Neon-backad
 * PrismaClient i singletonen innan src/lib/prisma laddas - TCP 5432 är blockerat
 * härifrån, så WebSocket-drivrutinen är enda vägen in (samma som mcp-server).
 *
 * Skapar sitt eget ämne, sina egna frågor, sitt eget moment och sin egen enkät,
 * och river allt igen. Rör aldrig befintlig elevdata.
 *
 *   npx tsx scripts/verify-survey-edit.ts
 */
import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";

config({ path: "mcp-server/.env" });
neonConfig.webSocketConstructor = ws;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL saknas (mcp-server/.env)");
}

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });
(globalThis as unknown as { prisma: PrismaClient }).prisma = prisma;

const MARKER = "__verify-survey-edit";
let failures = 0;

function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    console.log(`  PASS  ${name}`);
  } else {
    failures++;
    console.log(`  FAIL  ${name}${detail ? ` - ${detail}` : ""}`);
  }
}

async function main() {
  const {
    applySurveyUpdate,
    loadSurveyForEdit,
    assertQuestionsInCourse,
    assertUnitInCourse,
    SurveyEditError,
  } = await import("../src/lib/survey-edit");
  const { updateSurveySchema } = await import("../src/lib/validators");
  const input = (raw: Record<string, unknown>) => updateSurveySchema.parse(raw);

  /** Laddar om och kör - samma väg som PATCH-routen tar. */
  async function patch(surveyId: number, raw: Record<string, unknown>) {
    const loaded = await loadSurveyForEdit(surveyId);
    if (!loaded) throw new Error("Enkäten försvann");
    return applySurveyUpdate(loaded.survey, loaded.plannable, input(raw));
  }

  async function ordning(surveyId: number) {
    const rows = await prisma.surveyQuestion.findMany({
      where: { surveyId },
      orderBy: { order: "asc" },
      select: { questionId: true, order: true },
    });
    return rows;
  }

  let topicId = 0;
  let unitId = 0;
  let surveyId = 0;
  let otherCourseQuestionId = 0;
  let otherTopicId = 0;

  try {
    const course = await prisma.course.findFirstOrThrow({ orderBy: { id: "asc" } });
    const student = await prisma.student.findFirstOrThrow({
      where: { courseId: course.id, isTest: true },
    });
    console.log(`Kurs ${course.id} (${course.name}), provkonto ${student.id}\n`);

    // --- uppsättning ---------------------------------------------------------
    const stamp = Date.now();
    const topic = await prisma.topic.create({
      data: { name: `${MARKER}-${stamp}`, courseId: course.id },
    });
    topicId = topic.id;

    const unit = await prisma.unit.create({
      data: { title: `${MARKER}-moment-${stamp}`, courseId: course.id },
    });
    unitId = unit.id;

    const qIds: number[] = [];
    for (const namn of ["A", "B", "C", "D"]) {
      const q = await prisma.question.create({
        data: {
          text: `${MARKER} fråga ${namn}`,
          type: "MULTIPLE_CHOICE",
          topicId,
          options: {
            create: [
              { text: "Rätt", isCorrect: true },
              { text: "Fel", isCorrect: false },
            ],
          },
        },
      });
      qIds.push(q.id);
    }
    const [qA, qB, qC, qD] = qIds;

    const survey = await prisma.survey.create({
      data: {
        title: `${MARKER} enkät`,
        shareCode: `VSE${stamp.toString(36).toUpperCase()}`,
        mode: "SURVEY",
        courseId: course.id,
        questions: {
          create: [
            { questionId: qA, order: 0 },
            { questionId: qB, order: 1 },
            { questionId: qC, order: 2 },
          ],
        },
      },
    });
    surveyId = survey.id;

    // En inlämning med svar på A, B och C - underlaget för konsekvensräkningen.
    await prisma.response.create({
      data: {
        surveyId,
        studentId: student.id,
        answers: {
          create: [
            { questionId: qA, value: "Rätt", isCorrect: true },
            { questionId: qB, value: "Fel", isCorrect: false },
            { questionId: qC, value: "Rätt", isCorrect: true },
          ],
        },
      },
    });

    console.log("A. Metadata utan att röra frågorna");
    {
      const res = await patch(surveyId, {
        title: `${MARKER} omdöpt`,
        description: "Ny beskrivning",
        mode: "QUIZ",
        lockMode: true,
        unitId,
        lesson: 3,
      });
      const after = await prisma.survey.findUniqueOrThrow({ where: { id: surveyId } });
      check("titeln sparades", after.title === `${MARKER} omdöpt`);
      check("läget blev QUIZ", after.mode === "QUIZ");
      check("låst läge slogs på", after.lockMode === true);
      check("momentet kopplades", after.unitId === unitId);
      check("lektionsnumret sparades", after.lesson === 3);
      check("frågorna är orörda", res.impact.addedQuestions === 0 && res.impact.removedQuestions === 0);
      check(
        "ändrade fält rapporteras",
        res.impact.changedFields.length === 6,
        res.impact.changedFields.join(",")
      );
    }

    console.log("\nB. Släpptid fram och tillbaka");
    {
      const t = new Date("2026-09-01T06:00:00.000Z");
      await patch(surveyId, { openAt: t.toISOString() });
      const satt = await prisma.survey.findUniqueOrThrow({ where: { id: surveyId } });
      check("släppet sattes", satt.openAt?.getTime() === t.getTime());

      const res = await patch(surveyId, { openAt: null });
      const nollad = await prisma.survey.findUniqueOrThrow({ where: { id: surveyId } });
      check("släppet nollställdes", nollad.openAt === null);
      check("nollställningen räknas som en ändring", res.impact.changedFields.includes("öppnar"));
    }

    console.log("\nC. Omsortering");
    {
      const res = await patch(surveyId, { questionIds: [qC, qA, qB] });
      const rows = await ordning(surveyId);
      check("ordningen är den nya", rows.map((r) => r.questionId).join(",") === `${qC},${qA},${qB}`);
      check("ordningsnumren är 0,1,2", rows.map((r) => r.order).join(",") === "0,1,2");
      check("rapporteras som omsortering", res.impact.reordered === true);
      check("inget svar berördes", res.impact.hiddenAnswers === 0);
    }

    console.log("\nD. Lägga till en fråga");
    {
      const res = await patch(surveyId, { questionIds: [qC, qA, qB, qD] });
      const rows = await ordning(surveyId);
      check("frågan lades till sist", rows[3]?.questionId === qD && rows[3]?.order === 3);
      check("rapporteras som tillagd", res.impact.addedQuestions === 1);
      check(
        "inlämningen som saknar den räknas",
        res.impact.responsesMissingNew === 1,
        String(res.impact.responsesMissingNew)
      );
    }

    console.log("\nE. Lyfta ur en besvarad fråga kräver kvittering");
    {
      let stoppad = false;
      try {
        await patch(surveyId, { questionIds: [qC, qA, qD] });
      } catch (e) {
        stoppad = e instanceof SurveyEditError && e.status === 409;
        if (stoppad) {
          const payload = (e as InstanceType<typeof SurveyEditError>).payload;
          check("antalet svar står i svaret", payload.hiddenAnswers === 1, JSON.stringify(payload));
        }
      }
      check("409 utan kvittering", stoppad);
      const rows = await ordning(surveyId);
      check("inget sparades vid stoppet", rows.length === 4, String(rows.length));
    }

    console.log("\nF. Urlyft fråga med kvittering - svaren finns kvar");
    {
      const res = await patch(surveyId, {
        questionIds: [qC, qA, qD],
        confirmRemoval: true,
      });
      const rows = await ordning(surveyId);
      check("frågan är ur enkäten", !rows.some((r) => r.questionId === qB));
      check("ordningsnumren har inga hål", rows.map((r) => r.order).join(",") === "0,1,2");
      check("rapporteras som urlyft", res.impact.removedQuestions === 1);
      check("svaret räknades som dolt", res.impact.hiddenAnswers === 1);

      const kvar = await prisma.answer.count({ where: { questionId: qB } });
      check("elevsvaret raderades INTE", kvar === 1, String(kvar));
    }

    console.log("\nG. Frågan tillbaka - svaret syns igen");
    {
      await patch(surveyId, { questionIds: [qC, qA, qB, qD] });
      const svar = await prisma.answer.findMany({
        where: { questionId: qB, response: { surveyId } },
        select: { value: true, isCorrect: true },
      });
      check("svaret hänger kvar på frågan", svar.length === 1 && svar[0].value === "Fel");
      check("rättningen är orörd", svar[0]?.isCorrect === false);
    }

    console.log("\nH. Lossa momentet");
    {
      await patch(surveyId, { unitId: null, lesson: null });
      const after = await prisma.survey.findUniqueOrThrow({ where: { id: surveyId } });
      check("momentet lossades", after.unitId === null && after.lesson === null);
    }

    console.log("\nI. Kursgränsen håller");
    {
      const otherCourse = await prisma.course.findFirst({
        where: { id: { not: course.id } },
        orderBy: { id: "asc" },
      });
      if (!otherCourse) {
        console.log("  SKIP  bara en kurs i databasen");
      } else {
        const otherTopic = await prisma.topic.create({
          data: { name: `${MARKER}-annan-${stamp}`, courseId: otherCourse.id },
        });
        otherTopicId = otherTopic.id;
        const q = await prisma.question.create({
          data: {
            text: `${MARKER} främmande fråga`,
            type: "FREE_TEXT",
            topicId: otherTopicId,
          },
        });
        otherCourseQuestionId = q.id;

        let stoppad = false;
        try {
          await assertQuestionsInCourse([qA, otherCourseQuestionId], course.id);
        } catch (e) {
          stoppad = e instanceof SurveyEditError && e.status === 400;
        }
        check("främmande fråga avvisas", stoppad);

        const otherUnit = await prisma.unit.findFirst({
          where: { courseId: otherCourse.id },
          orderBy: { id: "asc" },
        });
        if (otherUnit) {
          let unitStoppad = false;
          try {
            await assertUnitInCourse(otherUnit.id, course.id);
          } catch (e) {
            unitStoppad = e instanceof SurveyEditError && e.status === 400;
          }
          check("främmande moment avvisas", unitStoppad);
        } else {
          console.log("  SKIP  andra kursen saknar moment");
        }
      }
    }

    console.log("\nJ. Dubblett i uppsättningen avvisas");
    {
      let stoppad = false;
      try {
        await patch(surveyId, { questionIds: [qA, qA, qB] });
      } catch (e) {
        stoppad = e instanceof SurveyEditError && e.status === 400;
      }
      check("samma fråga två gånger ger 400", stoppad);
    }
  } finally {
    console.log("\nStädar...");
    if (surveyId) await prisma.survey.delete({ where: { id: surveyId } }).catch(() => {});
    if (otherCourseQuestionId)
      await prisma.question.delete({ where: { id: otherCourseQuestionId } }).catch(() => {});
    if (otherTopicId) await prisma.topic.delete({ where: { id: otherTopicId } }).catch(() => {});
    if (topicId) {
      await prisma.question.deleteMany({ where: { topicId } }).catch(() => {});
      await prisma.topic.delete({ where: { id: topicId } }).catch(() => {});
    }
    if (unitId) await prisma.unit.delete({ where: { id: unitId } }).catch(() => {});
    const rester = await prisma.topic.count({ where: { name: { startsWith: MARKER } } });
    const unitRester = await prisma.unit.count({ where: { title: { startsWith: MARKER } } });
    console.log(
      rester === 0 && unitRester === 0
        ? "Inget kvar efter testet."
        : `VARNING: ${rester} testämnen och ${unitRester} testmoment kvar!`
    );
    await prisma.$disconnect();
  }

  console.log(failures === 0 ? "\nAllt grönt." : `\n${failures} kontroller misslyckades.`);
  return failures;
}

main()
  .then((f) => process.exit(f === 0 ? 0 : 1))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
