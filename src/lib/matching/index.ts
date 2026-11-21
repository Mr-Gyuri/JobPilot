import { getModel, isAIAvailable } from "@/lib/ai/client";
import { isAIFallbackError } from "@/lib/ai/errors";
import { analyzeMatchWithAI } from "@/lib/matching/ai-matcher";
import { analyzeMatchHeuristic } from "@/lib/matching/heuristic-matcher";
import type { ParsedResume } from "@/lib/parsing/schema";

export interface MatchResult {
  score: number;
  summary: string | null;
  matchedKeywords: string[];
  missingKeywords: string[];
  strengths: string[];
  gaps: string[];
  suggestions: string[];
  method: "ai" | "keyword";
  model: string | null;
}

export interface MatchJobInput {
  title: string;
  company: string | null;
  text: string;
  /** Excluded from keyword extraction — a place is not a requirement. */
  location?: string | null;
}

export async function analyzeMatch(
  resume: ParsedResume,
  job: MatchJobInput
): Promise<MatchResult> {
  if (isAIAvailable()) {
    try {
      const ai = await analyzeMatchWithAI(resume, job);
      return { ...ai, method: "ai", model: getModel() };
    } catch (err) {
      if (!isAIFallbackError(err)) throw err;
      console.warn("AI match analysis failed, using keyword analysis:", err);
    }
  }
  return { ...analyzeMatchHeuristic(resume, job), method: "keyword", model: null };
}
