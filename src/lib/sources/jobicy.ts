import {
  fetchJson,
  stripHtml,
  toSnippet,
  type SourceAdapter,
} from "@/lib/sources/adapter";
import { looksTechnicalQuery } from "@/lib/sources/relevance";
import type { NormalizedJob, SearchParams } from "@/lib/types";

// Jobicy — remote jobs only, keyless and free. Their terms ask for visible
// credit and that apply buttons lead to the original job URL; the UI's source
// badge and the job link (which points at jobicy.com) satisfy both.
//
// The API takes `tag` for keyword search and `geo` for candidate region. There
// is no pagination, no date filter and no employment-type filter, so those two
// are applied client-side and any page past the first returns nothing rather
// than the same results again.

interface JobicyItem {
  id?: string | number | null;
  url?: string | null;
  jobTitle?: string | null;
  companyName?: string | null;
  jobGeo?: string | null;
  /** HTML-escaped in their payloads, e.g. "Customer Support &amp; Success". */
  jobIndustry?: string[] | null;
  jobType?: string[] | null;
  jobExcerpt?: string | null;
  pubDate?: string | null;
  salaryMin?: number | null;
  salaryMax?: number | null;
  salaryCurrency?: string | null;
  salaryPeriod?: string | null;
}

interface JobicyResponse {
  jobs?: JobicyItem[] | null;
}

const SALARY_PERIOD: Record<string, string> = {
  yearly: "year",
  annually: "year",
  monthly: "month",
  weekly: "week",
  daily: "day",
  hourly: "hour",
};

const DAYS_AGO: Partial<Record<SearchParams["datePosted"], number>> = {
  day: 1,
  "3days": 3,
  week: 7,
  month: 30,
};

/** "Full-Time" (Jobicy) → "full_time" (ours). */
function normalizeType(value: string): string {
  return value.toLowerCase().trim().replace(/[\s-]+/g, "_");
}

function withinDays(postedAt: string | null | undefined, days: number): boolean {
  if (!postedAt) return true; // no date — keep rather than silently drop
  const posted = Date.parse(postedAt);
  if (Number.isNaN(posted)) return true;
  return Date.now() - posted <= days * 86_400_000;
}

export const jobicyAdapter: SourceAdapter = {
  id: "jobicy",
  label: "Jobicy (remote)",
  keySets: [[]], // keyless — always enabled

  async search(params: SearchParams): Promise<NormalizedJob[]> {
    if (params.page > 1) return []; // no pagination upstream

    const query = new URLSearchParams({ count: "50" });
    if (params.keywords.trim()) query.set("tag", params.keywords.trim());
    // `geo` and `industry` only accept values from Jobicy's own lists, and an
    // unrecognised value returns zero jobs rather than an error — so each is
    // sent only when the mapping is certain.
    if (/philippin|manila|cebu|davao|makati|taguig|quezon|pasig|pateros/i.test(params.location)) {
      query.set("geo", "philippines");
    }
    // Narrows a technical search server-side, which is far tighter than `tag`
    // alone: `tag=software engineer` returns customer-support roles whose text
    // mentions technology, whereas industry=engineering returns only engineering.
    if (looksTechnicalQuery(params.keywords)) query.set("industry", "engineering");

    const response = await fetchJson<JobicyResponse>(
      `https://jobicy.com/api/v2/remote-jobs?${query.toString()}`
    );

    const days = DAYS_AGO[params.datePosted];
    return (response.jobs ?? [])
      .filter((item) => {
        if (days && !withinDays(item.pubDate, days)) return false;
        if (params.jobType) {
          const types = (item.jobType ?? []).map(normalizeType);
          if (types.length > 0 && !types.includes(params.jobType)) return false;
        }
        return true;
      })
      .map((item): NormalizedJob => {
        const excerpt = item.jobExcerpt ? stripHtml(item.jobExcerpt) : "";
        return {
          externalId: item.id != null ? String(item.id) : "",
          source: "jobicy",
          title: item.jobTitle ? stripHtml(item.jobTitle) : "",
          company: item.companyName ?? "",
          location: item.jobGeo || "Remote",
          isRemote: true, // the board is remote-only
          employmentType: item.jobType?.[0] ? normalizeType(item.jobType[0]) : undefined,
          category: item.jobIndustry?.[0] ? stripHtml(item.jobIndustry[0]) : undefined,
          salaryMin: item.salaryMin ?? undefined,
          salaryMax: item.salaryMax ?? undefined,
          salaryCurrency: item.salaryCurrency ?? undefined,
          salaryPeriod: item.salaryPeriod
            ? SALARY_PERIOD[item.salaryPeriod.toLowerCase()] ?? item.salaryPeriod
            : undefined,
          postedAt: item.pubDate ?? undefined,
          url: item.url ?? "",
          descriptionSnippet: toSnippet(excerpt),
        };
      });
  },
};
