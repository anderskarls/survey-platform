import {
  KVALITETSSPRANG,
  SUBSKILL_CRITERIA,
  Subskill,
} from "@/lib/formaga";

/**
 * Realtids-AI-feedback på fritextövningar i förmågeträningen.
 *
 * Regler (från utvecklingsplanen, ej förhandlingsbara):
 * - En styrka + EN konkret framåtriktad förbättring, läsbar på ca 15 sekunder.
 * - Aldrig nivåord ("E-nivå", "godtagbart", "N1" osv) i elevvänd text.
 * - Förbättringen pekar mot det tidigaste kvalitetssprång eleven inte tagit.
 * - Ingen elevidentitet skickas någonsin till modellen.
 * - Misslyckas anropet fortsätter övningen utan AI-feedback (null).
 */

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "anthropic/claude-haiku-4.5";
const TIMEOUT_MS = 20_000;

export interface FeedbackInput {
  questionText: string;
  subskill: Subskill;
  answer: string;
}

function buildSystemPrompt(subskill: Subskill): string | null {
  const criteria = SUBSKILL_CRITERIA[subskill];
  if (!criteria) return null;

  return [
    "Du ger återkoppling på en gymnasieelevs övningssvar i historia (orsaks- och konsekvensresonemang).",
    "",
    `Delfärdigheten som övas: ${criteria.beskrivning}`,
    "",
    "Kvalitetsnivåer (endast för din bedömning - nämn ALDRIG nivåer eller värdeord för eleven):",
    `- Grundnivå: ${criteria.nivaer.n1}`,
    `- Utvecklad: ${criteria.nivaer.n2}`,
    `- Avancerad: ${criteria.nivaer.n3}`,
    "",
    "Typiska svagheter, i prioritetsordning (rikta din förbättring mot den TIDIGASTE du hittar):",
    ...criteria.svagheter.map((s, i) => `${i + 1}. ${s}`),
    "",
    "Kvalitetssprången (din förbättring pekar mot det tidigaste språng eleven inte tagit):",
    ...KVALITETSSPRANG.map((s, i) => `${i + 1}. ${s}`),
    "",
    "Svara på svenska med EXAKT detta format, inget annat:",
    "Styrka: <en mening om något specifikt i svaret som fungerar - citera eller peka konkret>",
    "Nästa steg: <EN konkret handling eleven kan göra direkt för att lyfta just detta svar>",
    "",
    "Hela svaret ska gå att läsa på 15 sekunder. Inga betyg, inga nivåord, inga omdömen om eleven som person. Kommentera resonemangets struktur, inte stavning eller stil.",
  ].join("\n");
}

/**
 * Genererar feedback via OpenRouter. Returnerar null om nyckel saknas,
 * delfärdigheten saknar kriterier, eller anropet misslyckas/tar för lång tid.
 */
export async function generateAiFeedback(
  input: FeedbackInput
): Promise<string | null> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;

  const systemPrompt = buildSystemPrompt(input.subskill);
  if (!systemPrompt) return null;

  const model = process.env.AI_FEEDBACK_MODEL || DEFAULT_MODEL;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: 300,
        temperature: 0.3,
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: `Uppgift: ${input.questionText}\n\nElevens svar:\n${input.answer}`,
          },
        ],
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      console.error(`AI-feedback: OpenRouter svarade ${res.status}`);
      return null;
    }

    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = data.choices?.[0]?.message?.content?.trim();
    return content && content.length > 0 ? content : null;
  } catch (error) {
    console.error("AI-feedback misslyckades:", error);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
