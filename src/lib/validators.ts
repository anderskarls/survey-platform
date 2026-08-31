import { z } from "zod";
import { SUBSKILLS, exemplarsSchema, sortingConfigSchema } from "@/lib/formaga";
import { clozeConfigSchema, hasGap, isClozeType } from "@/lib/cloze";

export const QUESTION_TYPES = [
  "MULTIPLE_CHOICE",
  "FREE_TEXT",
  "REFLECTION",
  "SORTING",
  "CLOZE",
  "CLOZE_CARD",
] as const;

// Sorterings- och luckfrågor delar config-kolumn men har olika form. Unionen
// avgör vilken det är på innehållet; superRefine nedan kontrollerar sedan att
// formen matchar frågans typ, så en luckfråga inte kan sparas med en
// sorteringskonfiguration.
const questionConfigSchema = z.union([sortingConfigSchema, clozeConfigSchema]);

export const respondSchema = z.object({
  answers: z
    .array(
      z.object({
        questionId: z.number().int().positive(),
        // Tomt värde tillåts: formuläret skickar varje visad fråga, även de
        // obesvarade, så att servern kan rätta det tomma som fel i ett prov.
        // Se blank-answer.ts - vad som faktiskt sparas avgörs där, inte här.
        value: z.string().max(20000, "Svaret är för långt"),
      })
    )
    .min(1, "Minst ett svar krävs"),
  lockModeViolations: z.number().int().min(0).max(1000).optional(),
});

export const courseSettingsSchema = z.object({
  flashcardMode: z.boolean(),
});

export const practiceAttemptSchema = z.object({
  questionId: z.number().int().positive(),
  value: z.string().min(1, "Svar krävs").max(6000, "Svaret är för långt"),
});

// Självskattning: 2=Svårt, 3=Bra, 4=Lätt (ts-fsrs Rating). För rätta svar
// sätts "Om igen" (1) alltid av servern och kan inte väljas; för fritext-
// övningar (självbedömning mot exempelsvar) är alla fyra betygen tillåtna.
export const practiceGradeSchema = z.object({
  attemptId: z.number().int().positive(),
  grade: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
});

export const createCourseSchema = z.object({
  name: z
    .string()
    .min(1, "Namn krävs")
    .max(100)
    .transform((s) => s.trim()),
});

export const createSurveySchema = z.object({
  title: z
    .string()
    .min(1, "Titel krävs")
    .max(200)
    .transform((s) => s.trim()),
  description: z
    .string()
    .max(1000)
    .optional()
    .default("")
    .transform((s) => s.trim()),
  mode: z.enum(["SURVEY", "QUIZ"]).optional().default("SURVEY"),
  lockMode: z.boolean().optional().default(false),
  questionIds: z
    .array(z.number().int().positive())
    .min(1, "Välj minst en fråga"),
  courseId: z.number().int().positive().optional(),
});

/**
 * Redigering av en befintlig enkät. Allt är valfritt - det som inte skickas
 * med lämnas orört, så en titeländring inte råkar nollställa släpptiden.
 *
 * `questionIds` är hela den ordnade uppsättningen, inte ett tillägg: listan är
 * facit för vilka frågor enkäten innehåller och i vilken ordning. Att lyfta ur
 * en fråga som har elevsvar kräver `confirmRemoval` - se survey-edit.ts.
 */
export const updateSurveySchema = z
  .object({
    title: z
      .string()
      .min(1, "Titel krävs")
      .max(200)
      .transform((s) => s.trim())
      .optional(),
    description: z
      .string()
      .max(1000)
      .transform((s) => s.trim())
      .optional(),
    mode: z.enum(["SURVEY", "QUIZ"]).optional(),
    lockMode: z.boolean().optional(),
    unitId: z.number().int().positive().nullable().optional(),
    lesson: z.number().int().min(1).max(200).nullable().optional(),
    openAt: z.string().datetime().nullable().optional(),
    questionIds: z
      .array(z.number().int().positive())
      .min(1, "En enkät behöver minst en fråga")
      .max(500)
      .optional(),
    // Lärarens kvittering av att svar försvinner ur resultaten.
    confirmRemoval: z.boolean().optional().default(false),
  })
  .superRefine((data, ctx) => {
    const changed = [
      data.title,
      data.description,
      data.mode,
      data.lockMode,
      data.unitId,
      data.lesson,
      data.openAt,
      data.questionIds,
    ].some((v) => v !== undefined);
    if (!changed) {
      ctx.addIssue({ code: "custom", message: "Inget att uppdatera" });
    }
  });

