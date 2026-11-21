import type { z } from "zod";
import { AIGenerationError, AIUnavailableError } from "@/lib/ai/errors";
import { resolveProvider } from "@/lib/ai/provider";
import { generateAnthropic } from "@/lib/ai/providers/anthropic";
import { generateGemini } from "@/lib/ai/providers/gemini";

export interface StructuredRequest<T> {
  schema: z.ZodType<T>;
  schemaName: string;
  system: string;
  user: string;
  maxTokens?: number;
}

/**
 * Single JSON-mode entry point for every AI feature, over whichever provider is
 * configured. Each backend constrains generation against the schema server-side
 * and returns a parsed object; the retry policy and final validation live here
 * so both behave identically:
 *
 *  - truncated  -> one retry at double the token budget
 *  - bad schema -> one retry with the validation errors fed back
 *
 * Anything else propagates, and every caller falls back to its heuristic path.
 */
export async function generateStructured<T>(req: StructuredRequest<T>): Promise<T> {
  const provider = resolveProvider();
  if (!provider) throw new AIUnavailableError();
  const maxTokens = req.maxTokens ?? 8192;

  const attempt = async (tokens: number, repairNote?: string): Promise<T> => {
    const user = repairNote ? `${req.user}\n\n${repairNote}` : req.user;
    const opts = { schema: req.schema, system: req.system, user, maxTokens: tokens };
    const raw =
      provider === "anthropic" ? await generateAnthropic(opts) : await generateGemini(opts);

    const check = req.schema.safeParse(raw);
    if (!check.success) {
      throw new AIGenerationError("invalid_json", summarizeZodError(check.error));
    }
    return check.data;
  };

  try {
    return await attempt(maxTokens);
  } catch (err) {
    if (err instanceof AIGenerationError && err.reason === "truncated") {
      return attempt(Math.min(maxTokens * 2, 16384));
    }
    if (err instanceof AIGenerationError && err.reason === "invalid_json") {
      return attempt(
        maxTokens,
        `Note: your previous attempt produced JSON that failed validation (${err.message}). Return corrected JSON that satisfies the schema exactly.`
      );
    }
    throw err;
  }
}

function summarizeZodError(error: z.ZodError): string {
  return error.issues
    .slice(0, 5)
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("; ");
}
