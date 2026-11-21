import { extractKeywords } from "@/lib/matching/keywords";
import type { ParsedResume } from "@/lib/parsing/schema";
import type { SearchSuggestion } from "@/lib/suggest/types";

// Deterministic search suggestions. Runs when no AI key is configured, and as
// the fallback when an AI call fails.
//
// The strongest signal is the plainest: the job titles already on the resume are
// what recruiters posted, so they are what the boards index. Everything else
// here is a variation on that, because a query built from a real title finds
// real postings and one assembled from adjectives does not.

/** Seniority words stripped to widen a search. "Senior X" also matches "X". */
const SENIORITY = /^(senior|sr\.?|junior|jr\.?|lead|principal|staff|chief|head of|associate|assistant)\s+/i;

/** Bracketed and dash-appended qualifiers narrow a title past usefulness. */
const TRAILING_NOISE = /\s*[([].*$|\s+[-–—|·].*$/;

/** The role noun a technology can be attached to: "React" + "Developer". */
const ROLE_NOUN =
  /\b(engineer|engineering|developer|development|designer|analyst|architect|administrator|scientist|specialist|consultant|manager|support)\b/i;

/**
 * A resume title reduced to something a job board will actually match.
 *
 * Two cases need care. A comma often separates a grade from the discipline -
 * "Analyst II, Software Engineering" - and the discipline is the searchable
 * half; taking the text before the comma yields "Analyst II", which finds
 * nothing. And a trainee title is not what someone hunting a real job wants
 * indexed, so "IT Support Intern" becomes "IT Support".
 */
function cleanTitle(raw: string): string {
  let value = raw.replace(TRAILING_NOISE, "").trim();

  const comma = value.indexOf(",");
  if (comma > 0) {
    const before = value.slice(0, comma).trim();
    const after = value.slice(comma + 1).trim();
    // A trailing level marker means the left side is an internal grade, not a
    // searchable role: "Analyst II, Software Engineering" is advertised as
    // Software Engineering, and nobody posts an "Analyst II" vacancy.
    const beforeIsGrade = /\b(?:I{1,3}|IV|V|VI|\d+)$/.test(before);
    const preferAfter = ROLE_NOUN.test(after) && (beforeIsGrade || !ROLE_NOUN.test(before));
    value = preferAfter ? after : before;
  }

  value = value.replace(/\s+\b(intern|internship|trainee|apprentice)\b\s*$/i, "").trim();
  return value.replace(/\s+/g, " ");
}

function roleNounFrom(titles: string[]): string | null {
  for (const title of titles) {
    const hit = title.match(ROLE_NOUN);
    if (hit) {
      const noun = hit[1].toLowerCase();
      // Normalise the -ing forms so "Software Engineering" yields "Engineer".
      if (noun === "engineering") return "Engineer";
      if (noun === "development") return "Developer";
      return noun.charAt(0).toUpperCase() + noun.slice(1);
    }
  }
  return null;
}

/**
 * Technologies that are real skills but are not how a role is advertised. No
 * board carries "HTML Developer" or "Git Engineer" postings, so pairing them
 * with a role noun produces a query that looks plausible and returns noise.
 */
const NOT_A_JOB_TITLE_MODIFIER = new Set([
  "html",
  "css",
  "sass",
  "less",
  "git",
  "json",
  "xml",
  "yaml",
  "sql",
  "rest",
  "jira",
  "excel",
  "word",
  "powerpoint",
]);

export function suggestSearchesHeuristic(
  resume: ParsedResume,
  opts: { targetTitles?: string[]; limit?: number } = {}
): SearchSuggestion[] {
  const limit = opts.limit ?? 6;
  const out: SearchSuggestion[] = [];
  const seen = new Set<string>();

  const push = (keywords: string, rationale: string) => {
    const value = keywords.trim();
    if (!value) return;
    const key = value.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ keywords: value, rationale });
  };

  // 1. Titles the profile explicitly asked for. Stated intent beats inference.
  for (const title of opts.targetTitles ?? []) {
    const clean = cleanTitle(title);
    if (clean) push(clean, "A target job title from your profile.");
  }

  // 2. Titles actually held, most recent first.
  const heldTitles = resume.experience
    .map((entry) => cleanTitle(entry.title))
    .filter(Boolean);
  for (const [index, title] of heldTitles.entries()) {
    push(
      title,
      index === 0 ? "Your current job title." : "A job title from your work history."
    );
  }

  // 3. The most recent title without its seniority prefix - a Senior Engineer
  //    should still see Engineer postings, and boards match the literal string.
  for (const title of heldTitles) {
    const widened = cleanTitle(title.replace(SENIORITY, ""));
    if (widened && widened.toLowerCase() !== title.toLowerCase()) {
      push(widened, `Broader than "${title}" - drops the seniority word.`);
    }
  }

  // 4. Strongest technologies paired with the role noun from the resume. Only
  //    dictionary terms qualify: a query built from a prose n-gram like
  //    "business needs developer" finds nothing.
  const skillText = resume.skills.flatMap((g) => g.skills).join("\n");
  const noun = roleNounFrom([...(opts.targetTitles ?? []), ...heldTitles]);
  if (noun && skillText) {
    const techs = extractKeywords(skillText)
      .filter(
        (k) =>
          k.kind === "dictionary" &&
          k.weight >= 3 &&
          !NOT_A_JOB_TITLE_MODIFIER.has(k.canonical.toLowerCase())
      )
      .slice(0, 2);
    for (const tech of techs) {
      push(
        `${tech.display} ${noun}`,
        `Pairs ${tech.display} from your skills with the kind of role you do.`
      );
    }
  }

  return out.slice(0, limit);
}
