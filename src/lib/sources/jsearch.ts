import crypto from "node:crypto";
import { fetchJson, toSnippet, type SourceAdapter } from "@/lib/sources/adapter";
import type { NormalizedJob, SearchParams } from "@/lib/types";

// JSearch aggregates Google for Jobs (LinkedIn, Indeed, Glassdoor, ZipRecruiter
// and other public boards). It is sold two ways and the adapter picks its mode
// from whichever credential the registry supplied. As of JSearch v5 the two
// storefronts expose the same endpoint, params and response shape, differing
// only in origin and auth header:
//
//   RapidAPI  jsearch.p.rapidapi.com/search-v2       x-rapidapi-key
//   Direct    api.openwebninja.com/jsearch/search-v2  x-api-key
//
// v5 replaced the older /search endpoint (which answers 404 now) and paginates
// by opaque cursor from data.cursor — there is no `page` parameter on either
// storefront. Sending one is rejected, so it is omitted; there is no next-page
// control in the UI yet.
//
// Quota: num_pages costs one request credit per page and each page holds up to
// 10 results. num_pages=1 therefore spends one credit per search, which on
// RapidAPI's 200/month Basic plan is 200 searches — and the registry's 6-hour
// cache means a repeated query costs nothing.

interface JSearchItem {
  job_id?: string | null;
  job_title?: string | null;
  employer_name?: string | null;
  job_city?: string | null;
  job_state?: string | null;
  job_country?: string | null;
  job_is_remote?: boolean | null;
  job_employment_type?: string | null;
  job_employment_types?: string[] | null;
  job_min_salary?: number | null;
  job_max_salary?: number | null;
  /** RapidAPI only; search-v2 dropped it in favour of job_salary_string. */
  job_salary_currency?: string | null;
  job_salary_period?: string | null;
  /** search-v2 only: a preformatted display string such as "$90K–$120K a year". */
  job_salary_string?: string | null;
  job_posted_at_datetime_utc?: string | null;
  job_apply_link?: string | null;
  job_publisher?: string | null;
  job_description?: string | null;
}

/**
 * search-v2 nests the array under data.jobs. The flat-array form is the older
 * /search shape, still accepted here so a response from either is mapped rather
 * than throwing "data.map is not a function".
 */
interface JSearchResponse {
  data?: JSearchItem[] | { jobs?: JSearchItem[] | null } | null;
}

const DATE_POSTED: Record<SearchParams["datePosted"], string> = {
  any: "all",
  day: "today",
  "3days": "3days",
  week: "week",
  month: "month",
};

const EMPLOYMENT_TYPES: Partial<Record<SearchParams["jobType"], string>> = {
  full_time: "FULLTIME",
  part_time: "PARTTIME",
  contract: "CONTRACTOR",
  internship: "INTERN",
};

function extractItems(data: JSearchResponse["data"]): JSearchItem[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object" && Array.isArray(data.jobs)) return data.jobs;
  return [];
}

export const jsearchAdapter: SourceAdapter = {
  id: "jsearch",
  label: "JSearch (Google for Jobs)",
  keySets: [["RAPIDAPI_KEY"], ["OPENWEBNINJA_API_KEY"]],

  async search(params: SearchParams, keys: Record<string, string>): Promise<NormalizedJob[]> {
    const direct = !keys.RAPIDAPI_KEY && !!keys.OPENWEBNINJA_API_KEY;

    const query = new URLSearchParams({
      query: `${params.keywords} jobs in ${params.location}`,
      num_pages: "1",
      country: "ph",
      date_posted: DATE_POSTED[params.datePosted],
    });
    if (params.remoteOnly) query.set("work_from_home", "true");
    const employmentType = EMPLOYMENT_TYPES[params.jobType];
    if (employmentType) query.set("employment_types", employmentType);

    const url = direct
      ? `https://api.openwebninja.com/jsearch/search-v2?${query.toString()}`
      : `https://jsearch.p.rapidapi.com/search-v2?${query.toString()}`;

    const headers: Record<string, string> = direct
      ? { "x-api-key": keys.OPENWEBNINJA_API_KEY }
      : {
          "x-rapidapi-key": keys.RAPIDAPI_KEY,
          "x-rapidapi-host": "jsearch.p.rapidapi.com",
        };

    // Published average latency is ~8.7s (it queries Google for Jobs live), so
    // the default 10s ceiling would fail a normal call after spending a credit.
    const response = await fetchJson<JSearchResponse>(url, { headers, timeoutMs: 30_000 });

    return extractItems(response.data).map((item): NormalizedJob => {
      const url = item.job_apply_link ?? "";
      const employmentType =
        item.job_employment_type ?? item.job_employment_types?.[0] ?? undefined;
      return {
        externalId: item.job_id || crypto.createHash("sha1").update(url).digest("hex"),
        source: "jsearch",
        sourcePublisher: item.job_publisher ?? undefined,
        title: item.job_title ?? "",
        company: item.employer_name ?? "",
        location: [item.job_city, item.job_state, item.job_country].filter(Boolean).join(", "),
        isRemote: Boolean(item.job_is_remote),
        employmentType: employmentType?.toLowerCase() || undefined,
        salaryMin: item.job_min_salary ?? undefined,
        salaryMax: item.job_max_salary ?? undefined,
        salaryCurrency: item.job_salary_currency ?? undefined,
        salaryPeriod: item.job_salary_period?.toLowerCase() || undefined,
        // Keeps the salary readable when v2 omits the currency field.
        salaryText: item.job_salary_string ?? undefined,
        postedAt: item.job_posted_at_datetime_utc ?? undefined,
        url,
        descriptionSnippet: toSnippet(item.job_description),
      };
    });
  },
};
