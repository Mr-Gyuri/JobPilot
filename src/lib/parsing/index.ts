import { isAIAvailable } from "@/lib/ai/client";
import { isAIFallbackError } from "@/lib/ai/errors";
import { extractResumeText, ScannedPdfError, UnsupportedFileError } from "@/lib/parsing/extract";
import { parseResumeWithAI } from "@/lib/parsing/ai-parser";
import { parseResumeHeuristic } from "@/lib/parsing/heuristic-parser";
import type { ParsedResume } from "@/lib/parsing/schema";

export { ScannedPdfError, UnsupportedFileError };

export interface ParseOutcome {
  resume: ParsedResume;
  rawText: string;
  method: "ai" | "heuristic";
  warnings: string[];
}

async function structure(rawText: string, forceHeuristic = false) {
  if (!forceHeuristic && isAIAvailable()) {
    try {
      const resume = await parseResumeWithAI(rawText);
      return { resume, method: "ai" as const, warnings: [] as string[] };
    } catch (err) {
      if (!isAIFallbackError(err)) throw err;
      console.warn("AI resume parsing failed, using heuristics:", err);
      const fallback = parseResumeHeuristic(rawText);
      return {
        resume: fallback.resume,
        method: "heuristic" as const,
        warnings: [
          "AI parsing was unavailable, so the resume was parsed with built-in heuristics.",
          ...fallback.warnings,
        ],
      };
    }
  }
  const fallback = parseResumeHeuristic(rawText);
  return { resume: fallback.resume, method: "heuristic" as const, warnings: fallback.warnings };
}

export async function parseResumeFile(
  buffer: Buffer,
  filenameOrMime: string
): Promise<ParseOutcome> {
  const rawText = await extractResumeText(buffer, filenameOrMime);
  const structured = await structure(rawText);
  return { ...structured, rawText };
}

export async function reparseResumeText(
  rawText: string,
  forceHeuristic = false
): Promise<Omit<ParseOutcome, "rawText">> {
  return structure(rawText, forceHeuristic);
}
