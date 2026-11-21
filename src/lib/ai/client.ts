import { isAIAvailable } from "@/lib/config";
import { modelFor, resolveProvider, type AiProvider } from "@/lib/ai/provider";

export { isAIAvailable, resolveProvider };
export type { AiProvider };

/**
 * The model that will actually be called, recorded on generated documents and
 * match analyses so the UI can show what produced them. Falls back to the
 * Anthropic default when nothing is configured — in which case nothing is called.
 */
export function getModel(): string {
  return modelFor(resolveProvider() ?? "anthropic");
}

/** Provider name for UI badges, or null when no key is configured. */
export function getProviderLabel(): string | null {
  const provider = resolveProvider();
  if (!provider) return null;
  return provider === "anthropic" ? "Anthropic" : "Google Gemini";
}
