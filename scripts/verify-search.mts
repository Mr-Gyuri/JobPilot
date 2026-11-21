/**
 * Executes every job-search adapter against realistic API payloads, asserting
 * both the outgoing request (URL, headers, body, filter translation) and the
 * mapping of responses into NormalizedJob. fetch is intercepted, so this runs
 * offline and needs no API keys.
 *
 *   node --import ./scripts/alias-hook.mjs scripts/verify-search.mts
 */
import type { NormalizedJob, SearchParams } from "@/lib/types";

// This suite clears every saved API key to test source gating, so running it
// against the real database destroys real settings. scripts/test-env.mjs
// redirects the data directory; refuse to run without it rather than trust that
// it was wired up.
if (!process.env.JOBPILOT_DATA_DIR) {
  console.error(
    "Refusing to run against the real database — it would clear saved API keys.\n" +
      "Run via `npm run verify:search`, which preloads scripts/test-env.mjs."
  );
  process.exit(1);
}

let failures = 0;
function check(label: string, ok: boolean, detail?: string) {
  if (!ok) failures++;
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${label}${detail ? ` — ${detail}` : ""}`);
}

// ---------- fetch interception ----------
interface Captured {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
}

const realFetch = globalThis.fetch;
let captured: Captured[] = [];
// `raw` replaces the JSON body when a test needs to send something that is not
// JSON at all — a Cloudflare interstitial, for instance.
let nextResponse: {
  status: number;
  json: unknown;
  raw?: string;
  headers?: Record<string, string>;
} = { status: 200, json: {} };

function installStub() {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : String(input);
    const headers: Record<string, string> = {};
    if (init?.headers) {
      for (const [k, v] of Object.entries(init.headers as Record<string, string>)) {
        headers[k.toLowerCase()] = v;
      }
    }
    captured.push({
      url,
      method: init?.method ?? "GET",
      headers,
      body: typeof init?.body === "string" ? init.body : undefined,
    });
    return new Response(nextResponse.raw ?? JSON.stringify(nextResponse.json), {
      status: nextResponse.status,
      headers: {
        "content-type": nextResponse.raw ? "text/html" : "application/json",
        ...nextResponse.headers,
      },
    });
  }) as typeof fetch;
}

/** Send a non-JSON body (with optional response headers) to the next call. */
async function runRaw(
  adapter: { search: (p: SearchParams, k: Record<string, string>) => Promise<NormalizedJob[]> },
  params: SearchParams,
  keys: Record<string, string>,
  raw: string,
  status: number,
  headers?: Record<string, string>
) {
  captured = [];
  nextResponse = { status, json: {}, raw, headers };
  try {
    await adapter.search(params, keys);
    return { error: null as Error | null };
  } catch (err) {
    return { error: err instanceof Error ? err : new Error(String(err)) };
  } finally {
    nextResponse = { status: 200, json: {} };
  }
}

function restoreFetch() {
  globalThis.fetch = realFetch;
}

async function run(
  adapter: { search: (p: SearchParams, k: Record<string, string>) => Promise<NormalizedJob[]> },
  params: SearchParams,
  keys: Record<string, string>,
  response: unknown,
  status = 200
) {
  captured = [];
  nextResponse = { status, json: response };
  const jobs = await adapter.search(params, keys);
  return { jobs, request: captured[0] };
}

const BASE: SearchParams = {
  keywords: "backend engineer",
  location: "Philippines",
  remoteOnly: false,
  datePosted: "any",
  jobType: "",
  page: 1,
};

const { fetchJson } = await import("@/lib/sources/adapter");
const { jsearchAdapter } = await import("@/lib/sources/jsearch");
const { adzunaAdapter } = await import("@/lib/sources/adzuna");
const { joobleAdapter } = await import("@/lib/sources/jooble");
const { careerjetAdapter } = await import("@/lib/sources/careerjet");
const { getSourceStatuses, searchAllSources } = await import("@/lib/sources/registry");
const { dedupeJobs } = await import("@/lib/dedup");
const { setConfigValue } = await import("@/lib/config");

installStub();

// ============ 1. JSearch ============
console.log("\n1. JSearch (RapidAPI)");
{
  const payload = {
    status: "OK",
    data: [
      {
        job_id: "aBc123",
        job_title: "Senior Backend Engineer",
        employer_name: "Coins.ph",
        job_publisher: "LinkedIn",
        job_city: "Makati",
        job_state: "Metro Manila",
        job_country: "PH",
        job_is_remote: true,
        job_employment_type: "FULLTIME",
        job_min_salary: 150000,
        job_max_salary: 220000,
        job_salary_currency: "PHP",
        job_salary_period: "MONTH",
        job_posted_at_datetime_utc: "2026-07-25T04:00:00.000Z",
        job_apply_link: "https://example.com/apply/abc123",
        job_description: "  Own our   payments platform.  ".repeat(60),
      },
      // No job_id and no salary — must still normalise cleanly.
      {
        job_title: "Backend Developer",
        employer_name: "Ninja Van",
        job_country: "PH",
        job_apply_link: "https://example.com/apply/xyz",
      },
    ],
  };
  const { jobs, request } = await run(
    jsearchAdapter,
    { ...BASE, remoteOnly: true, datePosted: "week", jobType: "full_time" },
    { RAPIDAPI_KEY: "test-rapid-key" },
    payload
  );
  const u = new URL(request.url);
  check("host", u.host === "jsearch.p.rapidapi.com", u.host);
  check("auth header", request.headers["x-rapidapi-key"] === "test-rapid-key");
  check("host header", request.headers["x-rapidapi-host"] === "jsearch.p.rapidapi.com");
  check("query includes keywords + location",
    u.searchParams.get("query") === "backend engineer jobs in Philippines",
    String(u.searchParams.get("query")));
  check("country=ph", u.searchParams.get("country") === "ph");
  check("date_posted mapped week", u.searchParams.get("date_posted") === "week");
  check("remote flag", u.searchParams.get("work_from_home") === "true");
  check("employment_types mapped", u.searchParams.get("employment_types") === "FULLTIME");

  check("2 jobs mapped", jobs.length === 2, `${jobs.length}`);
  const j = jobs[0];
  check("externalId from job_id", j.externalId === "aBc123", j.externalId);
  check("title", j.title === "Senior Backend Engineer");
  check("company", j.company === "Coins.ph");
  check("publisher badge", j.sourcePublisher === "LinkedIn");
  check("location joined", j.location === "Makati, Metro Manila, PH", j.location);
  check("isRemote", j.isRemote === true);
  check("employmentType lowercased", j.employmentType === "fulltime", String(j.employmentType));
  check("salary mapped", j.salaryMin === 150000 && j.salaryMax === 220000 && j.salaryCurrency === "PHP");
  check("salaryPeriod lowercased", j.salaryPeriod === "month", String(j.salaryPeriod));
  check("postedAt", j.postedAt === "2026-07-25T04:00:00.000Z");
  check("snippet capped at 500", (j.descriptionSnippet ?? "").length <= 501,
    `${(j.descriptionSnippet ?? "").length} chars`);
  check("snippet whitespace collapsed", !/ {2}/.test(j.descriptionSnippet ?? ""));
  check("missing job_id falls back to url hash",
    /^[0-9a-f]{40}$/.test(jobs[1].externalId), jobs[1].externalId);
  check("missing salary stays undefined", jobs[1].salaryMin === undefined);
  check("missing remote flag => false", jobs[1].isRemote === false);
}

// ============ 1b. JSearch bought direct (openwebninja search-v2) ============
console.log("\n1b. JSearch direct (OpenWeb Ninja search-v2)");
{
  // search-v2 nests the array under data.jobs, drops job_salary_currency, and
  // paginates by cursor rather than page.
  const payload = {
    status: "OK",
    request_id: "req-1",
    data: {
      cursor: "next-page-token",
      jobs: [
        {
          job_id: "v2Job1",
          job_title: "Software Engineer",
          employer_name: "Northwind",
          job_publisher: "Indeed",
          job_city: "Pateros",
          job_state: "Metro Manila",
          job_country: "PH",
          job_is_remote: false,
          job_employment_types: ["FULLTIME"],
          job_min_salary: 90000,
          job_max_salary: 130000,
          job_salary_period: "MONTH",
          job_salary_string: "PHP 90K–130K a month",
          job_posted_at_datetime_utc: "2026-07-28T00:00:00.000Z",
          job_apply_link: "https://example.com/v2/1",
          job_description: "Build services.",
        },
      ],
    },
  };
  const { jobs, request } = await run(
    jsearchAdapter,
    { ...BASE, datePosted: "month", jobType: "full_time" },
    { OPENWEBNINJA_API_KEY: "own-key-1" },
    payload
  );
  const u = new URL(request.url);
  check("uses the direct host", u.host === "api.openwebninja.com", u.host);
  check("uses the search-v2 path", u.pathname === "/jsearch/search-v2", u.pathname);
  check("uses x-api-key header", request.headers["x-api-key"] === "own-key-1");
  check("does NOT send RapidAPI headers", request.headers["x-rapidapi-key"] === undefined);
  check("omits page (v2 is cursor-based)", u.searchParams.get("page") === null);
  check("still sends shared filters",
    u.searchParams.get("date_posted") === "month" &&
      u.searchParams.get("employment_types") === "FULLTIME" &&
      u.searchParams.get("country") === "ph");

  check("reads the nested data.jobs array", jobs.length === 1, `${jobs.length}`);
  const j = jobs[0];
  check("title mapped", j.title === "Software Engineer", j.title);
  check("employment type from the array form", j.employmentType === "fulltime",
    String(j.employmentType));
  check("salary numbers mapped", j.salaryMin === 90000 && j.salaryMax === 130000);
  check("missing currency does not break mapping", j.salaryCurrency === undefined);
  check("display string kept so salary stays readable",
    j.salaryText === "PHP 90K–130K a month", String(j.salaryText));
  check("publisher badge", j.sourcePublisher === "Indeed");

  // Whichever credential is present must select the matching transport.
  const { request: viaRapid } = await run(
    jsearchAdapter, BASE, { RAPIDAPI_KEY: "rk" }, { data: [] }
  );
  const rapidUrl = new URL(viaRapid.url);
  check("RapidAPI key selects the RapidAPI host", rapidUrl.host === "jsearch.p.rapidapi.com");
  // v5 retired /search on RapidAPI too: it answers 404 "Endpoint does not exist".
  check("RapidAPI also uses search-v2", rapidUrl.pathname === "/search-v2", rapidUrl.pathname);
  check("RapidAPI mode omits page as well (no page param in v5)",
    rapidUrl.searchParams.get("page") === null);
  check("RapidAPI auth headers sent",
    viaRapid.headers["x-rapidapi-key"] === "rk" &&
      viaRapid.headers["x-rapidapi-host"] === "jsearch.p.rapidapi.com");
  check("does NOT send the direct key header", viaRapid.headers["x-api-key"] === undefined);
  // One credit per page; more pages would silently multiply the cost.
  check("num_pages stays at 1 (one request credit per page)",
    rapidUrl.searchParams.get("num_pages") === "1");

  // An empty v2 envelope must yield no jobs rather than throwing.
  const { jobs: emptyV2 } = await run(
    jsearchAdapter, BASE, { OPENWEBNINJA_API_KEY: "k" }, { data: { jobs: [] } }
  );
  check("empty v2 envelope yields no jobs", emptyV2.length === 0);
  const { jobs: nullData } = await run(
    jsearchAdapter, BASE, { OPENWEBNINJA_API_KEY: "k" }, { data: null }
  );
  check("null data yields no jobs", nullData.length === 0);
}

// ============ 2. Adzuna ============
console.log("\n2. Adzuna");
{
  setConfigValue("ADZUNA_COUNTRY", "sg");
  const payload = {
    results: [
      {
        id: 4212345678,
        title: "Backend Engineer (Remote)",
        company: { display_name: "Northwind" },
        location: { display_name: "Singapore" },
        created: "2026-07-24T08:00:00Z",
        redirect_url: "https://adzuna.example/job/1",
        salary_min: 96000,
        salary_max: 132000,
        salary_is_predicted: "1",
        contract_time: "full_time",
        description: "Join our platform team. Remote-friendly.",
      },
    ],
  };
  const { jobs, request } = await run(
    adzunaAdapter,
    { ...BASE, datePosted: "3days", jobType: "full_time" },
    { ADZUNA_APP_ID: "app-id-1", ADZUNA_APP_KEY: "app-key-1" },
    payload
  );
  const u = new URL(request.url);
  check("country in path from setting", u.pathname.includes("/jobs/sg/search/1"), u.pathname);
  check("app_id", u.searchParams.get("app_id") === "app-id-1");
  check("app_key", u.searchParams.get("app_key") === "app-key-1");
  check("what=keywords", u.searchParams.get("what") === "backend engineer");
  check("Philippines omitted from where (no PH endpoint)",
    u.searchParams.get("where") === null, String(u.searchParams.get("where")));
  check("max_days_old mapped", u.searchParams.get("max_days_old") === "3");
  check("full_time flag", u.searchParams.get("full_time") === "1");
  check("sorted by date", u.searchParams.get("sort_by") === "date");

  const j = jobs[0];
  check("externalId stringified", j.externalId === "4212345678", j.externalId);
  check("company from nested display_name", j.company === "Northwind");
  check("location from nested display_name", j.location === "Singapore");
  check("remote inferred from text", j.isRemote === true);
  check("predicted salary flagged", j.salaryIsEstimate === true);
  check("employmentType", j.employmentType === "full_time");
  check("postedAt", j.postedAt === "2026-07-24T08:00:00Z");

  // A non-PH location must be forwarded as `where`.
  const { request: r2 } = await run(
    adzunaAdapter,
    { ...BASE, location: "Singapore", remoteOnly: true },
    { ADZUNA_APP_ID: "a", ADZUNA_APP_KEY: "b" },
    { results: [] }
  );
  const u2 = new URL(r2.url);
  check("non-PH location sent as where", u2.searchParams.get("where") === "Singapore");
  check("remoteOnly appends to keywords", u2.searchParams.get("what") === "backend engineer remote",
    String(u2.searchParams.get("what")));
}

// ============ 3. Jooble ============
console.log("\n3. Jooble");
{
  const payload = {
    totalCount: 2,
    jobs: [
      {
        id: 998877,
        title: "Backend Engineer",
        company: "Kalibrr Client",
        location: "Taguig",
        snippet: "<b>Python</b> and PostgreSQL.&nbsp;Work from home&hellip;",
        salary: "PHP 120,000 - 160,000 per month",
        type: "Full time",
        updated: "2026-07-26T00:00:00",
        link: "https://jooble.example/job/998877",
        source: "jobstreet.com.ph",
      },
    ],
  };
  const { jobs, request } = await run(
    joobleAdapter,
    { ...BASE, remoteOnly: true, datePosted: "week" },
    { JOOBLE_API_KEY: "jooble-key-1" },
    payload
  );
  check("POST method", request.method === "POST", request.method);
  check("key is in the URL path", request.url === "https://jooble.org/api/jooble-key-1", request.url);
  check("json content-type", request.headers["content-type"] === "application/json");
  const body = JSON.parse(request.body ?? "{}");
  check("keywords carry remote", body.keywords === "backend engineer remote", String(body.keywords));
  check("location sent", body.location === "Philippines");
  check("page as string", body.page === "1");
  check("datecreatedfrom is a date 7 days back",
    /^\d{4}-\d{2}-\d{2}$/.test(body.datecreatedfrom ?? ""), String(body.datecreatedfrom));

  const j = jobs[0];
  check("externalId stringified", j.externalId === "998877");
  check("publisher from source", j.sourcePublisher === "jobstreet.com.ph");
  check("HTML stripped from snippet",
    !/[<>]/.test(j.descriptionSnippet ?? "") && (j.descriptionSnippet ?? "").includes("Python"),
    j.descriptionSnippet);
  check("&nbsp; decoded", !(j.descriptionSnippet ?? "").includes("nbsp"));
  check("remote inferred from snippet", j.isRemote === true);
  check("employmentType normalised", j.employmentType === "full_time", String(j.employmentType));
  check("salary kept as text (unparsed range)", j.salaryText === "PHP 120,000 - 160,000 per month");
}

// ============ 4. Careerjet (Search API v4) ============
// The legacy public.api.careerjet.net endpoint is closed to new accounts (it
// answers "only accessible for authenticated legacy users") and serves plaintext
// HTTP only — port 443 refuses connections. v4 is HTTPS with Basic auth.
console.log("\n4. Careerjet (v4)");
{
  const payload = {
    type: "JOBS",
    hits: 1,
    pages: 1,
    response_time: 12,
    jobs: [
      {
        title: "Backend Engineer",
        company: "Acme PH",
        locations: "Makati, Metro Manila",
        date: "2026-07-27",
        salary: "PHP 100,000 - 140,000",
        salary_min: "100000",
        salary_max: "140000",
        salary_currency_code: "PHP",
        salary_type: "M",
        url: "https://careerjet.example/job/1",
        description: "Build APIs. Hybrid setup.",
      },
    ],
  };
  const { jobs, request } = await run(
    careerjetAdapter,
    { ...BASE, jobType: "contract" },
    { CAREERJET_API_KEY: "cj-key-123" },
    payload
  );
  const u = new URL(request.url);
  check("v4 host and path", u.host === "search.api.careerjet.net" && u.pathname === "/v4/query",
    `${u.host}${u.pathname}`);
  check("HTTPS (legacy host refuses 443)", u.protocol === "https:");
  check("no affid param (v4 uses Basic auth)", u.searchParams.get("affid") === null);
  check("key sent as Basic auth username, empty password",
    request.headers.authorization === `Basic ${Buffer.from("cj-key-123:").toString("base64")}`,
    request.headers.authorization);
  check("PH locale", u.searchParams.get("locale_code") === "en_PH");
  check("user_ip present (API requires it)", u.searchParams.get("user_ip") === "127.0.0.1");
  check("user_agent present", (u.searchParams.get("user_agent") ?? "").includes("JobPilot"));
  check("contract_type mapped for contract", u.searchParams.get("contract_type") === "c");
  check("work_hours absent for contract", u.searchParams.get("work_hours") === null);
  check("page_size (v4 name, not pagesize)",
    u.searchParams.get("page_size") === "20" && u.searchParams.get("pagesize") === null);

  const j = jobs[0];
  check("externalId is url hash", /^[0-9a-f]{40}$/.test(j.externalId));
  check("location from locations", j.location === "Makati, Metro Manila");
  check("salary strings coerced to numbers",
    j.salaryMin === 100000 && j.salaryMax === 140000, `${j.salaryMin}-${j.salaryMax}`);
  check("salary_type M => month", j.salaryPeriod === "month", String(j.salaryPeriod));

  // work_hours carries full/part time in v4, where legacy used contractperiod.
  const { request: ftReq } = await run(
    careerjetAdapter, { ...BASE, jobType: "full_time" }, { CAREERJET_API_KEY: "k" }, payload
  );
  check("work_hours=f for full_time",
    new URL(ftReq.url).searchParams.get("work_hours") === "f");

  // v4 caps page at 10.
  const { request: deepReq } = await run(
    careerjetAdapter, { ...BASE, page: 99 }, { CAREERJET_API_KEY: "k" }, payload
  );
  check("page clamped to v4 max of 10",
    new URL(deepReq.url).searchParams.get("page") === "10");

  // Careerjet answers LOCATIONS when the location is ambiguous.
  const { jobs: ambiguous } = await run(
    careerjetAdapter, BASE, { CAREERJET_API_KEY: "x" },
    { type: "LOCATIONS", locations: [{ name: "Manila" }] }
  );
  check("LOCATIONS response yields no jobs", ambiguous.length === 0);

  // v4 can answer 200 with type ERROR, so the body is checked as well as status.
  let threw = "";
  try {
    await run(careerjetAdapter, BASE, { CAREERJET_API_KEY: "x" },
      { type: "ERROR", error: "Invalid API key provided" });
  } catch (err) {
    threw = err instanceof Error ? err.message : String(err);
  }
  check("type ERROR on a 200 still throws", /Invalid API key provided/.test(threw), threw);

  // And the real 401 shape, where the message is in the body not the status.
  threw = "";
  try {
    await run(careerjetAdapter, BASE, { CAREERJET_API_KEY: "x" },
      { type: "ERROR", error: "Invalid API key provided" }, 401);
  } catch (err) {
    threw = err instanceof Error ? err.message : String(err);
  }
  check("401 surfaces the API's own message", /Invalid API key provided/.test(threw), threw);
}

// ============ 4b. Jobicy (keyless) ============
console.log("\n4b. Jobicy");
{
  const { jobicyAdapter } = await import("@/lib/sources/jobicy");
  const NOW = Date.now();
  const iso = (daysAgo: number) => new Date(NOW - daysAgo * 86_400_000).toISOString();
  const payload = {
    jobs: [
      {
        id: 149842,
        url: "https://jobicy.com/jobs/149842-example",
        jobTitle: "Senior Software Engineer &amp; Team Lead",
        companyName: "Acme Remote",
        jobGeo: "Anywhere",
        jobType: ["Full-Time"],
        jobExcerpt: "<p>Build APIs&hellip;</p>",
        pubDate: iso(2),
        salaryMin: 40000,
        salaryMax: 50000,
        salaryCurrency: "USD",
        salaryPeriod: "yearly",
      },
      {
        // No salary block at all (their payloads really do omit it) and stale.
        id: 149839,
        url: "https://jobicy.com/jobs/149839-example",
        jobTitle: "Old Posting",
        companyName: "Stale Co",
        jobGeo: "Anywhere",
        jobType: ["Part-Time"],
        jobExcerpt: "old",
        pubDate: iso(20),
      },
    ],
  };

  const { jobs, request } = await run(
    jobicyAdapter,
    { ...BASE, location: "Pateros, Metro Manila", datePosted: "week" },
    {},
    payload
  );
  const u = new URL(request.url);
  check("keyless host", u.host === "jobicy.com" && u.pathname === "/api/v2/remote-jobs");
  check("keywords sent as tag", u.searchParams.get("tag") === BASE.keywords);
  check("PH city mapped to geo=philippines", u.searchParams.get("geo") === "philippines");
  check("no auth header sent", request.headers.authorization === undefined);

  check("stale job filtered client-side (no upstream date filter)",
    jobs.length === 1 && jobs[0].title.includes("Senior"), `${jobs.length} job(s)`);
  const j = jobs[0];
  check("HTML entity decoded in title", j.title === "Senior Software Engineer & Team Lead", j.title);
  check("excerpt stripped of HTML", j.descriptionSnippet === "Build APIs…", j.descriptionSnippet);
  check("Full-Time normalised", j.employmentType === "full_time", String(j.employmentType));
  check("always remote", j.isRemote === true);
  check("yearly => year", j.salaryPeriod === "year", String(j.salaryPeriod));
  check("salary numbers kept", j.salaryMin === 40000 && j.salaryMax === 50000);

  // Non-PH location must not send an unrecognised geo (that returns 0 jobs).
  const { request: usReq } = await run(
    jobicyAdapter, { ...BASE, location: "Austin, Texas" }, {}, payload
  );
  check("unmapped location omits geo", new URL(usReq.url).searchParams.get("geo") === null);

  // No upstream pagination: page 2 must not re-fetch the same 50 jobs.
  captured = [];
  const page2 = await jobicyAdapter.search({ ...BASE, page: 2 }, {});
  check("page 2 returns empty without a network call",
    page2.length === 0 && captured.length === 0);
}

// ============ 4c. Remotive (keyless) ============
console.log("\n4c. Remotive");
{
  const { remotiveAdapter } = await import("@/lib/sources/remotive");
  const payload = {
    jobs: [
      {
        id: 2091081,
        url: "https://remotive.com/remote-jobs/software-dev/example",
        title: "Backend Engineer",
        company_name: "Lemon.io",
        candidate_required_location: "Worldwide",
        job_type: "full_time",
        publication_date: new Date(Date.now() - 86_400_000).toISOString(),
        salary: "$60k-$90k",
        description: "<p>Python &amp; Django backend work.</p>",
      },
      {
        id: 2091082,
        url: "https://remotive.com/remote-jobs/software-dev/example2",
        title: "Contract Designer",
        company_name: "Other Co",
        candidate_required_location: "USA",
        job_type: "contract",
        publication_date: new Date(Date.now() - 86_400_000).toISOString(),
        description: "x",
      },
    ],
  };

  const { jobs, request } = await run(
    remotiveAdapter, { ...BASE, jobType: "full_time" }, {}, payload
  );
  const u = new URL(request.url);
  check("keyless host", u.host === "remotive.com" && u.pathname === "/api/remote-jobs");
  check("keywords sent as search", u.searchParams.get("search") === BASE.keywords);
  check("no auth header sent", request.headers.authorization === undefined);

  check("job_type filtered client-side", jobs.length === 1 && jobs[0].title === "Backend Engineer",
    `${jobs.length} job(s)`);
  const j = jobs[0];
  check("candidate_required_location is the location", j.location === "Worldwide", j.location);
  check("always remote", j.isRemote === true);
  check("salary text passed through", j.salaryText === "$60k-$90k");
  check("description stripped of HTML",
    (j.descriptionSnippet ?? "").includes("Python & Django"), j.descriptionSnippet);

  captured = [];
  const page2 = await remotiveAdapter.search({ ...BASE, page: 2 }, {});
  check("page 2 returns empty without a network call",
    page2.length === 0 && captured.length === 0);
}

// ============ 5. Transport-level failures ============
console.log("\n5. Failure handling");
{
  let msg = "";
  try {
    await run(jsearchAdapter, BASE, { RAPIDAPI_KEY: "k" }, { message: "quota" }, 429);
  } catch (err) {
    msg = err instanceof Error ? err.message : String(err);
  }
  check("HTTP 429 names host and status", /jsearch\.p\.rapidapi\.com.*429/.test(msg), msg);
  // The body is the whole diagnostic: "quota" and "invalid key" need different fixes.
  check("429 body message surfaced, not just the status", /quota/.test(msg), msg);

  msg = "";
  try {
    await run(adzunaAdapter, BASE, { ADZUNA_APP_ID: "a", ADZUNA_APP_KEY: "b" }, {}, 401);
  } catch (err) {
    msg = err instanceof Error ? err.message : String(err);
  }
  check("HTTP 401 surfaces readably", /api\.adzuna\.com.*401/.test(msg), msg);

  // Each provider names its error field differently; all must reach the user.
  const bodyShapes: [string, unknown, RegExp][] = [
    ["Adzuna `display`", { exception: "AUTH_FAIL", display: "Authorisation failed" }, /Authorisation failed/],
    ["JSearch `message`", { message: "You are not subscribed to this API." }, /not subscribed/],
    ["Careerjet `error`", { type: "ERROR", error: "Invalid API key provided" }, /Invalid API key/],
    ["nested `error.message`", { error: { message: "bad request" } }, /bad request/],
  ];
  for (const [label, body, expected] of bodyShapes) {
    msg = "";
    try {
      await run(adzunaAdapter, BASE, { ADZUNA_APP_ID: "a", ADZUNA_APP_KEY: "b" }, body, 401);
    } catch (err) {
      msg = err instanceof Error ? err.message : String(err);
    }
    check(`error body read from ${label}`, expected.test(msg), msg);
  }

  // Bot-protection challenges are their own failure kind: no key or retry fixes
  // them, and solving one is off the table, so they must not look like an outage.
  const CF_HTML =
    '<!DOCTYPE html><html lang="en-US"><head><title>Just a moment...</title>' +
    '<meta http-equiv="X-UA-Compatible" content="IE=Edge"></head><body></body></html>';

  let res = await runRaw(joobleAdapter, BASE, { JOOBLE_API_KEY: "k" }, CF_HTML, 403, {
    "cf-mitigated": "challenge",
  });
  check("cf-mitigated header detected as a challenge",
    res.error?.name === "BotProtectionError", res.error?.name);
  check("challenge message points at the browser link",
    /search link in the browser/.test(res.error?.message ?? ""), res.error?.message);

  // Not every edge sets the header, so the interstitial body is checked too.
  res = await runRaw(joobleAdapter, BASE, { JOOBLE_API_KEY: "k" }, CF_HTML, 403);
  check("challenge body detected without the header",
    res.error?.name === "BotProtectionError", res.error?.name);

  // A 200 can carry a challenge page on some configurations.
  res = await runRaw(joobleAdapter, BASE, { JOOBLE_API_KEY: "k" }, CF_HTML, 200, {
    "cf-mitigated": "challenge",
  });
  check("challenge on a 200 still detected",
    res.error?.name === "BotProtectionError", res.error?.name);

  // An ordinary HTML error page is a plain failure, not a challenge.
  res = await runRaw(joobleAdapter, BASE, { JOOBLE_API_KEY: "k" },
    "<html><body><h1>502 Bad Gateway</h1></body></html>", 502);
  check("plain HTML error is not misread as a challenge",
    res.error !== null && res.error.name !== "BotProtectionError", res.error?.name);

  // JSearch queries Google for Jobs live and averages ~8.7s, so it must get a
  // longer ceiling than the 10s default — otherwise a normal call aborts after
  // the request credit has already been spent. Verified by holding the response
  // past the default and asserting the call still completes.
  {
    const realFetchRef = globalThis.fetch;
    // Mirrors real fetch: rejects with the signal's own reason (a TimeoutError
    // DOMException for AbortSignal.timeout), which is what fetchJson keys on.
    globalThis.fetch = ((_input: RequestInfo | URL, init?: RequestInit) => {
      const signal = init?.signal;
      return new Promise<Response>((resolve, reject) => {
        const timer = setTimeout(() => {
          resolve(
            new Response(JSON.stringify({ data: { jobs: [] } }), {
              status: 200,
              headers: { "content-type": "application/json" },
            })
          );
        }, 150);
        signal?.addEventListener("abort", () => {
          clearTimeout(timer);
          reject(signal.reason);
        });
      });
    }) as typeof fetch;

    // A 100ms ceiling must abort; the adapter's own (30s) must not.
    let aborted = "";
    try {
      await fetchJson("https://jsearch.p.rapidapi.com/search-v2", { timeoutMs: 100 });
    } catch (err) {
      aborted = err instanceof Error ? err.message : String(err);
    }
    check("a too-short ceiling aborts and names the limit", /timed out after 0\.1s/.test(aborted),
      aborted);

    let slowOk = false;
    try {
      await jsearchAdapter.search(BASE, { RAPIDAPI_KEY: "k" });
      slowOk = true;
    } catch {
      slowOk = false;
    }
    check("jsearch tolerates a response slower than the default ceiling", slowOk);
    globalThis.fetch = realFetchRef;
    installStub();
  }

  // A network-level failure must be reported, not hang.
  globalThis.fetch = (async () => {
    throw new TypeError("fetch failed");
  }) as typeof fetch;
  msg = "";
  try {
    await joobleAdapter.search(BASE, { JOOBLE_API_KEY: "k" });
  } catch (err) {
    msg = err instanceof Error ? err.message : String(err);
  }
  check("network error names host", /jooble\.org/.test(msg) && /fetch failed/.test(msg), msg);
  installStub();
}

// ============ 6. Registry: key gating + isolation + caching ============
console.log("\n6. Registry behaviour");
{
  const { getDb } = await import("@/lib/db");
  const db = getDb();
  const ALL_KEYS = [
    "RAPIDAPI_KEY", "OPENWEBNINJA_API_KEY", "ADZUNA_APP_ID",
    "ADZUNA_APP_KEY", "JOOBLE_API_KEY", "CAREERJET_API_KEY",
  ];
  // Start from no keys at all.
  for (const k of ALL_KEYS) {
    setConfigValue(k as never, "");
    delete process.env[k];
  }
  db.prepare("DELETE FROM search_cache").run();

  const KEYED = ["jsearch", "adzuna", "jooble", "careerjet"];
  let statuses = getSourceStatuses();
  check("all 6 sources listed", statuses.length === 6, statuses.map((s) => s.id).join(","));
  check("keyed sources report key missing",
    statuses.filter((s) => KEYED.includes(s.id)).every((s) => s.keyStatus === "missing"));
  check("keyless sources are always ok",
    statuses.filter((s) => !KEYED.includes(s.id)).every((s) => s.keyStatus === "ok"),
    statuses.filter((s) => !KEYED.includes(s.id)).map((s) => `${s.id}:${s.keyStatus}`).join(","));
  check("adzuna names both missing keys",
    statuses.find((s) => s.id === "adzuna")?.missingKeys.length === 2);
  check("jsearch asks for one key, not both variants",
    statuses.find((s) => s.id === "jsearch")?.missingKeys.length === 1,
    statuses.find((s) => s.id === "jsearch")?.missingKeys.join(","));

  // Either JSearch credential alone must enable the source.
  setConfigValue("OPENWEBNINJA_API_KEY", "own-key");
  check("direct key alone enables jsearch",
    getSourceStatuses().find((s) => s.id === "jsearch")?.keyStatus === "ok");
  setConfigValue("OPENWEBNINJA_API_KEY", "");
  setConfigValue("RAPIDAPI_KEY", "rapid-key");
  check("rapidapi key alone enables jsearch",
    getSourceStatuses().find((s) => s.id === "jsearch")?.keyStatus === "ok");
  setConfigValue("RAPIDAPI_KEY", "");
  check("jsearch disabled again once both are cleared",
    getSourceStatuses().find((s) => s.id === "jsearch")?.keyStatus === "missing");

  // A half-filled Adzuna pair must ask only for the field still needed.
  setConfigValue("ADZUNA_APP_ID", "only-the-id");
  const halfAdzuna = getSourceStatuses().find((s) => s.id === "adzuna");
  check("half-filled adzuna still disabled", halfAdzuna?.keyStatus === "missing");
  check("half-filled adzuna asks only for the key",
    halfAdzuna?.missingKeys.length === 1 && halfAdzuna.missingKeys[0] === "ADZUNA_APP_KEY",
    halfAdzuna?.missingKeys.join(","));
  setConfigValue("ADZUNA_APP_ID", "");

  const none = await searchAllSources(BASE, ["jsearch", "adzuna", "jooble", "careerjet"]);
  check("unkeyed sources are skipped, not called", none.results.length === 0 && none.errors.length === 0,
    `${none.results.length} results, ${none.errors.length} errors`);

  // Key only Jooble; the others must stay silent.
  setConfigValue("JOOBLE_API_KEY", "jooble-key-1");
  statuses = getSourceStatuses();
  check("jooble now ok", statuses.find((s) => s.id === "jooble")?.keyStatus === "ok");
  check("other keyed sources still missing",
    statuses
      .filter((s) => KEYED.includes(s.id) && s.id !== "jooble")
      .every((s) => s.keyStatus === "missing"));

  nextResponse = {
    status: 200,
    json: { jobs: [{ id: 1, title: "Backend Engineer", company: "A", location: "Cebu", link: "https://x/1" }] },
  };
  captured = [];
  const one = await searchAllSources(BASE, ["jsearch", "adzuna", "jooble", "careerjet"]);
  check("only the keyed source is queried", captured.length === 1, `${captured.length} HTTP call(s)`);
  check("its result comes through", one.results.length === 1);
  check("no cache hit on first call", one.fromCache.length === 0);

  // Identical params must now be served from the 6h cache.
  captured = [];
  const cached = await searchAllSources(BASE, ["jooble"]);
  check("second identical search hits cache", cached.fromCache.includes("jooble"),
    cached.fromCache.join(",") || "(none)");
  check("cache avoids the network entirely", captured.length === 0, `${captured.length} HTTP call(s)`);
  check("cached results identical", cached.results.length === 1);

  // Different params must miss the cache.
  captured = [];
  const other = await searchAllSources({ ...BASE, keywords: "data analyst" }, ["jooble"]);
  check("different params bypass cache", other.fromCache.length === 0 && captured.length === 1);

  // One source failing must not take down the others.
  setConfigValue("RAPIDAPI_KEY", "rk");
  db.prepare("DELETE FROM search_cache").run();
  let callIndex = 0;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : String(input);
    callIndex++;
    if (url.includes("rapidapi")) {
      return new Response("nope", { status: 500 });
    }
    return new Response(
      JSON.stringify({ jobs: [{ id: 7, title: "QA Engineer", company: "B", location: "Manila", link: "https://x/7" }] }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  }) as typeof fetch;

  const mixed = await searchAllSources({ ...BASE, keywords: "qa engineer" }, ["jsearch", "jooble"]);
  check("failing source reported as an error", mixed.errors.some((e) => e.source === "jsearch"),
    mixed.errors.map((e) => e.source).join(","));
  check("plain failure classified as an error", mixed.errors[0]?.kind === "error",
    mixed.errors[0]?.kind);
  check("healthy source still returns results", mixed.results.length === 1, `${mixed.results.length}`);
  check("both sources were attempted", callIndex === 2, `${callIndex} calls`);

  // A challenged source must be reported as blocked, not as a generic failure —
  // the UI wording and the suggested fix differ.
  db.prepare("DELETE FROM search_cache").run();
  globalThis.fetch = (async () =>
    new Response('<!DOCTYPE html><title>Just a moment...</title>', {
      status: 403,
      headers: { "cf-mitigated": "challenge", "content-type": "text/html" },
    })) as typeof fetch;
  const blocked = await searchAllSources({ ...BASE, keywords: "blocked probe" }, ["jooble"]);
  check("challenged source classified as blocked", blocked.errors[0]?.kind === "blocked",
    blocked.errors[0]?.kind);
  check("blocked source yields no results", blocked.results.length === 0);
  // A failed call must not cache an empty result, or the 6h TTL would keep
  // serving "no jobs" long after the block lifted.
  const cacheRows = db.prepare("SELECT COUNT(*) c FROM search_cache").get() as { c: number };
  check("no cache row written for a blocked source", cacheRows.c === 0, String(cacheRows.c));
  installStub();

  // Leave no test keys behind.
  for (const k of ALL_KEYS) setConfigValue(k as never, "");
  db.prepare("DELETE FROM search_cache").run();
  check("test keys cleaned up",
    getSourceStatuses().filter((s) => KEYED.includes(s.id)).every((s) => s.keyStatus === "missing"));
}

// ============ 6b. Philippines focus ============
console.log("\n6b. Philippines focus");
{
  const {
    isOpenToPhilippines,
    looksTechnicalQuery,
    isNonTechnicalCategory,
    publisherRank,
    focusOnPhilippines,
  } = await import("@/lib/sources/relevance");

  // Eligibility strings taken verbatim from live Remotive payloads.
  const eligible: [string, boolean][] = [
    ["Worldwide", true],
    ["Anywhere", true],
    ["Philippines", true],
    ["Americas, Europe, Asia, Africa, Oceania", true],
    ["Northern America, LATAM, Europe, APAC", true],
    ["USA", false],
    ["Brazil", false],
    ["Canada", false],
    ["LATAM, Europe", false],
    ["USA, CST (UTC-6)", false],
    ["Europe, UK, Germany, France, European timezones", false],
  ];
  for (const [value, want] of eligible) {
    check(`${want ? "open to PH" : "restricted"}: ${value}`,
      isOpenToPhilippines(value) === want);
  }
  // An unstated location is not a restriction — dropping those hides real jobs.
  check("empty location is kept", isOpenToPhilippines("") === true);
  check("undefined location is kept", isOpenToPhilippines(undefined) === true);
  check("an unrecognised city is kept", isOpenToPhilippines("Remote (Cebu hub)") === true);

  check("technical query detected", looksTechnicalQuery("software engineer"));
  check("developer detected", looksTechnicalQuery("backend developer"));
  check("non-technical query not misread", !looksTechnicalQuery("virtual assistant"));

  check("Design is non-technical", isNonTechnicalCategory("Design"));
  check("Customer Service is non-technical", isNonTechnicalCategory("Customer Support & Success"));
  check("Software Development is technical", !isNonTechnicalCategory("Software Development"));
  check("AI is technical", !isNonTechnicalCategory("Artificial Intelligence"));
  // Denylist, not allowlist: an unknown category must never silently drop a job.
  check("unknown category is kept", !isNonTechnicalCategory("Quantum Widgetry"));
  check("missing category is kept", !isNonTechnicalCategory(undefined));

  check("jobstreet ranks above linkedin", publisherRank("Jobstreet") < publisherRank("LinkedIn"));
  check("preferred board beats an aggregator",
    publisherRank("Foundit") < publisherRank("BeBee"));
  check("unknown publisher sorts last",
    publisherRank("BeBee") < publisherRank(undefined));

  // End to end over a mixed batch.
  const base = { externalId: "x", source: "remotive" as const, company: "C", isRemote: true, url: "u" };
  const batch = [
    { ...base, externalId: "1", title: "Backend Engineer", location: "USA", category: "Software Development" },
    { ...base, externalId: "2", title: "Graphic Designer", location: "Worldwide", category: "Design" },
    { ...base, externalId: "3", title: "Software Engineer", location: "Worldwide", category: "Software Development", sourcePublisher: "BeBee" },
    { ...base, externalId: "4", title: "Python Engineer", location: "Anywhere", category: "Software Development", sourcePublisher: "Jobstreet" },
    { ...base, externalId: "5", title: "Support Agent", location: "Brazil", category: "Customer Service" },
  ];
  const { kept, counts } = focusOnPhilippines(batch, "software engineer");
  check("restricted and off-topic both removed", kept.length === 2,
    kept.map((j) => j.externalId).join(","));
  check("counts reported separately",
    counts.notOpenToPh === 2 && counts.offTopic === 1,
    JSON.stringify(counts));
  check("preferred publisher ranked first", kept[0].externalId === "4", kept[0].externalId);
  check("input array not mutated", batch.length === 5);

  // A non-technical SEARCH must not apply the technical category filter, or
  // someone hunting a design role would see nothing.
  const designHunt = focusOnPhilippines(batch, "graphic designer");
  check("non-technical search keeps design roles",
    designHunt.kept.some((j) => j.category === "Design"), `${designHunt.kept.length} kept`);
  check("non-technical search drops nothing as off-topic", designHunt.counts.offTopic === 0);
}

// ============ 6bb. Pasted-credential validation ============
// A saved dashboard URL used to look identical to a saved key, then failed much
// later as an unexplained "not subscribed" from the provider.
console.log("\n6bb. Pasted-credential validation");
{
  const { rejectionReasonFor } = await import("@/lib/config");

  const rejected: [string, string][] = [
    ["https://rapidapi.com/console/12202138/applications/9034282/authorizations", "a dashboard URL"],
    ["http://example.com/key", "any URL"],
    ["3870f065f0msh 0c07d5df82963", "a value with a space"],
    ["key\nwith-newline", "a value with a line break"],
    ['"abc123def456"', "a quoted value"],
    ["<your-key-here>", "a placeholder"],
  ];
  for (const [value, label] of rejected) {
    check(`rejects ${label}`, rejectionReasonFor("RAPIDAPI_KEY", value) !== null,
      JSON.stringify(value.slice(0, 24)));
  }
  // The URL message must name where the real key actually is.
  const urlMessage = rejectionReasonFor("RAPIDAPI_KEY", "https://rapidapi.com/console/1/x") ?? "";
  check("URL rejection says what to copy instead",
    /Application Key/.test(urlMessage) && /URL, not a key/.test(urlMessage), urlMessage);

  // Real credentials of every shape these providers issue must pass. Length and
  // charset are intentionally unchecked so a format change cannot lock one out.
  const accepted: [string, string, string][] = [
    ["RAPIDAPI_KEY", "3870f065f0mshad0c07d5df82963p1deea3jsnae51fd1e1345", "a RapidAPI key"],
    ["ANTHROPIC_API_KEY", "sk-ant-api03-aBcD_123-xyz", "an Anthropic key with dashes and underscores"],
    ["CAREERJET_API_KEY", "a1b2c3d4", "a short key"],
    ["ADZUNA_APP_ID", "0f1e2d3c", "an Adzuna app id"],
    ["OPENWEBNINJA_API_KEY", "own_live_ABC123.def456", "a key containing a dot"],
  ];
  for (const [key, value, label] of accepted) {
    check(`accepts ${label}`, rejectionReasonFor(key as never, value) === null,
      String(rejectionReasonFor(key as never, value)));
  }

  check("clearing a key is allowed", rejectionReasonFor("RAPIDAPI_KEY", "") === null);
  check("whitespace-only is treated as clearing",
    rejectionReasonFor("RAPIDAPI_KEY", "   ") === null);
  // Non-secret settings are free text — a location legitimately has spaces.
  check("non-secret setting may contain spaces",
    rejectionReasonFor("DEFAULT_LOCATION", "Metro Manila") === null);
  check("non-secret setting may be a URL", rejectionReasonFor("AI_MODEL", "https://x") === null);
}

// ============ 6c. Smart-link ordering ============
console.log("\n6c. Smart-link ordering");
{
  const { buildSmartLinks } = await import("@/lib/sources/smartLinks");
  const links = buildSmartLinks(BASE);
  const ids = links.map((l) => l.id);
  check("all links still present", links.length === 12, `${links.length}`);
  check("every URL is valid", links.every((l) => {
    try { new URL(l.url); return true; } catch { return false; }
  }));
  // The boards that have actually produced offers come first.
  check("jobstreet first", ids[0] === "jobstreet", ids[0]);
  check("proven boards lead the list",
    ids.slice(0, 6).join(",") ===
      "jobstreet,linkedin,onlinejobs,foundit,facebook-posts,facebook-groups",
    ids.slice(0, 6).join(","));
  check("no link lost to the reordering", new Set(ids).size === links.length);
}

// ============ 7. Merge across sources ============
console.log("\n7. Cross-source merge");
{
  const fromJsearch: NormalizedJob = {
    externalId: "1", source: "jsearch", sourcePublisher: "LinkedIn",
    title: "Senior Backend Engineer", company: "Coins.ph", location: "Makati, PH",
    isRemote: true, url: "https://a", descriptionSnippet: "short",
    postedAt: "2026-07-20T00:00:00Z",
  };
  const fromJooble: NormalizedJob = {
    externalId: "2", source: "jooble", sourcePublisher: "jobstreet.com.ph",
    title: "Sr. Backend Engineer (URGENT)", company: "Coins.ph Inc.", location: "Makati",
    isRemote: false, url: "https://b",
    descriptionSnippet: "a considerably longer description with real detail",
    salaryMin: 150000, salaryCurrency: "PHP", salaryPeriod: "month",
  };
  const unrelated: NormalizedJob = {
    externalId: "3", source: "careerjet", title: "Data Analyst", company: "Globe",
    location: "Taguig", isRemote: false, url: "https://c",
  };

  const { merged, duplicatesMerged } = dedupeJobs([fromJsearch, fromJooble, unrelated]);
  check("same role across sources merges", merged.length === 2, `${merged.length} of 3`);
  check("duplicate counted", duplicatesMerged === 1);
  const combined = merged.find((j) => /backend/i.test(j.title))!;
  check("both source badges kept", combined.sources.length === 2,
    combined.sources.map((s) => s.publisher ?? s.source).join(" + "));
  check("richest description wins as canonical",
    (combined.descriptionSnippet ?? "").includes("considerably longer"));
  check("salary taken from whichever source had it", combined.salaryMin === 150000);
  check("postedAt taken from whichever source had it", combined.postedAt === "2026-07-20T00:00:00Z");
  check("unrelated job untouched", merged.some((j) => j.title === "Data Analyst"));
}

restoreFetch();
console.log(`\n${failures === 0 ? "ALL SEARCH CHECKS PASSED" : `${failures} SEARCH CHECK(S) FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);
