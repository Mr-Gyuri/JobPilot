import * as cheerio from "cheerio";
import { htmlFragmentToText } from "@/lib/ingest/extractText";
import { splitSections } from "@/lib/ingest/heuristics";
import type { ExtractedJob, WorkMode } from "@/lib/types";

// Most job boards (JobStreet, Kalibrr, Indeed, LinkedIn, Jora, Foundit,
// Greenhouse, Lever, Workable) embed a schema.org JobPosting. When present it
// is by far the most reliable source — no AI call and no guessing.

type Json = Record<string, unknown>;

function tolerantParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    try {
      // Trailing commas are the usual culprit in hand-rolled JSON-LD.
      return JSON.parse(raw.replace(/,\s*([}\]])/g, "$1"));
    } catch {
      return null;
    }
  }
}

function* walk(node: unknown): Generator<Json> {
  if (Array.isArray(node)) {
    for (const item of node) yield* walk(item);
    return;
  }
  if (node && typeof node === "object") {
    const obj = node as Json;
    yield obj;
    if ("@graph" in obj) yield* walk(obj["@graph"]);
  }
}

function isJobPosting(node: Json): boolean {
  const type = node["@type"];
  if (typeof type === "string") return type.toLowerCase().includes("jobposting");
  if (Array.isArray(type)) {
    return type.some((t) => typeof t === "string" && t.toLowerCase().includes("jobposting"));
  }
  return false;
}

function str(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number") return String(value);
  return null;
}

function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[,\s]/g, ""));
    if (Number.isFinite(parsed)) return Math.round(parsed);
  }
  return null;
}

function readCompany(node: Json): string | null {
  const org = node.hiringOrganization;
  if (typeof org === "string") return org.trim() || null;
  if (org && typeof org === "object") return str((org as Json).name);
  return null;
}

function readLocation(node: Json): string | null {
  const raw = node.jobLocation;
  const first = Array.isArray(raw) ? raw[0] : raw;
  if (typeof first === "string") return first.trim() || null;
  if (!first || typeof first !== "object") return null;
  const address = (first as Json).address;
  if (typeof address === "string") return address.trim() || null;
  if (!address || typeof address !== "object") return null;
  const a = address as Json;
  const parts = [
    str(a.addressLocality),
    str(a.addressRegion),
    str(a.addressCountry) ??
      (a.addressCountry && typeof a.addressCountry === "object"
        ? str((a.addressCountry as Json).name)
        : null),
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}

function readEmploymentType(node: Json): string | null {
  const raw = node.employmentType;
  const value = Array.isArray(raw) ? str(raw[0]) : str(raw);
  if (!value) return null;
  return value.toLowerCase().replace(/_/g, "-").replace(/\s+/g, "-");
}

const UNIT_TO_PERIOD: Record<string, string> = {
  HOUR: "hour",
  DAY: "day",
  WEEK: "week",
  MONTH: "month",
  YEAR: "year",
};

function readSalary(node: Json): {
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  salaryPeriod: string | null;
} {
  const empty = { salaryMin: null, salaryMax: null, salaryCurrency: null, salaryPeriod: null };
  const base = node.baseSalary;
  if (!base || typeof base !== "object") return empty;
  const b = base as Json;
  const currency = str(b.currency) ?? str((b.value as Json | undefined)?.currency);
  const value = b.value;
  if (!value || typeof value !== "object") {
    const flat = num(b.value);
    return flat == null
      ? empty
      : { salaryMin: flat, salaryMax: null, salaryCurrency: currency, salaryPeriod: null };
  }
  const v = value as Json;
  const min = num(v.minValue) ?? num(v.value);
  const max = num(v.maxValue);
  const unit = str(v.unitText)?.toUpperCase() ?? "";
  return {
    salaryMin: min,
    salaryMax: max,
    salaryCurrency: currency ?? str(v.currency),
    salaryPeriod: UNIT_TO_PERIOD[unit] ?? null,
  };
}

function readWorkMode(node: Json): WorkMode | null {
  const type = str(node.jobLocationType);
  if (type && type.toUpperCase().includes("TELECOMMUTE")) return "remote";
  return null;
}

export interface JsonLdJob extends Partial<ExtractedJob> {
  postedAt?: string | null;
}

/** Parse a schema.org JobPosting out of a page's JSON-LD blocks. */
export function extractJobPosting(html: string): JsonLdJob | null {
  const $ = cheerio.load(html);
  const blocks = $('script[type="application/ld+json"]')
    .map((_, el) => $(el).contents().text())
    .get();

  for (const block of blocks) {
    const parsed = tolerantParse(block);
    if (!parsed) continue;
    for (const node of walk(parsed)) {
      if (!isJobPosting(node)) continue;
      const title = str(node.title);
      if (!title) continue;

      const descriptionHtml = str(node.description) ?? "";
      const description = descriptionHtml ? htmlFragmentToText(descriptionHtml) : "";
      const { responsibilities, requirements } = splitSections(description);

      return {
        title,
        company: readCompany(node),
        location: readLocation(node),
        workMode: readWorkMode(node),
        employmentType: readEmploymentType(node),
        ...readSalary(node),
        responsibilities,
        requirements,
        skills: [],
        rawText: description,
        extractionMethod: "jsonld",
        postedAt: str(node.datePosted),
      };
    }
  }
  return null;
}