export type UpdateSurveyInput = z.infer<typeof updateSurveySchema>;

export const createTopicSchema = z.object({
  name: z
    .string()
    .min(1, "Namn krävs")
    .max(100)
    .transform((s) => s.trim()),
});

export const createQuestionSchema = z.object({
  text: z
    .string()
    .min(1, "Frågetext krävs")
    .max(1000)
    .transform((s) => s.trim()),
  type: z.enum(QUESTION_TYPES),
  topicId: z.number().int().positive(),
  options: z.array(z.string()).optional(),
  correctOptionIndex: z.number().int().min(0).optional(),
  subskill: z.enum(SUBSKILLS).optional(),
  config: questionConfigSchema.optional(),
  exemplars: exemplarsSchema.optional(),
}).superRefine((data, ctx) => {
  if (!isClozeType(data.type)) return;
  const parsed = clozeConfigSchema.safeParse(data.config);
  if (!parsed.success) {
    ctx.addIssue({
      code: "custom",
      path: ["config"],
      message: "Luckfrågor kräver en config med facit (answer)",
    });
  }
  if (!hasGap(data.text)) {
    ctx.addIssue({
      code: "custom",
      path: ["text"],
      message: 'Luckfrågans mening måste innehålla markören ___ där ordet ska stå',
    });
  }
});

// Alternativ som redan finns skickas med sitt id - då kan texten ändras utan
// att kopplingen till elevernas lagrade svar tappas. Utan id skapas ett nytt.
const questionOptionInputSchema = z.object({
  id: z.number().int().positive().optional(),
  text: z
    .string()
    .min(1, "Alternativtext krävs")
    .max(500)
    .transform((s) => s.trim()),
  isCorrect: z.boolean().optional().default(false),
});

export const updateQuestionSchema = z
  .object({
    text: z
      .string()
      .min(1, "Frågetext krävs")
      .max(1000)
      .transform((s) => s.trim())
      .optional(),
    type: z.enum(QUESTION_TYPES).optional(),
    topicId: z.number().int().positive().optional(),
    options: z.array(questionOptionInputSchema).max(10).optional(),
    subskill: z.enum(SUBSKILLS).nullable().optional(),
    config: questionConfigSchema.optional(),
    exemplars: exemplarsSchema.optional(),
    // Lärarens kvittering av att tidigare elevsvar rättas om.
    confirmRegrade: z.boolean().optional().default(false),
  })
  .superRefine((data, ctx) => {
    const changed = [
      data.text,
      data.type,
      data.topicId,
      data.options,
      data.subskill,
      data.config,
      data.exemplars,
    ].some((v) => v !== undefined);
    if (!changed) {
      ctx.addIssue({ code: "custom", message: "Inget att uppdatera" });
    }
    if (!data.options) return;
    const texts = data.options.map((o) => o.text);
    if (new Set(texts).size !== texts.length) {
      ctx.addIssue({
        code: "custom",
        path: ["options"],
        message: "Alternativen måste ha olika text",
      });
    }
    if (data.options.filter((o) => o.isCorrect).length > 1) {
      ctx.addIssue({
        code: "custom",
        path: ["options"],
        message: "Bara ett alternativ kan vara rätt svar",
      });
    }
  });

export type UpdateQuestionInput = z.infer<typeof updateQuestionSchema>;

export const importCsvSchema = z.object({
  csvContent: z.string().min(1, "CSV-innehåll krävs").max(1_000_000, "CSV-filen är för stor (max 1MB)"),
});

