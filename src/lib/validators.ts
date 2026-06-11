import { z } from "zod";

export const respondSchema = z.object({
  answers: z
    .array(
      z.object({
        questionId: z.number().int().positive(),
        value: z.string().min(1, "Svar krävs").max(20000, "Svaret är för långt"),
      })
    )
    .min(1, "Minst ett svar krävs"),
  lockModeViolations: z.number().int().min(0).max(1000).optional(),
});

export const practiceAttemptSchema = z.object({
  questionId: z.number().int().positive(),
  value: z.string().min(1, "Svar krävs").max(2000, "Svaret är för långt"),
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
  type: z.enum(["MULTIPLE_CHOICE", "FREE_TEXT"]),
  topicId: z.number().int().positive(),
  options: z.array(z.string()).optional(),
  correctOptionIndex: z.number().int().min(0).optional(),
});

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

export const createStudentsSchema = z.union([
  z.object({
    numbers: z.array(z.number().int().positive()).min(1),
  }),
  z.object({
    count: z.number().int().positive().max(200),
  }),
  z.object({
    number: z.number().int().positive(),
  }),
]);

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
