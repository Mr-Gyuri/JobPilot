import {
  fetchJson,
  stripHtml,
  toSnippet,
  type SourceAdapter,
} from "@/lib/sources/adapter";
import type { NormalizedJob, SearchParams } from "@/lib/types";

// Remotive — remote jobs only, keyless and free. Their terms: link to the
// Remotive job URL, name Remotive as the source, and keep request volume to a
// few calls a day. The UI's source badge and job link satisfy the first two;
// the registry's 6-hour cache means one live call per unique query per window,
// which is inside their stated max of ~4/day. Listings are delayed 24h by
// design, so the "past 24 hours" filter is genuinely served by their delay.
//
// The API takes `search` and `limit` — no pagination, no date or type filters,
// so those are applied client-side and pages past the first return nothing.
// Its documented `category` parameter is silently ignored (every value returns
// the same unfiltered set), so the category is mapped through instead and
// filtered downstream in lib/sources/relevance.ts.

interface RemotiveItem {
  id?: string | number | null;
  url?: string | null;
  title?: string | null;
  company_name?: string | null;
  candidate_required_location?: string | null;
  category?: string | null;
  job_type?: string | null;
  publication_date?: string | null;
  salary?: string | null;
  description?: string | null;
}

interface RemotiveResponse {
  jobs?: RemotiveItem[] | null;
}

const DAYS_AGO: Partial<Record<SearchParams["datePosted"], number>> = {
  day: 1,
  "3days": 3,
  week: 7,
  month: 30,
};

function withinDays(postedAt: string | null | undefined, days: number): boolean {
  if (!postedAt) return true;
  const posted = Date.parse(postedAt);
  if (Number.isNaN(posted)) return true;
  return Date.now() - posted <= days * 86_400_000;
}

export const remotiveAdapter: SourceAdapter = {
  id: "remotive",
  label: "Remotive (remote)",
  keySets: [[]], // keyless — always enabled

  async search(params: SearchParams): Promise<NormalizedJob[]> {
    if (params.page > 1) return []; // no pagination upstream

    const query = new URLSearchParams({ limit: "50" });
    if (params.keywords.trim()) query.set("search", params.keywords.trim());

    const response = await fetchJson<RemotiveResponse>(
      `https://remotive.com/api/remote-jobs?${query.toString()}`
    );

    const days = DAYS_AGO[params.datePosted];
    return (response.jobs ?? [])
      .filter((item) => {
        if (days && !withinDays(item.publication_date, days)) return false;
        if (params.jobType && item.job_type && item.job_type !== params.jobType) return false;
        return true;
      })
      .map((item): NormalizedJob => {
        const description = item.description ? stripHtml(item.description) : "";
        // candidate_required_location says who may apply ("Worldwide", "USA"),
        // which is the useful notion of location for a remote listing.
        const location = item.candidate_required_location || "Remote";
        return {
          externalId: item.id != null ? String(item.id) : "",
          source: "remotive",
          title: item.title ?? "",
          company: item.company_name ?? "",
          location,
          isRemote: true, // the board is remote-only
          employmentType: item.job_type || undefined,
          category: item.category || undefined,
          salaryText: item.salary || undefined,
          postedAt: item.publication_date ?? undefined,
          url: item.url ?? "",
          descriptionSnippet: toSnippet(description),
        };
      });
  },
};