export const studentLoginSchema = z.object({
  username: z
    .string()
    .min(1, "Användarnamn krävs")
    .max(50)
    .transform((s) => s.trim()),
  password: z.string().min(1, "Lösenord krävs"),
});

export const createStudentsSchema = z
  .union([
    z.object({
      numbers: z.array(z.number().int().positive()).min(1),
    }),
    z.object({
      count: z.number().int().positive().max(200),
    }),
    z.object({
      number: z.number().int().positive(),
    }),
  ])
  .and(
    z.object({
      // Länka nya konton till samma elevnummer i en annan kurs (samma fysiska elev)
      linkCourseId: z.number().int().positive().optional(),
      // Lärarens provkonto: skapas som elev men räknas inte i klassaggregaten
      isTest: z.boolean().optional(),
    })
  );

export const studentSwitchSchema = z.object({
  courseId: z.number().int().positive(),
});

// Lärarens väg in i elevvyn (adminvyns "Visa som elev")
export const studentImpersonateSchema = z.object({
  courseId: z.number().int().positive(),
});

export const submitPracticeFeedbackSchema = z.object({
  feedbacks: z
    .array(
      z.object({
        attempt_id: z.number().int().positive(),
        feedback: z
          .string()
          .min(1, "Feedback krävs")
          .max(2000, "Feedbacken är för lång (max 2000 tecken)"),
      })
    )
    .min(1, "Minst en feedback krävs")
    .max(200, "Max 200 feedbacks per anrop"),
});

export const createAssignmentFeedbackSchema = z.object({
  feedbacks: z
    .array(
      z.object({
        student_number: z.number().int().positive(),
        title: z
          .string()
          .min(1, "Titel krävs")
          .max(200)
          .transform((s) => s.trim()),
        content: z
          .string()
          .min(1, "Innehåll krävs")
          .max(10000, "Feedbacken är för lång (max 10000 tecken)"),
      })
    )
    .min(1, "Minst en feedback krävs")
    .max(200, "Max 200 feedbacks per anrop"),
});

const lessonOutlineSchema = z.object({
  n: z.number().int(),
  title: z.string().min(1, "Lektionstitel krävs").max(300).transform((s) => s.trim()),
  note: z.string().max(2000).optional(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Datum måste vara YYYY-MM-DD")
    .optional(),
  week: z.string().max(50).optional(),
});

export const importMomentSchema = z.object({
  title: z.string().min(1, "Titel krävs").max(200).transform((s) => s.trim()),
  description: z
    .string()
    .max(2000)
    .optional()
    .default("")
    .transform((s) => s.trim()),
  period: z
    .string()
    .max(200)
    .optional()
    .transform((s) => (s && s.trim() ? s.trim() : undefined)),
  goals: z
    .array(z.string().max(500).transform((s) => s.trim()))
    .optional()
    .default([]),
  lessons: z.array(lessonOutlineSchema).optional().default([]),
  assignments: z
    .array(
      z.object({
        title: z.string().min(1, "Uppgiftstitel krävs").max(200).transform((s) => s.trim()),
        csvContent: z
          .string()
          .min(1, "CSV-innehåll krävs")
          .max(1_000_000, "CSV-filen är för stor (max 1MB)"),
        lesson: z.number().int().optional(),
        mode: z.enum(["SURVEY", "QUIZ"]).optional().default("QUIZ"),
        lockMode: z.boolean().optional().default(false),
      })
    )
    .min(1, "Minst en uppgift krävs"),
});

export const createQuizFromCsvSchema = z.object({
  title: z.string().min(1, "Titel krävs").max(200).transform((s) => s.trim()),
  csvContent: z
    .string()
    .min(1, "CSV-innehåll krävs")
    .max(1_000_000, "CSV-filen är för stor (max 1MB)"),
  description: z
    .string()
    .max(1000)
    .optional()
    .default("")
    .transform((s) => s.trim()),
  mode: z.enum(["SURVEY", "QUIZ"]).optional().default("QUIZ"),
  lockMode: z.boolean().optional().default(false),
});
