import { z } from "zod";
import { generateStructured } from "@/lib/ai/structured";
import type { ParsedResume } from "@/lib/parsing/schema";
import type { SearchSuggestion } from "@/lib/suggest/types";

const SuggestionsSchema = z.object({
  suggestions: z
    .array(
      z.object({
        keywords: z.string(),
        rationale: z.string(),
      })
    )
    .min(1)
    .max(8),
});

// The instruction that matters is "short": an LLM asked for a search query will
// happily produce "Senior Full-Stack Software Engineer with React and Azure
// experience in Metro Manila", which matches no posting on any board. Job sites
// match the literal string, so two or three words is the target.
const SYSTEM = `You suggest job-board search queries for a candidate, based only on their resume.

Rules:
- Return 5 or 6 queries, ordered most promising first.
- Each query is a SHORT job title as it would appear in a posting: 2-4 words. "Frontend Developer", "UI/UX Designer", "React Developer".
- Never include a location, seniority filter, company, or the word "jobs" - those are separate controls in the app.
- Base every query on evidence in the resume: a title they have held, or a technology in their skills paired with the kind of role they do.
- Vary them. Include at least one adjacent role the resume genuinely supports, not five rewordings of the same title.
- Never invent a skill or a field the resume does not show.
- rationale: one short sentence naming the evidence, addressed to the candidate ("You held this title at Sparksoft.").`;

export async function suggestSearchesWithAI(
  resume: ParsedResume,
  opts: { targetTitles?: string[] } = {}
): Promise<SearchSuggestion[]> {
  const wanted = opts.targetTitles?.filter(Boolean) ?? [];
  const result = await generateStructured({
    schema: SuggestionsSchema,
    schemaName: "search_suggestions",
    system: SYSTEM,
    maxTokens: 1024,
    user: [
      "<resume_json>",
      JSON.stringify(resume),
      "</resume_json>",
      wanted.length > 0
        ? `\nThe candidate says they are targeting: ${wanted.join(", ")}. Weight these first where the resume supports them.`
        : "",
    ].join("\n"),
  });

  // Trim defensively: the model is asked for short queries, and a long one is
  // worse than useless because it silently returns nothing.
  return result.suggestions
    .map((s) => ({ keywords: repairTechName(s.keywords.trim()), rationale: s.rationale.trim() }))
    .filter((s) => s.keywords && s.keywords.split(/\s+/).length <= 6);
}

/**
 * Put back leading punctuation the model drops from technology names.
 *
 * Observed: ".NET Developer" came back as "NET Developer", which is a materially
 * worse query - boards index the dotted form. Only names where the punctuation
 * is part of the name are touched, and only as a whole word, so "Networking"
 * and "Internet" are unaffected.
 */
export function repairTechName(query: string): string {
  return query
    .replace(/(^|\s)NET(?=\s|$)/g, "$1.NET")
    .replace(/(^|\s)(ASP)(?=\s|$)/gi, "$1ASP.NET")
    .replace(/(^|\s)C\s?sharp(?=\s|$)/gi, "$1C#")
    .replace(/(^|\s)Node\s?JS(?=\s|$)/gi, "$1Node.js");
}

/** Exported under a distinct name so the test suite can exercise it directly. */
export { repairTechName as repairTechNameForTest };
