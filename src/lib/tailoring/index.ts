import { isAIAvailable } from "@/lib/ai/client";
import { isAIFallbackError } from "@/lib/ai/errors";
import { tailorResumeWithAI } from "@/lib/tailoring/ai-tailor";
import { tailorResumeHeuristic } from "@/lib/tailoring/heuristic-tailor";
import { validateTailoredResume } from "@/lib/tailoring/validate";
import type { ParsedResume } from "@/lib/parsing/schema";

export { generateCoverLetter } from "@/lib/tailoring/cover-letter";
export type { CoverLetterResult } from "@/lib/tailoring/cover-letter";

export interface TailoringResult {
  resume: ParsedResume;
  changes: string[];
  warnings: string[];
  method: "ai" | "heuristic";
}

export interface TailorJobInput {
  title: string;
  company: string | null;
  text: string;
}

/**
 * AI tailoring gated by the anti-fabrication validator: one constrained retry
 * on violations, then a fall back to the reorder-only heuristic path, which
 * cannot fabricate by construction.
 */
export async function tailorResume(
  master: ParsedResume,
  job: TailorJobInput,
  matchHints?: { matched: string[]; missing: string[] }
): Promise<TailoringResult> {
  if (isAIAvailable()) {
    try {
      let attempt = await tailorResumeWithAI(master, job, matchHints);
      let report = validateTailoredResume(master, attempt.resume);

      if (!report.ok) {
        console.warn("Tailored resume failed validation, retrying:", report.errors);
        attempt = await tailorResumeWithAI(master, job, matchHints, report.errors);
        report = validateTailoredResume(master, attempt.resume);
      }

      if (report.ok) {
        return {
          resume: attempt.resume,
          changes: attempt.changes,
          warnings: report.warnings,
          method: "ai",
        };
      }

      const fallback = tailorResumeHeuristic(master, job);
      return {
        resume: fallback.resume,
        changes: fallback.changes,
        warnings: [
          "AI tailoring produced content that could not be verified against your master resume, so a safe reorder-only version was generated instead.",
          ...report.errors.slice(0, 4),
        ],
        method: "heuristic",
      };
    } catch (err) {
      if (!isAIFallbackError(err)) throw err;
      console.warn("AI tailoring failed, using heuristic tailoring:", err);
      const fallback = tailorResumeHeuristic(master, job);
      return {
        resume: fallback.resume,
        changes: fallback.changes,
        warnings: ["AI tailoring was unavailable, so your resume was reordered and trimmed without rewriting."],
        method: "heuristic",
      };
    }
  }

  const fallback = tailorResumeHeuristic(master, job);
  return { resume: fallback.resume, changes: fallback.changes, warnings: [], method: "heuristic" };
}
