export class AIUnavailableError extends Error {
  constructor() {
    super("No AI provider configured (set an Anthropic or Gemini API key)");
    this.name = "AIUnavailableError";
  }
}

export type AIFailureReason = "refused" | "invalid_json" | "api_error" | "truncated";

export class AIGenerationError extends Error {
  reason: AIFailureReason;
  constructor(reason: AIFailureReason, detail?: string) {
    super(`AI generation failed (${reason})${detail ? `: ${detail}` : ""}`);
    this.name = "AIGenerationError";
    this.reason = reason;
  }
}

/** True for any error where falling back to the heuristic path is the right move. */
export function isAIFallbackError(err: unknown): boolean {
  return err instanceof AIUnavailableError || err instanceof AIGenerationError || isApiError(err);
}

function isApiError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return (
    // Anthropic SDK errors carry a status, or are named connection errors.
    "status" in err ||
    err.name === "APIConnectionError" ||
    err.name === "APIConnectionTimeoutError" ||
    err.name === "APIUserAbortError" ||
    // The Google SDK throws ApiError / ClientError / ServerError, and surfaces
    // quota exhaustion as a 429 inside the message rather than a status field.
    err.name === "ApiError" ||
    err.name === "ClientError" ||
    err.name === "ServerError" ||
    /\b(4\d\d|5\d\d)\b/.test(err.message) ||
    /quota|rate limit|RESOURCE_EXHAUSTED|API key/i.test(err.message)
  );
}
