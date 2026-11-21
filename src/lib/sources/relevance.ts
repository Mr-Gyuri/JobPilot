import type { NormalizedJob } from "@/lib/types";

/**
 * Post-search filtering and ranking for a Philippines-based job hunt.
 *
 * The remote boards are worldwide, so a large share of what they return is
 * restricted to candidates in the US, Brazil or Europe — noise for someone
 * applying from Manila. And a keyword search on those APIs matches loosely: a
 * query for "software engineer" comes back with graphic designers and customer
 * support roles because the posting mentions technology.
 *
 * These checks run AFTER the source cache, so toggling them costs no API quota.
 */

// ---------- Philippines eligibility ----------

/**
 * Region words that include a candidate in the Philippines. Remotive states
 * eligibility in `candidate_required_location` as a free-text region list —
 * "Worldwide", "USA", "Northern America, LATAM, Europe, APAC".
 */
const PH_ELIGIBLE = [
  "worldwide",
  "anywhere",
  "global",
  "philippin",
  "asia", // covers "Asia" and "Southeast Asia"; APAC handled below
  "apac",
  "oceania",
  "emea", // some postings use EMEA loosely to include APAC hubs
];

/** Region words that place a job outside reach unless a PH word also appears. */
const PH_EXCLUDED = [
  "usa",
  "united states",
  "u.s.",
  "canada",
  "brazil",
  "mexico",
  "uruguay",
  "argentina",
  "colombia",
  "latam",
  "europe",
  "uk",
  "united kingdom",
  "germany",
  "france",
  "spain",
  "poland",
  "india",
  "israel",
  "australia",
  "new zealand",
  "africa",
  "americas",
];

/**
 * Whether someone in the Philippines could apply. An unstated location is kept
 * — silence is not a restriction, and dropping those would hide real jobs.
 */
export function isOpenToPhilippines(location: string | undefined | null): boolean {
  if (!location) return true;
  const text = location.toLowerCase();
  if (PH_ELIGIBLE.some((word) => text.includes(word))) return true;
  // Named other regions with no PH-inclusive word means restricted.
  if (PH_EXCLUDED.some((word) => text.includes(word))) return false;
  // Anything else unrecognised (a city, a timezone) is kept.
  return true;
}

// ---------- Role relevance ----------

const TECH_QUERY = /\b(engineer|developer|programm|software|frontend|front-end|backend|back-end|fullstack|full-stack|devops|sre|qa|tester|architect|data|analyst|scientist|ml|ai|python|java|javascript|typescript|react|node|golang|rust|php|\.net|c#|c\+\+|android|ios|mobile|web|cloud|security|database|sysadmin|it)\b/i;

/** Whether the search is for a technical role, so non-technical hits are noise. */
export function looksTechnicalQuery(keywords: string): boolean {
  return TECH_QUERY.test(keywords);
}

/**
 * Categories these boards use for work that is definitely not engineering.
 * Deliberately a denylist rather than an allowlist: an unfamiliar or missing
 * category keeps the job, so a new category name never silently hides results.
 */
const NON_TECHNICAL_CATEGORIES = [
  "customer service",
  "customer support",
  "customer success",
  "design",
  "sales",
  "marketing",
  "writing",
  "copywriting",
  "medical",
  "healthcare",
  "human resources",
  "recruit",
  "finance",
  "accounting",
  "legal",
  "teaching",
  "education",
  "translation",
  "transcription",
  "virtual assistant",
  "communications",
  "business development",
];

/** Whether a board-supplied category is clearly outside technical work. */
export function isNonTechnicalCategory(category: string | undefined | null): boolean {
  if (!category) return false;
  const text = category.toLowerCase();
  return NON_TECHNICAL_CATEGORIES.some((c) => text.includes(c));
}

// ---------- Publisher preference ----------

/**
 * Boards that have actually produced offers for this household, best first.
 * JSearch reports the originating board in `job_publisher`, so preferring these
 * surfaces Jobstreet/LinkedIn/Foundit postings above generic aggregator mirrors
 * (BeBee and similar often relist the same job behind an extra redirect).
 */
export const PREFERRED_PUBLISHERS = [
  "jobstreet",
  "linkedin",
  "onlinejobs",
  "foundit",
  "kalibrr",
  "bossjob",
  "indeed",
  "jora",
  "glassdoor",
];

/** Lower sorts first. Preferred boards rank by list order, everything else last. */
export function publisherRank(publisher: string | undefined | null): number {
  if (!publisher) return PREFERRED_PUBLISHERS.length + 1;
  const text = publisher.toLowerCase();
  const index = PREFERRED_PUBLISHERS.findIndex((p) => text.includes(p));
  return index === -1 ? PREFERRED_PUBLISHERS.length : index;
}

/** The best (lowest) publisher rank across every source a merged job came from. */
function bestPublisherRank(job: NormalizedJob & { sources?: { publisher?: string }[] }): number {
  const own = publisherRank(job.sourcePublisher);
  if (!job.sources?.length) return own;
  return Math.min(own, ...job.sources.map((s) => publisherRank(s.publisher)));
}

// ---------- Applied together ----------

export interface FilterCounts {
  /** Dropped because a candidate in the Philippines could not apply. */
  notOpenToPh: number;
  /** Dropped because the role is clearly outside the technical search. */
  offTopic: number;
}

export interface FilterOutcome<T> {
  kept: T[];
  counts: FilterCounts;
}

/**
 * Drop jobs a Philippines-based technical candidate cannot use, then order what
 * remains so the boards that actually convert appear first. Counts are returned
 * so the UI can say what was hidden rather than quietly shrinking the list.
 */
export function focusOnPhilippines<
  T extends NormalizedJob & { category?: string; sources?: { publisher?: string }[] },
>(jobs: T[], keywords: string): FilterOutcome<T> {
  const technical = looksTechnicalQuery(keywords);
  const counts: FilterCounts = { notOpenToPh: 0, offTopic: 0 };
  const kept: T[] = [];

  for (const job of jobs) {
    if (!isOpenToPhilippines(job.location)) {
      counts.notOpenToPh++;
      continue;
    }
    if (technical && isNonTechnicalCategory(job.category)) {
      counts.offTopic++;
      continue;
    }
    kept.push(job);
  }

  // Stable within a rank: the API's own ordering (usually recency) is preserved.
  const ranked = kept
    .map((job, index) => ({ job, rank: bestPublisherRank(job), index }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((entry) => entry.job);

  return { kept: ranked, counts };
}
