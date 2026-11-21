import { getModel, isAIAvailable } from "@/lib/ai/client";
import { isAIFallbackError } from "@/lib/ai/errors";
import { generatePrepWithAI } from "@/lib/interview/ai-prep";
import { generatePrepHeuristic } from "@/lib/interview/heuristic-prep";
import type { ParsedResume } from "@/lib/parsing/schema";
import type { InterviewPrepContent, JobKeywordInput } from "@/lib/types";

export interface InterviewPrepResult {
  content: InterviewPrepContent;
  method: "ai" | "template";
  model: string | null;
}

export async function generateInterviewPrep(
  resume: ParsedResume,
  job: JobKeywordInput
): Promise<InterviewPrepResult> {
  if (isAIAvailable()) {
    try {
      const content = await generatePrepWithAI(resume, job);
      if (content.questions.length > 0) {
        return { content, method: "ai", model: getModel() };
      }
    } catch (err) {
      if (!isAIFallbackError(err)) throw err;
      console.warn("AI interview prep failed, using templates:", err);
    }
  }
  return { content: generatePrepHeuristic(resume, job), method: "template", model: null };
}
