import { getConfigValue } from "@/lib/config";
import { fetchJson, mentionsRemote, toSnippet, type SourceAdapter } from "@/lib/sources/adapter";
import type { NormalizedJob, SearchParams } from "@/lib/types";

// Adzuna has no Philippines endpoint — the country path segment comes from the
// ADZUNA_COUNTRY setting (default "sg"), useful for regional/remote-friendly roles.

interface AdzunaItem {
  id?: string | number | null;
  title?: string | null;
  company?: { display_name?: string | null } | null;
  location?: { display_name?: string | null } | null;
  created?: string | null;
  redirect_url?: string | null;
  salary_min?: number | null;
  salary_max?: number | null;
  salary_is_predicted?: string | null;
  contract_time?: string | null;
  contract_type?: string | null;
  description?: string | null;
}

interface AdzunaResponse {
  results?: AdzunaItem[] | null;
}

const MAX_DAYS_OLD: Partial<Record<SearchParams["datePosted"], string>> = {
  day: "1",
  "3days": "3",
  week: "7",
  month: "30",
};

const JOB_TYPE_FLAG: Partial<Record<SearchParams["jobType"], string>> = {
  full_time: "full_time",
  part_time: "part_time",
  contract: "contract",
};

export const adzunaAdapter: SourceAdapter = {
  id: "adzuna",
  label: "Adzuna",
  keySets: [["ADZUNA_APP_ID", "ADZUNA_APP_KEY"]],

  async search(params: SearchParams, keys: Record<string, string>): Promise<NormalizedJob[]> {
    const country = getConfigValue("ADZUNA_COUNTRY") ?? "sg";

    const query = new URLSearchParams({
      app_id: keys.ADZUNA_APP_ID,
      app_key: keys.ADZUNA_APP_KEY,
      what: params.remoteOnly ? `${params.keywords} remote` : params.keywords,
      results_per_page: "20",
      sort_by: "date",
    });
    // The country path segment already scopes the search; a "Philippines"
    // where-filter would zero out results on a non-PH endpoint.
    if (params.location && !params.location.toLowerCase().includes("philippines")) {
      query.set("where", params.location);
    }
    const maxDaysOld = MAX_DAYS_OLD[params.datePosted];
    if (maxDaysOld) query.set("max_days_old", maxDaysOld);
    const typeFlag = JOB_TYPE_FLAG[params.jobType];
    if (typeFlag) query.set(typeFlag, "1");

    const response = await fetchJson<AdzunaResponse>(
      `https://api.adzuna.com/v1/api/jobs/${country}/search/${params.page}?${query.toString()}`
    );

    return (response.results ?? []).map((item): NormalizedJob => {
      const title = item.title ?? "";
      const description = item.description ?? "";
      return {
        externalId: item.id != null ? String(item.id) : "",
        source: "adzuna",
        title,
        company: item.company?.display_name ?? "",
        location: item.location?.display_name ?? "",
        isRemote: mentionsRemote(title, description),
        employmentType: item.contract_time ?? item.contract_type ?? undefined,
        salaryMin: item.salary_min ?? undefined,
        salaryMax: item.salary_max ?? undefined,
        salaryIsEstimate: item.salary_is_predicted === "1" ? true : undefined,
        postedAt: item.created ?? undefined,
        url: item.redirect_url ?? "",
        descriptionSnippet: toSnippet(description),
      };
    });
  },
};
