import { z } from "zod";
import { isAIAvailable } from "@/lib/ai/client";
import { isAIFallbackError } from "@/lib/ai/errors";
import { generateStructured } from "@/lib/ai/structured";
import { extractKeywords, keywordInText } from "@/lib/matching/keywords";
import { yearsOfExperienceFrom, type ParsedResume } from "@/lib/parsing/schema";
import type { JobKeywordInput } from "@/lib/types";

const CoverLetterSchema = z.object({ body: z.string() });

const SYSTEM = `You write cover letter bodies. Output the body text only — no letterhead, no date, no address block, no "Dear ..." greeting and no sign-off; the document template supplies those.

Requirements:
- 3-4 paragraphs, at most 350 words total.
- Grounded EXCLUSIVELY in facts present in the candidate's resume JSON. Never invent employers, titles, dates, metrics, or skills. Do not claim experience the resume does not show.
- Mirror 2-3 of the job's top requirements, each backed by specific evidence from the resume (name the employer or project).
- Warm, direct and specific. No clichés — never open with "I am writing to express" or similar filler.
- Close with a clear call to action.
- Separate paragraphs with a blank line.`;

export interface CoverLetterResult {
  body: string;
  method: "ai" | "heuristic";
}

function lowerFirst(value: string): string {
  const trimmed = value.trim().replace(/[.;,]+$/, "");
  if (!trimmed) return "";
  return trimmed.charAt(0).toLowerCase() + trimmed.slice(1);
}

/** Assembled from resume data — no generated prose, so nothing can be fabricated. */
function heuristicCoverLetter(
  resume: ParsedResume,
  job: JobKeywordInput
): string {
  const keywords = extractKeywords(`${job.title}\n${job.text}`, [
    job.company ?? "",
    job.location ?? "",
  ]);
  const score = (text: string) => {
    const lower = text.toLowerCase();
    return keywords.reduce((sum, kw) => (keywordInText(kw, lower) ? sum + kw.weight : sum), 0);
  };

  const matchedSkills = resume.skills
    .flatMap((g) => g.skills)
    .filter((s) => score(s) > 0)
    .slice(0, 4);
  const latest = resume.experience[0];
  const years = yearsOfExperienceFrom(resume);
  const at = job.company ? ` at ${job.company}` : "";

  const intro = [
    `I'm applying for the ${job.title} position${at}.`,
    latest?.title
      ? `As ${/^[aeiou]/i.test(latest.title) ? "an" : "a"} ${latest.title}${years != null ? ` with ${years}+ years of experience` : ""}${matchedSkills.length > 0 ? ` in ${matchedSkills.slice(0, 2).join(" and ")}` : ""}, the role lines up closely with my background.`
      : "The role lines up closely with my background.",
  ].join(" ");

  const evidenceBullets = resume.experience
    .flatMap((exp) => exp.bullets.map((bullet) => ({ bullet, company: exp.company })))
    .map((item) => ({ ...item, value: score(item.bullet) }))
    .sort((a, b) => b.value - a.value)
    .filter((item) => item.value > 0)
    .slice(0, 2);

  const evidence =
    evidenceBullets.length > 0
      ? evidenceBullets
          .map((item) =>
            item.company
              ? `At ${item.company}, I ${lowerFirst(item.bullet)}.`
              : `${item.bullet.replace(/[.;,]+$/, "")}.`
          )
          .join(" ")
      : latest?.bullets[0]
        ? `At ${latest.company || "my most recent role"}, I ${lowerFirst(latest.bullets[0])}.`
        : "My resume outlines the work I've done most recently and the results it produced.";

  const bridge =
    matchedSkills.length > 0
      ? `My experience with ${matchedSkills.join(", ")} maps directly onto what this role calls for, and I'd bring that straight into your team.`
      : "I'd bring the same focus and consistency shown throughout my resume to this role.";

  const closing =
    "I'd welcome the chance to talk through how I can contribute. Thank you for your time and consideration.";

  return [intro, evidence, bridge, closing].join("\n\n");
}

export async function generateCoverLetter(
  resume: ParsedResume,
  job: JobKeywordInput
): Promise<CoverLetterResult> {
  if (isAIAvailable()) {
    try {
      const result = await generateStructured({
        schema: CoverLetterSchema,
        schemaName: "cover_letter",
        system: SYSTEM,
        maxTokens: 2048,
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
      const body = result.body.trim();
      if (body.length > 0) return { body, method: "ai" };
    } catch (err) {
      if (!isAIFallbackError(err)) throw err;
      console.warn("AI cover letter failed, using template:", err);
    }
  }
  return { body: heuristicCoverLetter(resume, job), method: "heuristic" };
}
