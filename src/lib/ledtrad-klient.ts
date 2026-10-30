import Anthropic from "@anthropic-ai/sdk";
import type { LedtradKlient } from "@/lib/ledtrad";

/**
 * Den riktiga klienten bakom LedtradKlient. Ligger i en egen fil så att
 * ledtrad.ts (och dess tester) inte drar in SDK:n. Nyckeln läses ur
 * ANTHROPIC_API_KEY av SDK:n själv.
 */
export function skapaLedtradKlient(): LedtradKlient {
  const anthropic = new Anthropic({ timeout: 20_000, maxRetries: 1 });
  return {
    beta: {
      messages: {
        create: (params) =>
          anthropic.beta.messages.create(
            params as unknown as Anthropic.Beta.MessageCreateParamsNonStreaming
          ) as unknown as ReturnType<LedtradKlient["beta"]["messages"]["create"]>,
      },
    },
  };
}
