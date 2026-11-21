import { z } from "zod";
import { generateStructured } from "@/lib/ai/structured";
import type { ParsedResume } from "@/lib/parsing/schema";

export const AiMatchSchema = z.object({
  score: z.number(),
  summary: z.string(),
  matchedKeywords: z.array(z.string()),
  missingKeywords: z.array(z.string()),
  strengths: z.array(z.string()),
  gaps: z.array(z.string()),
  suggestions: z.array(z.string()),
});

export type AiMatch = z.infer<typeof AiMatchSchema>;

const SYSTEM = `You are a job-application analyst. Compare a candidate resume (JSON) against a job description and return a structured match analysis.

- score: 0-100. Weigh hard requirements (must-have skills, years of experience, domain) about twice as heavily as nice-to-haves. 85+ means interview-ready, 60-84 means viable with tailoring, below 40 means a poor fit.
- summary: one crisp sentence describing the overall fit.
- matchedKeywords: skills, technologies and qualifications the job asks for that the resume demonstrates. Use the job posting's own terminology.
- missingKeywords: things the job asks for with no evidence in the resume.
- strengths: 2-5 sentences on the strongest overlaps, citing specific resume evidence.
- gaps: 2-5 sentences describing the most important mismatches (seniority, domain, missing hard requirements) - not just keyword absence.
- suggestions: 3-6 concrete actions the candidate can take in their resume or application. Never suggest inventing experience they do not have.`;

export async function analyzeMatchWithAI(
  resume: ParsedResume,
  job: { title: string; company: string | null; text: string }
): Promise<AiMatch> {
  const result = await generateStructured({
    schema: AiMatchSchema,
    schemaName: "match_analysis",
    system: SYSTEM,
    maxTokens: 4096,
    user: [
      "<resume_json>",
      JSON.stringify(resume),
      "</resume_json>",
      "",
      `<job title="${job.title}" company="${job.company ?? "unknown"}">`,
      job.text,
      "</job>",
    ].join("\n"),
  });
  return { ...result, score: Math.max(0, Math.min(100, Math.round(result.score))) };
}
