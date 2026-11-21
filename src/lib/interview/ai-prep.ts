import { z } from "zod";
import { generateStructured } from "@/lib/ai/structured";
import type { ParsedResume } from "@/lib/parsing/schema";
import type { InterviewPrepContent, JobKeywordInput } from "@/lib/types";

const InterviewPrepSchema = z.object({
  questions: z.array(
    z.object({
      question: z.string(),
      category: z.enum(["technical", "behavioral", "role_specific", "gap_probing"]),
      whyLikely: z.string(),
      answerOutline: z.array(z.string()),
    })
  ),
});

const SYSTEM = `You are an interview coach. Given a candidate's resume (JSON) and a job description, produce 10-14 likely interview questions with suggested answer outlines.

Cover:
- 4-6 technical/skill questions tied to the job's top requirements
- 3-4 behavioral questions
- 2-3 role- or company-specific questions
- 1-2 questions probing gaps between the resume and the job's requirements

For each question:
- whyLikely: one sentence on why this will be asked.
- answerOutline: 3-5 bullets grounded in the candidate's ACTUAL resume. Reference their real employers, projects and accomplishments by name. Structure behavioral outlines as Situation / Action / Result using specific resume content.

Where the resume has no relevant material (gap questions), outline an honest "here is my adjacent experience plus my learning plan" answer. Never suggest claiming experience the resume does not support.`;

export async function generatePrepWithAI(
  resume: ParsedResume,
  job: JobKeywordInput
): Promise<InterviewPrepContent> {
  return generateStructured({
    schema: InterviewPrepSchema,
    schemaName: "interview_prep",
    system: SYSTEM,
    maxTokens: 8192,
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
}
