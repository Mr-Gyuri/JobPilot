import * as cheerio from "cheerio";
import { normalizeText } from "@/lib/ingest/extractText";
import type { ExtractedJob, WorkMode } from "@/lib/types";

const PH_CITIES = [
  "Metro Manila", "Manila", "Makati", "Taguig", "BGC", "Bonifacio Global City", "Quezon City",
  "Pasig", "Mandaluyong", "Ortigas", "Alabang", "Muntinlupa", "Parañaque", "Paranaque", "Pasay",
  "Caloocan", "Marikina", "Antipolo", "Cebu City", "Cebu", "Davao City", "Davao", "Iloilo",
  "Bacolod", "Baguio", "Clark", "Pampanga", "Angeles City", "Cavite", "Laguna", "Batangas",
  "Cagayan de Oro", "General Santos", "Zamboanga", "Philippines",
];

const RESP_HEADING =
  /^(?:key\s+)?(?:responsibilit|duties|what\s+you.{0,3}ll\s+do|the\s+role|role\s+description|about\s+the\s+role|job\s+description|scope\s+of\s+work)/i;
const REQ_HEADING =
  /^(?:requirement|qualification|what\s+we.{0,3}re\s+looking\s+for|must[- ]have|minimum\s+qualification|skills?\s+(?:and|&)\s+qualification|who\s+you\s+are|desired\s+skills)/i;
const OTHER_HEADING =
  /^(?:benefits?|perks?|about\s+(?:us|the\s+company)|compensation|why\s+join|how\s+to\s+apply|nice[- ]to[- ]have|preferred\s+qualification|equal\s+opportunity)/i;

function isHeadingLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length > 80) return false;
  return RESP_HEADING.test(trimmed) || REQ_HEADING.test(trimmed) || OTHER_HEADING.test(trimmed);
}

function isListItem(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (/^[-•*–▪○·⁃∙]/.test(trimmed)) return true;
  if (/^\d+[.)]\s/.test(trimmed)) return true;
  // Unbulleted but sentence-like lines inside a section still read as items.
  return trimmed.length > 15 && trimmed.length < 300;
}

function cleanItem(line: string): string {
  return line
    .trim()
    .replace(/^[-•*–▪○·⁃∙]+\s*/, "")
    .replace(/^\d+[.)]\s*/, "")
    .trim();
}

/** Split a job description body into responsibilities and requirements. */
export function splitSections(text: string): {
  responsibilities: string[];
  requirements: string[];
} {
  const lines = text.split("\n");
  const responsibilities: string[] = [];
  const requirements: string[] = [];
  let bucket: "resp" | "req" | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (isHeadingLine(trimmed)) {
      if (RESP_HEADING.test(trimmed)) bucket = "resp";
      else if (REQ_HEADING.test(trimmed)) bucket = "req";
      else bucket = null;
      continue;
    }
    if (!bucket) continue;
    if (!isListItem(trimmed)) continue;
    const item = cleanItem(trimmed);
    if (!item) continue;
    const target = bucket === "resp" ? responsibilities : requirements;
    if (target.length < 30 && !target.includes(item)) target.push(item);
  }

  return { responsibilities, requirements };
}

