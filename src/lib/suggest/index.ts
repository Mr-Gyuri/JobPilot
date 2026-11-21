import { getModel, isAIAvailable } from "@/lib/ai/client";
import { isAIFallbackError } from "@/lib/ai/errors";
import type { ParsedResume } from "@/lib/parsing/schema";
import { suggestSearchesWithAI } from "@/lib/suggest/ai-suggest";
import { suggestSearchesHeuristic } from "@/lib/suggest/heuristic-suggest";
import type { SuggestResult } from "@/lib/suggest/types";

export type { SearchSuggestion, SuggestResult } from "@/lib/suggest/types";

/**
 * Search queries derived from a resume, so the Keywords box does not have to be
 * guessed at. Useful mainly for someone who does not already know the titles
 * their own experience is posted under.
 *
 * Suggestions are never searched automatically: JSearch's free tier allows about
 * 200 requests a month, and firing six of them off the back of one button would
 * spend a fortnight's budget without being asked. The user picks one.
 */
export async function suggestSearches(
  resume: ParsedResume,
  opts: { targetTitles?: string[] } = {}
): Promise<SuggestResult> {
  if (isAIAvailable()) {
    try {
      const suggestions = await suggestSearchesWithAI(resume, opts);
      if (suggestions.length > 0) {
        return { suggestions, method: "ai", model: getModel() };
      }
      // An empty list after filtering is not worth surfacing; fall through.
    } catch (err) {
      if (!isAIFallbackError(err)) throw err;
      console.warn("AI search suggestions failed, using resume titles:", err);
    }
  }
  return {
    suggestions: suggestSearchesHeuristic(resume, opts),
    method: "keyword",
    model: null,
  };
}
