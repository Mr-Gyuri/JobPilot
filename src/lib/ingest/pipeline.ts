import { isAIAvailable } from "@/lib/ai/client";
import { isAIFallbackError } from "@/lib/ai/errors";
import { fetchPage } from "@/lib/ingest/fetchPage";
import { isAllowedByRobots } from "@/lib/ingest/robots";
import { extractJobPosting } from "@/lib/ingest/jsonld";
import { pageToText } from "@/lib/ingest/extractText";
import { extractJobHeuristic } from "@/lib/ingest/heuristics";
import { extractJobWithAI } from "@/lib/ingest/ai-extract";
import type { ExtractedJob, IngestFailureCode } from "@/lib/types";

export type IngestResult =
  | { ok: true; job: ExtractedJob; sourceUrl: string | null }
  | { ok: false; code: IngestFailureCode; message: string };

/** Prefer a real value from JSON-LD, otherwise take the heuristic's guess. */
function merge(primary: Partial<ExtractedJob>, fallback: ExtractedJob): ExtractedJob {
  const pickArray = (a: string[] | undefined, b: string[]) => (a && a.length > 0 ? a : b);
  return {
    title: primary.title?.trim() || fallback.title,
    company: primary.company ?? fallback.company,
    location: primary.location ?? fallback.location,
    workMode: primary.workMode ?? fallback.workMode,
    employmentType: primary.employmentType ?? fallback.employmentType,
    salaryMin: primary.salaryMin ?? fallback.salaryMin,
    salaryMax: primary.salaryMax ?? fallback.salaryMax,
    salaryCurrency: primary.salaryCurrency ?? fallback.salaryCurrency,
    salaryPeriod: primary.salaryPeriod ?? fallback.salaryPeriod,
    responsibilities: pickArray(primary.responsibilities, fallback.responsibilities),
    requirements: pickArray(primary.requirements, fallback.requirements),
    skills: pickArray(primary.skills, fallback.skills),
    rawText:
      (primary.rawText?.length ?? 0) > fallback.rawText.length
        ? primary.rawText!
        : fallback.rawText,
    extractionMethod: primary.extractionMethod ?? fallback.extractionMethod,
  };
}

async function structureText(text: string, html?: string): Promise<ExtractedJob> {
  const heuristic = extractJobHeuristic(text, html);
  if (isAIAvailable()) {
    try {
      const ai = await extractJobWithAI(text);
      // Heuristics fill anything the model left blank (og: tags etc).
      return merge({ ...ai, extractionMethod: "ai" }, heuristic);
    } catch (err) {
      if (!isAIFallbackError(err)) throw err;
      console.warn("AI job extraction failed, using heuristics:", err);
    }
  }
  return heuristic;
}

export async function ingestFromUrl(url: string): Promise<IngestResult> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, code: "UNSUPPORTED_CONTENT", message: "That is not a valid URL." };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, code: "UNSUPPORTED_CONTENT", message: "Only http and https URLs are supported." };
  }

  const robots = await isAllowedByRobots(url);
  if (!robots.allowed) {
    return {
      ok: false,
      code: "ROBOTS_DISALLOWED",
      message:
        "This site's robots.txt disallows automated fetching, so JobPilot will not scrape it. Paste the job description below instead.",
    };
  }

  const page = await fetchPage(url);
  if (!page.ok) {
    return {
      ok: false,
      code: "FETCH_BLOCKED",
      message: `${page.message} Paste the job description below instead.`,
    };
  }

  // 1. schema.org JobPosting — the most reliable path when available.
  const jsonLd = extractJobPosting(page.html);
  const pageText = pageToText(page.html);
  const heuristic = extractJobHeuristic(pageText, page.html);

  if (jsonLd?.title) {
    return { ok: true, job: merge(jsonLd, heuristic), sourceUrl: url };
  }

  // 2. AI extraction, 3. heuristics.
  const job = await structureText(pageText, page.html);
  return { ok: true, job, sourceUrl: url };
}

export async function ingestFromText(text: string, referenceUrl?: string): Promise<IngestResult> {
  const trimmed = text.trim();
  if (trimmed.length < 40) {
    return {
      ok: false,
      code: "UNSUPPORTED_CONTENT",
      message: "That does not look like a job description — paste the full posting text.",
    };
  }
  const job = await structureText(trimmed);
  return { ok: true, job, sourceUrl: referenceUrl ?? null };
}
