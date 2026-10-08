import { lasbartSvar } from "./tabellsvar.js";
import "dotenv/config";
import express from "express";
import { timingSafeEqual } from "node:crypto";
import { prisma } from "./prisma.js";

const PORT = Number(process.env.MCP_HTTP_PORT) || 3002;
const HOST = process.env.MCP_HTTP_HOST || "127.0.0.1";
const TOKEN = process.env.MCP_HTTP_TOKEN;

if (!TOKEN) {
  console.error(
    "FATAL: MCP_HTTP_TOKEN saknas i miljön. Sätt den i mcp-server/.env innan servern startas."
  );
  process.exit(1);
}

const app = express();

app.use(express.json({ limit: "100kb" }));

// Bearer-token authentication (skipped for /health)
app.use((req, res, next) => {
  if (req.path === "/health") return next();

  const header = req.header("authorization") ?? "";
  const match = header.match(/^Bearer (.+)$/);
  if (!match) {
    return res.status(401).json({ error: "Bearer-token krävs" });
  }

  const provided = Buffer.from(match[1]);
  const expected = Buffer.from(TOKEN);
  if (
    provided.length !== expected.length ||
    !timingSafeEqual(provided, expected)
  ) {
    return res.status(401).json({ error: "Ogiltig token" });
  }

  next();
});

// Health check (unauthenticated)
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "survey-mcp-server" });
});

// Get feedback for a specific answer
app.get("/feedback/:answerId", async (req, res) => {
  try {
    const answerId = Number(req.params.answerId);
    if (isNaN(answerId)) {
      return res.status(400).json({ error: "Ogiltigt answer ID" });
    }

    const answer = await prisma.answer.findUnique({
      where: { id: answerId },
      select: { feedback: true },
    });

    if (!answer) {
      return res.status(404).json({ error: "Svar hittades inte" });
    }

    res.json({ feedback: answer.feedback });
  } catch (error) {
    console.error("Feedback fetch error:", error);
    res.status(500).json({ error: "Kunde inte hämta feedback" });
  }
});

// Save feedback for a specific answer (called by external tools)
app.post("/feedback/:answerId", async (req, res) => {
  try {
    const answerId = Number(req.params.answerId);
    if (isNaN(answerId)) {
      return res.status(400).json({ error: "Ogiltigt answer ID" });
    }

    const { feedback } = req.body;
    if (!feedback || typeof feedback !== "string") {
      return res.status(400).json({ error: "feedback (string) krävs" });
    }

    const answer = await prisma.answer.findUnique({
      where: { id: answerId },
    });

    if (!answer) {
      return res.status(404).json({ error: "Svar hittades inte" });
    }

    await prisma.answer.update({
      where: { id: answerId },
      data: { feedback },
    });

    res.json({ success: true, feedback });
  } catch (error) {
    console.error("Feedback save error:", error);
    res.status(500).json({ error: "Kunde inte spara feedback" });
  }
});

// List free-text answers without feedback for a survey
app.get("/feedback/pending/:surveyId", async (req, res) => {
  try {
    const surveyId = Number(req.params.surveyId);
    if (isNaN(surveyId)) {
      return res.status(400).json({ error: "Ogiltigt survey ID" });
    }

    const answers = await prisma.answer.findMany({
      where: {
        response: { surveyId },
        question: { type: { in: ["FREE_TEXT", "TABLE"] } },
        feedback: null,
      },
      include: {
        question: { include: { topic: true } },
        response: { include: { student: true } },
      },
    });

    res.json({
      count: answers.length,
      answers: answers.map((a) => ({
        answerId: a.id,
        studentNumber: a.response.student.number,
        topic: a.question.topic.name,
        question: a.question.text,
        answer: lasbartSvar(a.value),
      })),
    });
  } catch (error) {
    console.error("Pending feedback error:", error);
    res.status(500).json({ error: "Kunde inte hämta svar" });
  }
});

app.listen(PORT, HOST, () => {
  console.log(`MCP HTTP server running on http://${HOST}:${PORT}`);
  console.log(`Bearer-token auth aktiv (MCP_HTTP_TOKEN)`);
});
