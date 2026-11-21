/**
 * Verifies the URL ingestion path: robots.txt compliance, real HTTP fetch,
 * schema.org JobPosting extraction, anti-bot detection, and the paste fallback.
 *
 * A local server provides deterministic pages; one real-world check confirms we
 * actually honour a site that disallows crawling.
 */
import http from "node:http";

let failures = 0;
const check = (label: string, ok: boolean, detail?: string) => {
  if (!ok) failures++;
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${label}${detail ? ` — ${detail}` : ""}`);
};

const { ingestFromUrl, ingestFromText } = await import("@/lib/ingest/pipeline");
const { isAllowedByRobots } = await import("@/lib/ingest/robots");

// ---------- local fixture server ----------
const JSON_LD_PAGE = `<!DOCTYPE html><html><head>
<title>Senior Data Engineer - Northwind Analytics | Careers</title>
<meta property="og:site_name" content="Northwind Analytics">
<script type="application/ld+json">
{
  "@context": "https://schema.org/",
  "@type": "JobPosting",
  "title": "Senior Data Engineer",
  "datePosted": "2026-07-20",
  "employmentType": "FULL_TIME",
  "jobLocationType": "TELECOMMUTE",
  "hiringOrganization": { "@type": "Organization", "name": "Northwind Analytics" },
  "jobLocation": { "@type": "Place", "address": {
    "@type": "PostalAddress", "addressLocality": "Taguig", "addressRegion": "Metro Manila", "addressCountry": "PH" }},
  "baseSalary": { "@type": "MonetaryAmount", "currency": "PHP",
    "value": { "@type": "QuantitativeValue", "minValue": 150000, "maxValue": 220000, "unitText": "MONTH" }},
  "description": "<p>Own our analytics platform.</p><h3>Responsibilities</h3><ul><li>Build and maintain ELT pipelines in Airflow and dbt</li><li>Model the warehouse in Snowflake for analytics consumers</li><li>Partner with analysts on data quality and testing</li></ul><h3>Requirements</h3><ul><li>5+ years in data engineering</li><li>Expert SQL and strong Python</li><li>Production experience with Airflow, dbt and Snowflake</li><li>Comfortable with Terraform and CI/CD</li></ul>",
}
</script></head><body><h1>Senior Data Engineer</h1></body></html>`;

const PLAIN_PAGE = `<!DOCTYPE html><html><head>
<title>Bookkeeper (Remote) - Sunrise Outsourcing</title>
<meta property="og:site_name" content="Sunrise Outsourcing"></head><body>
<nav>Home Jobs About</nav>
<main>
<h1>Bookkeeper (Remote)</h1>
<p>Sunrise Outsourcing is hiring a bookkeeper for a US client. Fully remote, PHP 45,000 - 60,000 per month.</p>
<h2>Responsibilities</h2>
<ul><li>Maintain the general ledger in QuickBooks Online</li><li>Perform monthly bank reconciliation</li><li>Process accounts payable and accounts receivable</li></ul>
<h2>Requirements</h2>
<ul><li>3+ years of bookkeeping experience</li><li>Proficiency in QuickBooks and Excel</li><li>Attention to detail and strong written English</li></ul>
</main><footer>&copy; 2026</footer></body></html>`;

const CAPTCHA_PAGE = `<!DOCTYPE html><html><head><title>Just a moment...</title></head>
<body>Checking your browser before accessing. Please enable JavaScript and cookies to continue.</body></html>`;

const server = http.createServer((req, res) => {
  const url = req.url ?? "/";
  if (url === "/robots.txt") {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("User-agent: *\nDisallow: /private/\nAllow: /\n");
    return;
  }
  if (url.startsWith("/private/")) {
    res.writeHead(200, { "content-type": "text/html" });
    res.end(JSON_LD_PAGE);
    return;
  }
  if (url === "/jobs/json-ld") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(JSON_LD_PAGE);
    return;
  }
  if (url === "/jobs/plain") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(PLAIN_PAGE);
    return;
  }
  if (url === "/jobs/captcha") {
    res.writeHead(200, { "content-type": "text/html" });
    res.end(CAPTCHA_PAGE);
    return;
  }
  if (url === "/jobs/403") {
    res.writeHead(403, { "content-type": "text/html" });
    res.end("<html><body>Forbidden</body></html>");
    return;
  }
  if (url === "/jobs/pdf") {
    res.writeHead(200, { "content-type": "application/pdf" });
    res.end("%PDF-1.4");
    return;
  }
  res.writeHead(404).end("not found");
});

await new Promise<void>((resolve) => server.listen(4571, "127.0.0.1", resolve));
const BASE = "http://127.0.0.1:4571";

console.log("\n1. robots.txt compliance (local)");
check("allowed path", (await isAllowedByRobots(`${BASE}/jobs/json-ld`)).allowed);
const disallowed = await isAllowedByRobots(`${BASE}/private/secret-job`);
check("disallowed path refused", !disallowed.allowed, disallowed.reason);

console.log("\n2. schema.org JobPosting extraction");
{
  const result = await ingestFromUrl(`${BASE}/jobs/json-ld`);
  if (!result.ok) {
    check("ingest ok", false, result.message);
  } else {
    const j = result.job;
    check("used JSON-LD", j.extractionMethod === "jsonld", j.extractionMethod);
    check("title", j.title === "Senior Data Engineer", j.title);
    check("company", j.company === "Northwind Analytics", String(j.company));
    check("location", (j.location ?? "").includes("Taguig"), String(j.location));
    check("remote from TELECOMMUTE", j.workMode === "remote", String(j.workMode));
    check("employment type normalised", j.employmentType === "full-time", String(j.employmentType));
    check("salary range", j.salaryMin === 150000 && j.salaryMax === 220000,
      `${j.salaryCurrency} ${j.salaryMin}-${j.salaryMax}/${j.salaryPeriod}`);
    check("salary period", j.salaryPeriod === "month", String(j.salaryPeriod));
    check("responsibilities from HTML description", j.responsibilities.length === 3,
      `${j.responsibilities.length}`);
    check("requirements from HTML description", j.requirements.length === 4, `${j.requirements.length}`);
    check("description text has no HTML tags", !/<[a-z]/i.test(j.rawText));
    check("sourceUrl preserved", result.sourceUrl === `${BASE}/jobs/json-ld`);
  }
}

console.log("\n3. Page with no JSON-LD (heuristic path)");
{
  const result = await ingestFromUrl(`${BASE}/jobs/plain`);
  if (!result.ok) {
    check("ingest ok", false, result.message);
  } else {
    const j = result.job;
    check("title from h1/og", /Bookkeeper/i.test(j.title), j.title);
    check("company from og:site_name", j.company === "Sunrise Outsourcing", String(j.company));
    check("remote detected", j.workMode === "remote", String(j.workMode));
    check("salary parsed", j.salaryMin === 45000 && j.salaryMax === 60000,
      `${j.salaryCurrency} ${j.salaryMin}-${j.salaryMax}/${j.salaryPeriod}`);
    check("responsibilities", j.responsibilities.length >= 3, `${j.responsibilities.length}`);
    check("requirements", j.requirements.length >= 3, `${j.requirements.length}`);
    check("nav/footer stripped", !/Home Jobs About/.test(j.rawText) && !/2026/.test(j.rawText.slice(-20)));
  }
}

console.log("\n4. Blocked / unusable responses fall back to paste");
{
  const robots = await ingestFromUrl(`${BASE}/private/secret-job`);
  check("robots disallow -> ROBOTS_DISALLOWED",
    !robots.ok && robots.code === "ROBOTS_DISALLOWED", !robots.ok ? robots.code : "ok");
  check("message mentions pasting", !robots.ok && /paste/i.test(robots.message));

  const captcha = await ingestFromUrl(`${BASE}/jobs/captcha`);
  check("anti-bot page -> FETCH_BLOCKED",
    !captcha.ok && captcha.code === "FETCH_BLOCKED", !captcha.ok ? captcha.code : "ok");

  const forbidden = await ingestFromUrl(`${BASE}/jobs/403`);
  check("HTTP 403 -> FETCH_BLOCKED",
    !forbidden.ok && forbidden.code === "FETCH_BLOCKED", !forbidden.ok ? forbidden.code : "ok");

  const pdf = await ingestFromUrl(`${BASE}/jobs/pdf`);
  check("non-HTML -> FETCH_BLOCKED", !pdf.ok && pdf.code === "FETCH_BLOCKED", !pdf.ok ? pdf.code : "ok");

  const bad = await ingestFromUrl("not-a-url");
  check("invalid URL rejected", !bad.ok && bad.code === "UNSUPPORTED_CONTENT");

  const ftp = await ingestFromUrl("ftp://example.com/job");
  check("non-http scheme rejected", !ftp.ok && ftp.code === "UNSUPPORTED_CONTENT");
}

console.log("\n5. Paste fallback guards");
{
  const tooShort = await ingestFromText("Backend dev needed");
  check("too-short paste rejected", !tooShort.ok && tooShort.code === "UNSUPPORTED_CONTENT");
  const ok = await ingestFromText(
    "Senior QA Engineer\nAcme Software\n\nRequirements\n- 4+ years in test automation\n- Strong Playwright and TypeScript\n- Experience with CI/CD pipelines",
    "https://example.com/ref"
  );
  check("valid paste accepted", ok.ok);
  check("reference URL kept", ok.ok && ok.sourceUrl === "https://example.com/ref");
  check("company from second line", ok.ok && ok.job.company === "Acme Software",
    ok.ok ? String(ok.job.company) : "");
}

console.log("\n6. Real-world robots.txt (network)");
try {
  const linkedin = await isAllowedByRobots(
    "https://www.linkedin.com/jobs/view/1234567890/"
  );
  check("LinkedIn job path is disallowed for crawlers", !linkedin.allowed,
    linkedin.allowed ? "allowed (LinkedIn robots.txt may have changed)" : linkedin.reason);
} catch (err) {
  console.log(`  [SKIP] network unavailable — ${err instanceof Error ? err.message : err}`);
}

server.close();
console.log(`\n${failures === 0 ? "ALL URL-INGEST CHECKS PASSED" : `${failures} URL-INGEST CHECK(S) FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);
