import { z } from "zod";
import { generateStructured } from "@/lib/ai/structured";
import { ParsedResumeSchema, type ParsedResume } from "@/lib/parsing/schema";
import type { JobKeywordInput } from "@/lib/types";

const TailoredOutputSchema = z.object({
  resume: ParsedResumeSchema,
  changesSummary: z.array(z.string()),
});

// The anti-fabrication contract. Every constraint here is also enforced
// mechanically by validate.ts — the prompt makes compliance likely, the
// validator makes violations impossible to ship.
const SYSTEM = `You are a resume tailoring assistant. You receive a candidate's MASTER RESUME (structured JSON) and a TARGET JOB. Produce a tailored version of the resume optimized for this job, plus a short list of the changes you made.

You are performing an EDITORIAL operation, not a creative one. You may ONLY:
- REORDER: skills, skill groups, bullets within a job, and non-chronological sections. Keep work experience in reverse-chronological order.
- SELECT / TRIM: omit bullets, skills, or extra sections that are irrelevant to this job. Never omit an entire job; you may reduce an old irrelevant job to 1-2 bullets.
- REPHRASE: reword the summary and bullets to emphasize relevance and mirror the job description's terminology, ONLY where the underlying fact is already in the master resume (e.g. master says "wrote automated tests", the JD says "test automation" - you may write "built test automation"). Rephrasing must never change what was done, the scale, the technology, or the outcome.

HARD CONSTRAINTS - violating any of these makes the output unusable:
1. NEVER invent employers, job titles, dates, locations, degrees, certifications, skills, tools, metrics, or accomplishments.
2. Company names, job titles, and start/end dates must be copied character-for-character from the master resume.
3. Every skill in the output must appear in the master resume's skills or be explicitly evidenced in its bullets or summary.
4. Every number (%, currency, counts, team sizes, years) in the output must appear in the corresponding master entry. Do not round, estimate, or extrapolate.
5. Contact details must be copied unchanged.
6. The summary must be rewritten for this role (2-3 sentences, mirroring the job title and its highest-priority requirements) using only facts from the master resume.

If the master resume has no evidence for something the job wants, leave it out. Do not compensate by exaggerating. Mention notable omissions in changesSummary.`;

export async function tailorResumeWithAI(
  master: ParsedResume,
  job: JobKeywordInput,
  matchHints?: { matched: string[]; missing: string[] },
  constraintFeedback?: string[]
): Promise<{ resume: ParsedResume; changes: string[] }> {
  const parts = [
    "<master_resume>",
    JSON.stringify(master),
    "</master_resume>",
    "",
    `<job title="${job.title}" company="${job.company ?? "unknown"}">`,
    job.text,
    "</job>",
  ];

  if (matchHints) {
    parts.push(
      "",
      "<match_hints>",
      `already evidenced: ${matchHints.matched.slice(0, 25).join(", ") || "none"}`,
      `not evidenced: ${matchHints.missing.slice(0, 25).join(", ") || "none"}`,
      "Mirror the 'already evidenced' terms where the master resume supports it. Do NOT add the 'not evidenced' terms — they are gaps, not targets.",
      "</match_hints>"
    );
  }

  if (constraintFeedback && constraintFeedback.length > 0) {
    parts.push(
      "",
      "Your previous output violated these constraints:",
      ...constraintFeedback.map((e) => `- ${e}`),
      "Regenerate the tailored resume, fixing every violation. Copy companies, titles, dates and contact details verbatim from the master resume."
    );
  }

  const result = await generateStructured({
    schema: TailoredOutputSchema,
    schemaName: "tailored_resume",
    system: SYSTEM,
    maxTokens: 8192,
    user: parts.join("\n"),
  });

  return { resume: result.resume, changes: result.changesSummary };
}
