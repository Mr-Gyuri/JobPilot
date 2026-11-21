import {
  extractKeywords,
  keywordInText,
  type WeightedKeyword,
} from "@/lib/matching/keywords";
import {
  normalizeDate,
  yearsOfExperienceFrom,
  type ExperienceEntry,
  type ParsedResume,
} from "@/lib/parsing/schema";
import type { JobKeywordInput } from "@/lib/types";

// Fabrication-proof tailoring: this path only reorders, trims and selects
// existing content, and builds the summary from slots filled with master-resume
// facts. It cannot invent anything, so it needs no validation pass.

function scoreText(text: string, keywords: WeightedKeyword[]): number {
  const lower = text.toLowerCase();
  return keywords.reduce((sum, kw) => (keywordInText(kw, lower) ? sum + kw.weight : sum), 0);
}

/** Stable descending sort — equal scores keep the author's original order. */
function stableSortByScore<T>(items: T[], score: (item: T) => number): T[] {
  return items
    .map((item, index) => ({ item, index, value: score(item) }))
    .sort((a, b) => b.value - a.value || a.index - b.index)
    .map((entry) => entry.item);
}

function endYear(entry: ExperienceEntry): number | null {
  if (entry.endDate == null) return new Date().getFullYear(); // current role
  const year = Number(normalizeDate(entry.endDate).slice(0, 4));
  return Number.isFinite(year) && year > 1950 ? year : null;
}

function sentenceCase(value: string): string {
  const trimmed = value.trim().replace(/\s+/g, " ").replace(/[.;,]+$/, "");
  if (!trimmed) return "";
  return `${trimmed.charAt(0).toUpperCase()}${trimmed.slice(1)}.`;
}

export function tailorResumeHeuristic(
  master: ParsedResume,
  job: JobKeywordInput
): { resume: ParsedResume; changes: string[] } {
  // Company and location excluded: they would otherwise score bullets that
  // merely happen to mention the city as relevant to the role.
  const keywords = extractKeywords(`${job.title}\n${job.text}`, [
    job.company ?? "",
    job.location ?? "",
  ]);
  const changes: string[] = [];
  const currentYear = new Date().getFullYear();

  // --- Experience: reorder bullets by relevance; trim stale, irrelevant roles ---
  const experience: ExperienceEntry[] = master.experience.map((entry) => {
    const sortedBullets = stableSortByScore(entry.bullets, (b) => scoreText(b, keywords));
    const entryScore = scoreText(`${entry.title} ${entry.company} ${entry.bullets.join(" ")}`, keywords);
    const ended = endYear(entry);
    const isStale = ended != null && currentYear - ended > 8;

    if (entryScore === 0 && isStale && sortedBullets.length > 2) {
      changes.push(
        `Trimmed ${entry.company || entry.title} (ended ${entry.endDate ?? "?"}) to its 2 strongest bullets — no overlap with this role.`
      );
      return { ...entry, bullets: sortedBullets.slice(0, 2) };
    }
    if (sortedBullets.length > 1 && sortedBullets.join("|") !== entry.bullets.join("|")) {
      changes.push(`Reordered bullets under ${entry.company || entry.title} to lead with the most relevant work.`);
    }
    return { ...entry, bullets: sortedBullets };
  });

  // --- Skills: float matched skills forward, then reorder the groups ---
  const skills = stableSortByScore(
    master.skills.map((group) => ({
      ...group,
      skills: stableSortByScore(group.skills, (s) => scoreText(s, keywords)),
    })),
    (group) => group.skills.reduce((sum, s) => sum + scoreText(s, keywords), 0)
  );

  const matchedSkills = master.skills
    .flatMap((g) => g.skills)
    .filter((s) => scoreText(s, keywords) > 0);
  if (matchedSkills.length > 0) {
    changes.push(`Moved ${matchedSkills.slice(0, 5).join(", ")} to the front of the skills section.`);
  }

  // --- Extra sections: most relevant first ---
  const extraSections = stableSortByScore(master.extraSections, (section) =>
    scoreText(`${section.heading} ${section.items.join(" ")}`, keywords)
  );

  // --- Summary: template filled only with master-resume facts ---
  const latest = master.experience[0];
  const years = yearsOfExperienceFrom(master);
  const topSkills = matchedSkills.slice(0, 3);
  const bestBullet = stableSortByScore(
    master.experience.flatMap((e) => e.bullets),
    (b) => scoreText(b, keywords)
  )[0];

  let summary = master.summary;
  if (topSkills.length > 0 || latest) {
    const sentences: string[] = [];
    if (latest?.title) {
      sentences.push(
        years != null
          ? `${latest.title} with ${years}+ years of experience${topSkills.length > 0 ? ` in ${topSkills.join(", ")}` : ""}.`
          : `${latest.title}${topSkills.length > 0 ? ` with experience in ${topSkills.join(", ")}` : ""}.`
      );
    }
    if (bestBullet && scoreText(bestBullet, keywords) > 0) {
      sentences.push(sentenceCase(bestBullet));
    }
    const closing = topSkills[0]
      ? `Seeking to apply ${topSkills[0]} expertise as ${job.title}${job.company ? ` at ${job.company}` : ""}.`
      : `Seeking the ${job.title} role${job.company ? ` at ${job.company}` : ""}.`;
    sentences.push(closing);
    summary = sentences.filter(Boolean).join(" ");
    changes.push(`Rewrote the professional summary to target "${job.title}" using facts already on the resume.`);
  }

  if (changes.length === 0) {
    changes.push("No reordering was needed — the master resume already leads with the most relevant content.");
  }

  return {
    resume: {
      contact: master.contact,
      summary,
      experience,
      education: master.education,
      skills,
      certifications: master.certifications,
      extraSections,
    },
    changes,
  };
}
