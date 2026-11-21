import crypto from "node:crypto";
import { fetchJson, mentionsRemote, toSnippet, type SourceAdapter } from "@/lib/sources/adapter";
import type { NormalizedJob, SearchParams } from "@/lib/types";

// Careerjet Search API v4.
//
// The older public.api.careerjet.net/search endpoint — affiliate ID in the query
// string, plaintext HTTP only, port 443 refused — is closed to new accounts and
// answers "The legacy Job Search API is only accessible for authenticated legacy
// users. Please use the new API (v4) instead." v4 is HTTPS, and authenticates
// with HTTP Basic where the API key is the username and the password is empty.
//
// user_ip and user_agent are required by the API. This is a single-user app
// running on loopback, so loopback is the honest answer for both.
//
// v4 also requires a Referer header matching the site declared on the
// Publisher account (and the calling IP declared there too — see the account
// dashboard's "Server IP addresses" tab if this ever starts failing again).
// Hardcoded rather than configurable: it's tied to the one Publisher account
// this app was registered under, not something a user would ever change.

const ENDPOINT = "https://search.api.careerjet.net/v4/query";
const MAX_PAGE = 10; // v4 caps page at 10
const REFERER = "https://one-night-werewolf-tyler.onrender.com";

interface CareerjetItem {
  title?: string | null;
  company?: string | null;
  locations?: string | null;
  date?: string | null;
  description?: string | null;
  salary?: string | null;
  salary_min?: string | number | null;
  salary_max?: string | number | null;
  salary_currency_code?: string | null;
  salary_type?: string | null;
  url?: string | null;
}

interface CareerjetResponse {
  type?: string | null;
  error?: string | null;
  message?: string | null;
  hits?: number | null;
  pages?: number | null;
  jobs?: CareerjetItem[] | null;
}

/** v4 splits the old `contracttype`/`contractperiod` pair into two parameters. */
const CONTRACT_TYPE: Partial<Record<SearchParams["jobType"], string>> = {
  contract: "c",
  temporary: "t",
  internship: "i",
};

const WORK_HOURS: Partial<Record<SearchParams["jobType"], string>> = {
  full_time: "f",
  part_time: "p",
};

const SALARY_PERIOD: Record<string, string> = {
  M: "month",
  Y: "year",
  H: "hour",
  W: "week",
  D: "day",
};

function toNumber(value: string | number | null | undefined): number | undefined {
  if (value == null || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

export const careerjetAdapter: SourceAdapter = {
  id: "careerjet",
  label: "Careerjet",
  keySets: [["CAREERJET_API_KEY"]],

  async search(params: SearchParams, keys: Record<string, string>): Promise<NormalizedJob[]> {
    const query = new URLSearchParams({
      locale_code: "en_PH",
      keywords: params.keywords,
      location: params.location,
      sort: "date",
      page: String(Math.min(Math.max(params.page, 1), MAX_PAGE)),
      page_size: "20",
      user_ip: "127.0.0.1",
      user_agent: "JobPilot/1.0 (localhost)",
    });
    const contractType = CONTRACT_TYPE[params.jobType];
    if (contractType) query.set("contract_type", contractType);
    const workHours = WORK_HOURS[params.jobType];
    if (workHours) query.set("work_hours", workHours);

    // Basic auth, key as username and an empty password.
    const credentials = Buffer.from(`${keys.CAREERJET_API_KEY}:`).toString("base64");

    const response = await fetchJson<CareerjetResponse>(`${ENDPOINT}?${query.toString()}`, {
      headers: { Authorization: `Basic ${credentials}`, Referer: REFERER },
    });

    // v4 can answer 200 with type ERROR, so the body is checked as well as the status.
    if (response.type === "ERROR") {
      throw new Error(`Careerjet: ${response.error ?? response.message ?? "unknown error"}`);
    }
    if (response.type && response.type !== "JOBS") return []; // e.g. LOCATIONS (ambiguous location)

    return (response.jobs ?? []).map((item): NormalizedJob => {
      const title = item.title ?? "";
      const description = item.description ?? "";
      const url = item.url ?? "";
      return {
        externalId: crypto.createHash("sha1").update(url).digest("hex"),
        source: "careerjet",
        title,
        company: item.company ?? "",
        location: item.locations ?? "",
        isRemote: mentionsRemote(title, item.locations, description),
        salaryText: item.salary || undefined,
        salaryMin: toNumber(item.salary_min),
        salaryMax: toNumber(item.salary_max),
        salaryCurrency: item.salary_currency_code || undefined,
        salaryPeriod: item.salary_type ? SALARY_PERIOD[item.salary_type] : undefined,
        postedAt: item.date ?? undefined,
        url,
        descriptionSnippet: toSnippet(description),
      };
    });
  },
};
