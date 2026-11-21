import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import { AIGenerationError, AIUnavailableError } from "@/lib/ai/errors";
import { apiKeyFor, modelFor } from "@/lib/ai/provider";

/**
 * Anthropic backend. Uses structured outputs (output_config.format), which
 * constrains generation server-side. No temperature (rejected on Claude 5
 * models) and no assistant prefill (also rejected).
 */
export async function generateAnthropic<T>(opts: {
  schema: z.ZodType<T>;
  system: string;
  user: string;
  maxTokens: number;
}): Promise<unknown> {
  const apiKey = apiKeyFor("anthropic");
  if (!apiKey) throw new AIUnavailableError();
  const client = new Anthropic({ apiKey, maxRetries: 2, timeout: 120_000 });

  const response = await client.messages.parse({
    model: modelFor("anthropic"),
    max_tokens: opts.maxTokens,
    system: opts.system,
    messages: [{ role: "user", content: opts.user }],
    output_config: { format: zodOutputFormat(opts.schema) },
  });

  if (response.stop_reason === "refusal") throw new AIGenerationError("refused");
  if (response.stop_reason === "max_tokens") throw new AIGenerationError("truncated");

  const parsed = response.parsed_output;
  if (parsed == null) {
    throw new AIGenerationError("invalid_json", "parsed_output was null");
  }
  return parsed;
}
