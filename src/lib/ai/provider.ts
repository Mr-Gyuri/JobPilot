import { getConfigValue } from "@/lib/config";

/**
 * Which AI backend to use. Both speak the same internal contract
 * (lib/ai/structured.ts), so every feature works identically on either — the
 * provider only changes the transport, not the behaviour.
 *
 * Anthropic produces better results; Gemini has a free tier. Whichever key is
 * present wins, and Anthropic wins when both are set, on the grounds that
 * someone paying for it means to use it.
 */
export type AiProvider = "anthropic" | "gemini";

const DEFAULT_MODEL: Record<AiProvider, string> = {
  anthropic: "claude-opus-5",
  // flash-lite rather than flash, chosen on the free tier's rate limit rather
  // than on capability. Generating documents fires several calls back to back,
  // and gemini-3.5-flash allows only 5 requests per minute per model on the free
  // tier — measured: it 429s mid-generation, so the tailored resume silently
  // arrives from the keyword path. flash-lite absorbed 9 consecutive requests
  // without throttling. Override with AI_MODEL if you have paid quota.
  gemini: "gemini-3.1-flash-lite",
};

/** Model-name prefix per provider, used to tell a stale override from a live one. */
const MODEL_PREFIX: Record<AiProvider, string> = {
  anthropic: "claude",
  gemini: "gemini",
};

export function resolveProvider(): AiProvider | null {
  if (getConfigValue("ANTHROPIC_API_KEY")) return "anthropic";
  if (getConfigValue("GEMINI_API_KEY")) return "gemini";
  return null;
}

export function apiKeyFor(provider: AiProvider): string | undefined {
  return getConfigValue(provider === "anthropic" ? "ANTHROPIC_API_KEY" : "GEMINI_API_KEY");
}

/**
 * The model to call.
 *
 * AI_MODEL is a single setting shared by both providers, so a value left over
 * from the other one would be sent to an API that has never heard of it. An
 * override is therefore honoured only when it names a model of the active
 * provider; otherwise that provider's default is used.
 */
export function modelFor(provider: AiProvider): string {
  const override = getConfigValue("AI_MODEL")?.trim();
  if (override && override.toLowerCase().startsWith(MODEL_PREFIX[provider])) {
    return override;
  }
  return DEFAULT_MODEL[provider];
}

export function defaultModelFor(provider: AiProvider): string {
  return DEFAULT_MODEL[provider];
}
