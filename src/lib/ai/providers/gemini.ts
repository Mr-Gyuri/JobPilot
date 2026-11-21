import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { AIGenerationError, AIUnavailableError } from "@/lib/ai/errors";
import { apiKeyFor, modelFor } from "@/lib/ai/provider";

/**
 * Google Gemini backend, for the free tier.
 *
 * Gemini has no equivalent of Anthropic's zodOutputFormat helper, so the Zod
 * schema is converted to plain JSON Schema (zod v4 ships toJSONSchema) and
 * passed as responseJsonSchema, which the API constrains generation against.
 * The response body is JSON text rather than a parsed object, so it is parsed
 * here; validation against the schema happens in the shared caller.
 */

/**
 * Convert a JSON Schema into the subset Gemini's `responseJsonSchema` accepts.
 *
 * Two differences from what zod emits. `$schema` is not in Gemini's documented
 * keyword list, so it is dropped. And a `$ref` may not carry sibling keywords
 * there, so any reference is inlined — zod v4 happens to inline everything
 * already, but that is its choice, not a guarantee, and a dangling `$ref` would
 * fail the whole request.
 */
export function toGeminiSchema(schema: unknown): unknown {
  if (typeof schema !== "object" || schema === null) return schema;
  const root = schema as Record<string, unknown>;
  const defs = (root.$defs ?? root.definitions) as Record<string, unknown> | undefined;

  const walk = (node: unknown, depth: number): unknown => {
    if (Array.isArray(node)) return node.map((item) => walk(item, depth));
    if (typeof node !== "object" || node === null) return node;
    const obj = node as Record<string, unknown>;

    const ref = obj.$ref;
    if (typeof ref === "string" && defs) {
      // "#/$defs/Name" -> the definition itself, recursively resolved. Depth is
      // capped because a self-referential schema would otherwise never bottom out.
      const name = ref.split("/").pop();
      const target = name ? defs[name] : undefined;
      if (target && depth < 12) return walk(target, depth + 1);
      // Unresolvable or too deep: fall through to a permissive object so the
      // request is still valid rather than carrying a dangling $ref.
      return { type: "object" };
    }

    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (key === "$defs" || key === "definitions" || key === "$schema") continue;
      if (key === "additionalProperties" && value === false) {
        out[key] = false;
        continue;
      }
      out[key] = walk(value, depth);
    }
    return out;
  };

  return walk(root, 0);
}

/**
 * Whether a Gemini failure is worth retrying without changing anything about
 * the request — capacity is momentary, the prompt was not the problem. The
 * SDK throws ApiError with a numeric `status`; 503 is undocumented but observed
 * in practice ("This model is currently experiencing high demand"), 429 is
 * quota/rate-limit, and 500 is Google's generic server fault.
 */
export function isRetryableGeminiError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const status = (err as { status?: unknown }).status;
  if (status === 429 || status === 500 || status === 503) return true;
  return /\b(429|500|503)\b/.test(err.message) || /UNAVAILABLE|high demand/i.test(err.message);
}

/**
 * How long Gemini itself says to wait, in ms, when it tells us.
 *
 * A 429 carries `RetryInfo.retryDelay` ("31s") and names the limit it hit — the
 * free tier allows only a handful of requests per minute per model. Backing off
 * for a guessed second and trying again just spends another request against the
 * same window, so the server's own figure is used when present.
 */
export function retryDelayMsFrom(err: unknown): number | null {
  if (!(err instanceof Error)) return null;
  const seconds = err.message.match(/"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/);
  if (seconds) return Math.ceil(Number(seconds[1]) * 1000);
  const retryIn = err.message.match(/retry in (\d+(?:\.\d+)?)s/i);
  if (retryIn) return Math.ceil(Number(retryIn[1]) * 1000);
  return null;
}

/**
 * True when the failure is a per-minute/per-day quota rather than momentary
 * capacity. Waiting out a quota inside a single request would block the UI for
 * half a minute or more, so these fall straight through to the keyword path —
 * which is instant and always available.
 */
export function isQuotaError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return (
    (err as { status?: unknown }).status === 429 ||
    /RESOURCE_EXHAUSTED|exceeded your current quota|rate.?limit/i.test(err.message)
  );
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function generateGemini<T>(opts: {
  schema: z.ZodType<T>;
  system: string;
  user: string;
  maxTokens: number;
}): Promise<unknown> {
  const apiKey = apiKeyFor("gemini");
  if (!apiKey) throw new AIUnavailableError();
  const client = new GoogleGenAI({ apiKey });

  const jsonSchema = toGeminiSchema(z.toJSONSchema(opts.schema, { io: "output" }));

  // The Anthropic SDK retries transient failures itself (maxRetries: 2 in
  // providers/anthropic.ts); this SDK has no equivalent option, so the same
  // policy is implemented by hand — otherwise a single passing 503 fails the
  // whole feature instead of the brief wait it actually needed.
  //
  // A quota error is deliberately NOT retried. The free tier permits only a few
  // requests per minute per model, and generating documents makes three calls in
  // a row; retrying then spends more of the same window, turns one failure into
  // several, and would hold the request open for the 30s+ Gemini asks for. The
  // keyword path is instant, so it wins.
  const MAX_ATTEMPTS = 3;
  const RETRY_CEILING_MS = 4000;
  let response: Awaited<ReturnType<typeof client.models.generateContent>> | undefined;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      response = await client.models.generateContent({
        model: modelFor("gemini"),
        contents: opts.user,
        config: {
          systemInstruction: opts.system,
          maxOutputTokens: opts.maxTokens,
          responseMimeType: "application/json",
          responseJsonSchema: jsonSchema,
        },
      });
      break;
    } catch (err) {
      const advised = retryDelayMsFrom(err);
      const hopeless =
        attempt === MAX_ATTEMPTS ||
        !isRetryableGeminiError(err) ||
        isQuotaError(err) ||
        // Gemini asking for longer than we are willing to hold the request.
        (advised !== null && advised > RETRY_CEILING_MS);
      if (hopeless) throw err;
      await sleep(advised ?? 500 * 2 ** (attempt - 1)); // 500ms, then 1000ms
    }
  }
  if (!response) throw new AIGenerationError("api_error", "no response after retries");

  const finish = response.candidates?.[0]?.finishReason;
  // MAX_TOKENS is retried by the caller at a larger budget; SAFETY is a refusal.
  if (finish === "MAX_TOKENS") throw new AIGenerationError("truncated");
  if (finish === "SAFETY" || finish === "PROHIBITED_CONTENT" || finish === "BLOCKLIST") {
    throw new AIGenerationError("refused", `finishReason=${finish}`);
  }

  const text = response.text?.trim();
  if (!text) {
    throw new AIGenerationError("invalid_json", `empty response (finishReason=${finish ?? "none"})`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new AIGenerationError("invalid_json", `response was not valid JSON: ${text.slice(0, 120)}`);
  }
}
