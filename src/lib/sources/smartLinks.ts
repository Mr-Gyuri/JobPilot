import type { SearchParams, SmartLink } from "@/lib/types";

// Pre-filled search URLs for boards without a usable API (or where the API
// needs a partnership). Pure string construction — no fetching, no keys.

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const q = encodeURIComponent;

type DateMap = Partial<Record<SearchParams["datePosted"], string>>;

const JOBSTREET_DATERANGE: DateMap = { day: "1", "3days": "3", week: "7", month: "31" };
const FOUNDIT_FRESHNESS: DateMap = { day: "1", "3days": "3", week: "7", month: "30" };
const LINKEDIN_TPR: DateMap = { day: "r86400", "3days": "r259200", week: "r604800", month: "r2592000" };
const INDEED_FROMAGE: DateMap = { day: "1", "3days": "3", week: "7", month: "14" };
const GLASSDOOR_FROMAGE: DateMap = { day: "1", "3days": "3", week: "7", month: "30" };

const LINKEDIN_JT: Partial<Record<SearchParams["jobType"], string>> = {
  full_time: "F",
  part_time: "P",
  contract: "C",
  temporary: "T",
  internship: "I",
};

const INDEED_JT: Partial<Record<SearchParams["jobType"], string>> = {
  full_time: "fulltime",
  part_time: "parttime",
  contract: "contract",
  temporary: "temporary",
  internship: "internship",
};

/**
 * Boards that have actually produced offers for this household. They are listed
 * first so the panel opens on the links worth clicking rather than in registry
 * order. Keep in step with PREFERRED_PUBLISHERS in lib/sources/relevance.ts,
 * which does the equivalent for API results.
 */
const PROVEN_ORDER = [
  "jobstreet",
  "linkedin",
  "onlinejobs",
  "foundit",
  "facebook-posts",
  "facebook-groups",
];

export function buildSmartLinks(params: SearchParams): SmartLink[] {
  const kw = params.keywords;
  const loc = params.location;
  const genericPh = loc.trim().toLowerCase() === "philippines" || loc.trim() === "";

  const links: SmartLink[] = [];

  // JobStreet PH — path-based search with an optional date filter.
  {
    let url = `https://ph.jobstreet.com/${slug(kw)}-jobs`;
    if (!genericPh) url += `/in-${slug(loc)}`;
    const daterange = JOBSTREET_DATERANGE[params.datePosted];
    if (daterange) url += `?daterange=${daterange}`;
    links.push({ id: "jobstreet", label: "JobStreet PH", url, note: "Job type is set on-page" });
  }

  links.push({
    id: "kalibrr",
    label: "Kalibrr",
    url: `https://www.kalibrr.com/home/te/${q(kw)}`,
    note: "Location refined on-page",
  });

  links.push({
    id: "bossjob",
    label: "Bossjob",
    url: `https://bossjob.ph/jobs-hiring/${slug(kw)}-jobs`,
  });

  links.push({
    id: "onlinejobs",
    label: "OnlineJobs.ph",
    url: `https://www.onlinejobs.ph/jobseekers/jobsearch?jobkeyword=${q(kw)}`,
    note: "All roles are remote-for-PH",
  });

  {
    let url = `https://www.foundit.com.ph/srp/results?query=${q(kw)}&locations=${q(loc)}`;
    const freshness = FOUNDIT_FRESHNESS[params.datePosted];
    if (freshness) url += `&jobFreshness=${freshness}`;
    links.push({ id: "foundit", label: "Foundit PH", url, note: "Formerly Monster" });
  }

  links.push({
    id: "jora",
    label: "Jora PH",
    url: `https://ph.jora.com/j?sp=search&q=${q(kw)}&l=${q(loc)}`,
  });

  {
    let url = `https://www.linkedin.com/jobs/search/?keywords=${q(kw)}&location=${q(loc)}&geoId=103121230`;
    const tpr = LINKEDIN_TPR[params.datePosted];
    if (tpr) url += `&f_TPR=${tpr}`;
    if (params.remoteOnly) url += "&f_WT=2";
    const jt = LINKEDIN_JT[params.jobType];
    if (jt) url += `&f_JT=${jt}`;
    links.push({
      id: "linkedin",
      label: "LinkedIn",
      url,
      note: "Sign-in may be required for full results",
    });
  }

  {
    let url = `https://ph.indeed.com/jobs?q=${q(kw)}&l=${params.remoteOnly ? "Remote" : q(loc)}`;
    const fromage = INDEED_FROMAGE[params.datePosted];
    if (fromage) url += `&fromage=${fromage}`;
    const jt = INDEED_JT[params.jobType];
    if (jt) url += `&jt=${jt}`;
    links.push({ id: "indeed", label: "Indeed PH", url });
  }

  {
    let url = `https://www.glassdoor.com/Job/jobs.htm?sc.keyword=${q(kw)}&locKeyword=${q(loc)}&locT=C`;
    const fromAge = GLASSDOOR_FROMAGE[params.datePosted];
    if (fromAge) url += `&fromAge=${fromAge}`;
    if (params.remoteOnly) url += "&remoteWorkType=1";
    links.push({ id: "glassdoor", label: "Glassdoor", url, note: "May show a login overlay" });
  }

  // Jooble is also an API source, but it currently answers server-side requests
  // with a Cloudflare challenge. A real browser clears that challenge, so the
  // link stays useful even when the adapter cannot reach it.
  links.push({
    id: "jooble",
    label: "Jooble PH",
    url: `https://ph.jooble.org/SearchResult?ukw=${q(kw)}&rgns=${q(loc)}`,
    note: "Browser-only — their API blocks automated requests",
  });

  links.push({
    id: "facebook-posts",
    label: "Facebook posts",
    url: `https://www.facebook.com/search/posts?q=${q(`"hiring" ${kw} ${loc}`)}`,
    note: "Requires Facebook login",
  });

  links.push({
    id: "facebook-groups",
    label: "Facebook groups",
    url: `https://www.facebook.com/search/groups?q=${q(`${kw} jobs ${loc}`)}`,
    note: "Requires Facebook login",
  });

  // Stable partition: proven boards in PROVEN_ORDER, then the rest as built.
  return links
    .map((link, index) => {
      const rank = PROVEN_ORDER.indexOf(link.id);
      return { link, rank: rank === -1 ? PROVEN_ORDER.length : rank, index };
    })
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((entry) => entry.link);
}
