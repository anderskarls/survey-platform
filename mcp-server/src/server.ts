import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { importQuestions } from "./tools/import-questions.js";
import { createSurvey } from "./tools/create-survey.js";
import { createQuizFromCsv } from "./tools/create-quiz-from-csv.js";
import { getResults } from "./tools/get-results.js";
import { summarizeResults } from "./tools/summarize-results.js";
import { getStudentProgress } from "./tools/get-student-progress.js";
import { getFreeTextAnswers, saveFeedback } from "./tools/give-feedback.js";
import { getRecentResponses } from "./tools/get-recent-responses.js";
import {
  postAssignmentFeedback,
  bulkPostAssignmentFeedback,
} from "./tools/post-assignment-feedback.js";
import { listTopics } from "./resources/topics.js";
import { getQuestionsByTopic } from "./resources/questions.js";
import { listCourses } from "./resources/courses.js";

const server = new McpServer({
  name: "survey-platform",
  version: "1.0.0",
});

// Tools

server.tool(
  "import_questions",
  "Importera frågor till en kurs frågebank från CSV-innehåll. CSV-format: topic,type,text,option1,option2,...",
  {
    course_id: z.number().int().positive().describe("Kursens ID"),
    csv_content: z.string().min(1).describe("CSV-innehåll med frågor"),
  },
  async ({ course_id, csv_content }) => {
    try {
      const result = await importQuestions(course_id, csv_content);
      return { content: [{ type: "text" as const, text: result }] };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Fel vid import: ${(error as Error).message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.tool(
  "create_survey",
  "Skapa en ny enkät eller quiz i en kurs från fråge-ID:n i frågebanken",
  {
    course_id: z.number().int().positive().describe("Kursens ID"),
    title: z.string().min(1).describe("Enkätens titel"),
    question_ids: z
      .array(z.number().int().positive())
      .min(1)
      .describe("Lista med fråge-ID:n att inkludera"),
    description: z.string().optional().describe("Valfri beskrivning"),
    mode: z
      .enum(["SURVEY", "QUIZ"])
      .default("SURVEY")
      .describe(
        "SURVEY = öppen enkät utan rätt/fel. QUIZ = rättas och eleven ser poäng/feedback. Default SURVEY."
      ),
    lock_mode: z
      .boolean()
      .default(false)
      .describe(
        "Provläge: registrerar om eleven byter fönster/flik under tiden. Default false."
      ),
  },
  async ({ course_id, title, question_ids, description, mode, lock_mode }) => {
    try {
      const result = await createSurvey(
        course_id,
        title,
        question_ids,
        description,
        mode,
        lock_mode
      );
      return { content: [{ type: "text" as const, text: result }] };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Fel vid skapande av enkät: ${(error as Error).message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.tool(
  "create_quiz_from_csv",
  "Importera frågor från CSV OCH skapa en quiz/enkät av exakt de frågorna i ett enda anrop. Använd detta när du vill skapa en quiz direkt från nygenererade frågor (t.ex. från en lektionsplanering) utan att först behöva ta reda på fråge-ID:n. Frågornas ordning i quizzen följer CSV-raderna. CSV-format: topic,type,text,option1,option2,...,correctAnswer",
  {
    course_id: z.number().int().positive().describe("Kursens ID"),
    title: z.string().min(1).describe("Quizzens/enkätens titel"),
    csv_content: z
      .string()
      .min(1)
      .describe("CSV-innehåll med frågorna som ska importeras och ingå"),
    description: z.string().optional().describe("Valfri beskrivning"),
    mode: z
      .enum(["SURVEY", "QUIZ"])
      .default("QUIZ")
      .describe(
        "QUIZ = rättas och eleven ser poäng/feedback. SURVEY = öppen enkät utan rätt/fel. Default QUIZ."
      ),
    lock_mode: z
      .boolean()
      .default(false)
      .describe(
        "Provläge: registrerar om eleven byter fönster/flik under tiden. Default false."
      ),
  },
  async ({ course_id, title, csv_content, description, mode, lock_mode }) => {
    try {
      const result = await createQuizFromCsv(
        course_id,
        title,
        csv_content,
        description,
        mode,
        lock_mode
      );
      return { content: [{ type: "text" as const, text: result }] };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Fel vid skapande av quiz från CSV: ${(error as Error).message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.tool(
  "get_results",
  "Hämta detaljerade resultat för en enkät",
  { survey_id: z.number().int().positive().describe("Enkätens ID") },
  async ({ survey_id }) => {
    try {
      const result = await getResults(survey_id);
      return { content: [{ type: "text" as const, text: result }] };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Fel vid hämtning av resultat: ${(error as Error).message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.tool(
  "summarize_results",
  "Hämta en sammanfattning av enkätresultat formaterad för AI-analys. Inkluderar procentfördelning för flerval och alla fritextsvar.",
  { survey_id: z.number().int().positive().describe("Enkätens ID") },
  async ({ survey_id }) => {
    try {
      const result = await summarizeResults(survey_id);
      return { content: [{ type: "text" as const, text: result }] };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Fel vid sammanfattning: ${(error as Error).message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.tool(
  "get_student_progress",
  "Hämta alla svar från en specifik elev över alla enkäter i en kurs. Användbart för att följa en elevs utveckling över tid.",
  {
    course_id: z.number().int().positive().describe("Kursens ID"),
    student_number: z.number().int().positive().describe("Elevens nummer"),
  },
  async ({ course_id, student_number }) => {
    try {
      const result = await getStudentProgress(course_id, student_number);
      return { content: [{ type: "text" as const, text: result }] };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Fel vid hämtning av elevprogression: ${(error as Error).message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.tool(
  "get_recent_responses",
  "Lista enkätsvar som kommit in de senaste dygnen, grupperade per enkät. Användbart för att snabbt se vilka enkäter som fått nya svar och av vilka elever. För själva svarsinnehållet, följ upp med get_results eller summarize_results.",
  {
    days: z
      .number()
      .int()
      .positive()
      .default(1)
      .describe("Antal dygn tillbaka från nu (default 1 = senaste 24h)"),
    course_id: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("Valfritt: filtrera på en specifik kurs"),
  },
  async ({ days, course_id }) => {
    try {
      const result = await getRecentResponses(days, course_id);
      return { content: [{ type: "text" as const, text: result }] };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Fel vid hämtning av senaste svar: ${(error as Error).message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.tool(
  "get_answers_for_feedback",
  "Hämta elevers fritextsvar som saknar feedback i en enkät. Returnerar svaren så du kan ge feedback, och sedan spara den med save_feedback.",
  {
    survey_id: z.number().int().positive().describe("Enkätens ID"),
    student_number: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("Valfritt: hämta bara svar från en specifik elev"),
  },
  async ({ survey_id, student_number }) => {
    try {
      const result = await getFreeTextAnswers(survey_id, student_number);
      return { content: [{ type: "text" as const, text: result }] };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Fel: ${(error as Error).message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.tool(
  "save_feedback",
  "Spara feedback på ett elevsvar. Använd efter att du genererat feedback med get_answers_for_feedback.",
  {
    answer_id: z.number().int().positive().describe("Svarets ID (answer_id från get_answers_for_feedback)"),
    feedback: z.string().min(1).describe("Feedbacktexten på svenska"),
  },
  async ({ answer_id, feedback }) => {
    try {
      const result = await saveFeedback(answer_id, feedback);
      return { content: [{ type: "text" as const, text: result }] };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Fel vid sparning: ${(error as Error).message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.tool(
  "post_assignment_feedback",
  "Posta fritextfeedback på en uppgift utanför plattformen (t.ex. uppsats, presentation) till en specifik elev. Eleven ser den i /student/feedback-fliken.",
  {
    course_code: z.string().min(1).describe("Kurskod (t.ex. SAM24A)"),
    student_number: z.number().int().positive().describe("Elevens nummer i kursen"),
    title: z.string().min(1).describe("Uppgiftens titel (t.ex. \"Uppsats om imperialismen\")"),
    content: z.string().min(1).describe("Feedbacktexten (fritext, gärna utförlig)"),
  },
  async ({ course_code, student_number, title, content }) => {
    try {
      const result = await postAssignmentFeedback(course_code, student_number, title, content);
      return { content: [{ type: "text" as const, text: result }] };
    } catch (error) {
      return {
        content: [
          { type: "text" as const, text: `Fel: ${(error as Error).message}` },
        ],
        isError: true,
      };
    }
  }
);

server.tool(
  "bulk_post_assignment_feedback",
  "Posta fritextfeedback till flera elever i samma kurs i ett anrop. Använd när du just rättat hela klassens uppgift.",
  {
    course_code: z.string().min(1).describe("Kurskod (t.ex. SAM24A)"),
    items: z
      .array(
        z.object({
          student_number: z.number().int().positive(),
          title: z.string().min(1),
          content: z.string().min(1),
        })
      )
      .min(1)
      .describe("Array av feedback-poster, en per elev"),
  },
  async ({ course_code, items }) => {
    try {
      const result = await bulkPostAssignmentFeedback(course_code, items);
      return { content: [{ type: "text" as const, text: result }] };
    } catch (error) {
      return {
        content: [
          { type: "text" as const, text: `Fel: ${(error as Error).message}` },
        ],
        isError: true,
      };
    }
  }
);

// Resources

server.resource(
  "courses",
  "survey://courses",
  { description: "Lista alla kurser" },
  async () => {
    try {
      const result = await listCourses();
      return {
        contents: [
          {
            uri: "survey://courses",
            text: result,
            mimeType: "application/json",
          },
        ],
      };
    } catch (error) {
      return {
        contents: [
          {
            uri: "survey://courses",
            text: JSON.stringify({
              error: `Fel: ${(error as Error).message}`,
            }),
            mimeType: "application/json",
          },
        ],
      };
    }
  }
);

server.resource(
  "topics",
  "survey://courses/{courseId}/topics",
  { description: "Lista alla ämnen i en kurs med antal frågor" },
  async (uri) => {
    try {
      const match = uri.href.match(/courses\/(\d+)\/topics/);
      if (!match) {
        return {
          contents: [
            {
              uri: uri.href,
              text: JSON.stringify({ error: "Ogiltigt kurs-ID i URI" }),
              mimeType: "application/json",
            },
          ],
        };
      }
      const courseId = Number(match[1]);
      const result = await listTopics(courseId);
      return {
        contents: [
          { uri: uri.href, text: result, mimeType: "application/json" },
        ],
      };
    } catch (error) {
      return {
        contents: [
          {
            uri: uri.href,
            text: JSON.stringify({
              error: `Fel: ${(error as Error).message}`,
            }),
            mimeType: "application/json",
          },
        ],
      };
    }
  }
);

server.resource(
  "questions-template",
  "survey://topics/{topicId}/questions",
  { description: "Hämta alla frågor inom ett visst ämne" },
  async (uri) => {
    try {
      const match = uri.href.match(/topics\/(\d+)\/questions/);
      if (!match) {
        return {
          contents: [
            {
              uri: uri.href,
              text: JSON.stringify({ error: "Ogiltigt ämnes-ID i URI" }),
              mimeType: "application/json",
            },
          ],
        };
      }
      const topicId = Number(match[1]);
      const result = await getQuestionsByTopic(topicId);
      return {
        contents: [
          { uri: uri.href, text: result, mimeType: "application/json" },
        ],
      };
    } catch (error) {
      return {
        contents: [
          {
            uri: uri.href,
            text: JSON.stringify({
              error: `Fel: ${(error as Error).message}`,
            }),
            mimeType: "application/json",
          },
        ],
      };
    }
  }
);

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Survey MCP server running on stdio");
}

main().catch(console.error);
