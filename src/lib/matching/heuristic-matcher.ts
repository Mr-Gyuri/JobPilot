import {
  expandAliases,
  extractKeywords,
  keywordInText,
  type WeightedKeyword,
} from "@/lib/matching/keywords";
import { resumeHaystack, yearsOfExperienceFrom, type ParsedResume } from "@/lib/parsing/schema";
import type { AiMatch } from "@/lib/matching/ai-matcher";
import type { JobKeywordInput } from "@/lib/types";

function requiredYears(jobText: string): number | null {
  const match = jobText.match(/(\d{1,2})\s*\+?\s*(?:to\s*\d{1,2}\s*)?year/i);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

function sentenceCase(value: string): string {
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (!trimmed) return "";
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

/**
 * Deterministic match analysis. Runs whenever no Anthropic key is configured
 * (or an AI call fails) so the feature is never simply unavailable.
 */
export function analyzeMatchHeuristic(
  resume: ParsedResume,
  job: JobKeywordInput
): AiMatch {
  const jobText = `${job.title}\n${job.text}`;
  // The employer's name and the location sit in the text but are not things a
  // candidate can have, so they are excluded rather than reported as gaps.
  const keywords = extractKeywords(jobText, [job.company ?? "", job.location ?? ""]);

  // Alias-expand the resume so "React.js" on the resume matches "react" in the JD.
  const baseHaystack = resumeHaystack(resume);
  const haystack = `${baseHaystack}\n${expandAliases(baseHaystack).join("\n")}`;

  const matched: WeightedKeyword[] = [];
  const missing: WeightedKeyword[] = [];
  for (const kw of keywords) {
    (keywordInText(kw, haystack) ? matched : missing).push(kw);
  }

  // Score on real skills, not on the posting's phrasing. A posting yields far
  // more prose n-grams ("deploy software solutions", "meet business") than
  // skills, and scoring across all of them buries the signal: a C#/.NET
  // engineer scored 23% against a C#/.NET role purely because they had not
  // echoed the recruiter's sentences. Prose terms remain in the missing list as
  // wording hints; they just do not drive the number.
  const scoringSet = keywords.filter((k) => k.kind === "dictionary");
  const useDictionaryOnly = scoringSet.length >= 6;
  const scored = useDictionaryOnly ? scoringSet : keywords;
  const scoredMatched = matched.filter((k) => (useDictionaryOnly ? k.kind === "dictionary" : true));

  const totalWeight = scored.reduce((sum, k) => sum + k.weight, 0);
  const matchedWeight = scoredMatched.reduce((sum, k) => sum + k.weight, 0);
  let score = totalWeight === 0 ? 0 : Math.round((matchedWeight / totalWeight) * 100);
  // A very thin job description can't support a confident high score.
  if (totalWeight < 10) score = Math.min(score, 75);

  const topMissing = missing.filter((k) => k.weight >= 3).slice(0, 5);
  const gaps = topMissing.map(
    (k) => `The job asks for ${k.display}, which does not appear on the resume.`
  );

  const needYears = requiredYears(job.text);
  const haveYears = yearsOfExperienceFrom(resume);
  if (needYears != null && haveYears != null && haveYears + 1 < needYears) {
    gaps.push(
      `The posting mentions ${needYears} years of experience; the resume covers roughly ${haveYears}.`
    );
  }
  if (gaps.length === 0 && missing.length > 0) {
    gaps.push(
      `No major gaps stand out. Lower-priority terms not found: ${missing
        .slice(0, 6)
        .map((k) => k.display)
        .join(", ")}.`
    );
  }

  const strengths = matched.slice(0, 5).map((k) => {
    const bullet = resume.experience
      .flatMap((exp) => exp.bullets)
      .find((b) => keywordInText(k, b.toLowerCase()));
    return bullet
      ? `${k.display}: ${sentenceCase(bullet)}`
      : `${k.display} appears in the resume and is requested by this role.`;
  });

  const suggestions: string[] = [];
  for (const kw of topMissing.slice(0, 3)) {
    // Near miss: an adjacent alias shows up, so it's a wording fix, not a gap.
    const nearMiss = kw.aliases.find((alias) => alias !== kw.canonical && haystack.includes(alias));
    suggestions.push(
      nearMiss
        ? `Your resume mentions "${nearMiss}" — use the posting's wording "${kw.display}" where that is accurate.`
        : `If you have any exposure to ${kw.display}, make it explicit in your skills or a bullet.`
    );
  }
  suggestions.push(`Mirror the job title "${job.title}" in your professional summary.`);
  if (matched.length > 0) {
    suggestions.push(
      `Move ${matched
        .slice(0, 4)
        .map((k) => k.display)
        .join(", ")} to the top of your skills section so a scanner sees them first.`
    );
  }
  suggestions.push("Lead each relevant bullet with the outcome, and quantify it where you can.");

  return {
    score,
    // Report the figures the score was actually computed from, so a 40% next to
    // "matched 13 of 60" does not look like an arithmetic mistake.
    summary:
      totalWeight === 0
        ? "Not enough job detail to analyse — paste the full job description for a useful score."
        : `Matched ${scoredMatched.length} of ${scored.length} skills this posting asks for` +
          (useDictionaryOnly && missing.length > scored.length - scoredMatched.length
            ? `, plus ${missing.filter((k) => k.kind === "prose").length} wording hints below.`
            : "."),
    matchedKeywords: matched.map((k) => k.display),
    missingKeywords: missing.map((k) => k.display),
    strengths,
    gaps,
    suggestions,
  };
}