const SKILL_HINTS =
  /\b(javascript|typescript|python|java|c#|c\+\+|php|ruby|golang|kotlin|swift|sql|html|css|react|angular|vue|node\.?js|next\.?js|django|flask|laravel|spring|\.net|aws|azure|gcp|docker|kubernetes|terraform|jenkins|git|jira|figma|photoshop|excel|power bi|tableau|salesforce|sap|quickbooks|xero|autocad|seo|wordpress|shopify|mongodb|postgresql|mysql|redis|kafka|graphql|rest|agile|scrum|tdd|ci\/cd|linux|bash|powershell)\b/gi;

function guessSkills(text: string): string[] {
  const found = new Map<string, string>();
  for (const match of text.matchAll(SKILL_HINTS)) {
    const raw = match[0];
    const key = raw.toLowerCase();
    if (!found.has(key)) found.set(key, raw);
  }
  return [...found.values()].slice(0, 25);
}

function detectWorkMode(text: string): WorkMode | null {
  if (/\b(remote|work from home|wfh|telecommut)/i.test(text)) return "remote";
  if (/\bhybrid\b/i.test(text)) return "hybrid";
  if (/\bon-?site\b|\bin-?office\b/i.test(text)) return "onsite";
  return null;
}

function detectEmploymentType(text: string): string | null {
  const match = text.match(/\b(full[- ]?time|part[- ]?time|contract|contractual|temporary|internship|intern|freelance|project[- ]based)\b/i);
  if (!match) return null;
  return match[1].toLowerCase().replace(/\s+/g, "-").replace("contractual", "contract");
}

function parseAmount(raw: string, kSuffix: string | undefined): number | null {
  const cleaned = raw.replace(/,/g, "");
  const value = Number(cleaned);
  if (!Number.isFinite(value)) return null;
  return kSuffix ? Math.round(value * 1000) : Math.round(value);
}

function detectSalary(text: string): {
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  salaryPeriod: string | null;
} {
  const empty = { salaryMin: null, salaryMax: null, salaryCurrency: null, salaryPeriod: null };
  const re =
    /(?:(PHP|Php|php|₱|P|\$|USD|SGD|AUD)\s?)([\d,]+(?:\.\d+)?)\s*(k|K)?\s*(?:(?:[-–—]|to)\s*(?:(?:PHP|Php|php|₱|P|\$|USD|SGD|AUD)\s?)?([\d,]+(?:\.\d+)?)\s*(k|K)?)?/;
  const match = text.match(re);
  if (!match) return empty;

  const salaryMin = parseAmount(match[2], match[3]);
  const salaryMax = match[4] ? parseAmount(match[4], match[5]) : null;
  if (salaryMin == null || salaryMin < 100) return empty;

  const symbol = (match[1] ?? "").toLowerCase();
  const salaryCurrency =
    symbol === "$" || symbol === "usd"
      ? "USD"
      : symbol === "sgd"
        ? "SGD"
        : symbol === "aud"
          ? "AUD"
          : "PHP";

  const window = text.slice(Math.max(0, match.index! - 40), match.index! + match[0].length + 60);
  const salaryPeriod = /per\s+hour|\/\s?hr|hourly/i.test(window)
    ? "hour"
    : /per\s+ann|annual|per\s+year|\/\s?yr|yearly/i.test(window)
      ? "year"
      : /per\s+month|\/\s?mo|monthly/i.test(window)
        ? "month"
        : null;

  return { salaryMin, salaryMax, salaryCurrency, salaryPeriod };
}

function detectLocation(text: string): string | null {
  for (const city of PH_CITIES) {
    const re = new RegExp(`\\b${city.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    if (re.test(text)) return city;
  }
  const generic = text.match(/\b([A-Z][a-z]+(?: [A-Z][a-z]+)*),\s*([A-Z][a-z]+|[A-Z]{2})\b/);
  return generic ? generic[0] : null;
}

function detectTitleAndCompany(
  text: string,
  html?: string
): { title: string; company: string | null } {
  let title = "";
  let company: string | null = null;

  if (html) {
    const $ = cheerio.load(html);
    const ogTitle = $('meta[property="og:title"]').attr("content")?.trim();
    const docTitle = $("title").first().text().trim();
    const h1 = $("h1").first().text().trim();
    title = ogTitle || h1 || docTitle || "";
    // "Senior Dev - Acme Inc | JobBoard" -> drop the trailing site name.
    if (title.includes("|")) title = title.split("|")[0].trim();
    company =
      $('meta[property="og:site_name"]').attr("content")?.trim() ||
      $('meta[name="author"]').attr("content")?.trim() ||
      null;
    const dashSplit = title.split(/\s+[-–—]\s+/);
    if (!company && dashSplit.length >= 2) {
      title = dashSplit[0].trim();
      company = dashSplit.slice(1).join(" - ").trim() || null;
    } else if (dashSplit.length >= 2 && company && dashSplit[1].trim() === company) {
      title = dashSplit[0].trim();
    }
  }

  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  if (!title) {
    title = (lines[0] ?? "").slice(0, 120);
  }
  if (!company) {
    const atMatch = text.slice(0, 600).match(/\bat\s+([A-Z][\w&.,'-]*(?:\s+[A-Z][\w&.,'-]*){0,4})/);
    if (atMatch) company = atMatch[1].replace(/[.,]$/, "").trim();
  }
  if (!company) {
    // Pasted postings very often put the employer on the line right under the
    // title. Accept a short Title-Case line that isn't a section heading.
    for (const candidate of lines.slice(1, 4)) {
      if (candidate === title) continue;
      if (candidate.length > 60 || candidate.split(/\s+/).length > 7) continue;
      if (candidate.includes(":") || isListItem(candidate) === false && /[.!?]$/.test(candidate)) continue;
      if (isHeadingLine(candidate)) continue;
      if (!/^[A-Z]/.test(candidate)) continue;
      if (/\b(about|responsib|requirement|qualification|benefit|overview|summary|role|position|apply)\b/i.test(candidate)) {
        continue;
      }
      company = candidate.replace(/[.,]$/, "").trim();
      break;
    }
  }

  return { title: title.trim() || "Untitled role", company };
}

/** Deterministic job extraction — used with no AI key, and as the AI fallback. */
export function extractJobHeuristic(text: string, html?: string): ExtractedJob {
  const body = normalizeText(text);
  const { title, company } = detectTitleAndCompany(body, html);
  const { responsibilities, requirements } = splitSections(body);
  const salary = detectSalary(body);

  return {
    title,
    company,
    location: detectLocation(body),
    workMode: detectWorkMode(body),
    employmentType: detectEmploymentType(body),
    ...salary,
    responsibilities,
    requirements,
    skills: guessSkills(body),
    rawText: body,
    extractionMethod: "heuristic",
  };
}
