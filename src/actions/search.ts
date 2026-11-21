"use server";

import { getActiveProfileId } from "@/lib/active-profile";
import { searchAllSources, getSourceStatuses } from "@/lib/sources/registry";
import { focusOnPhilippines } from "@/lib/sources/relevance";
import { buildSmartLinks } from "@/lib/sources/smartLinks";
import { dedupeJobs } from "@/lib/dedup";
import { dedupeHashIndex, computeDedupeHash, insertJob, updateJob } from "@/lib/repos/jobs";
import { getMasterResume, getStoredResume } from "@/lib/repos/resumes";
import { getProfile } from "@/lib/repos/profiles";
import { suggestSearches, type SuggestResult } from "@/lib/suggest";
import { logActivity } from "@/lib/repos/activity";
import { tryAutoMatch } from "@/actions/ingest";
import { ingestFromUrl } from "@/lib/ingest/pipeline";
import { revalidatePath } from "next/cache";
import type {
  ActionResult,
  ApiSourceId,
  MergedJob,
  SearchParams,
  SearchResponse,
  SourceStatus,
} from "@/lib/types";

export async function getSourceStatusesAction(): Promise<SourceStatus[]> {
  return getSourceStatuses();
}

/**
 * Search queries derived from the profile's master resume, so the Keywords box
 * does not have to be guessed at.
 *
 * Deliberately does not run any search: JSearch's free tier is about 200
 * requests a month, and searching every suggestion would spend six of them per
 * click. The caller offers them and the user picks one.
 */
export async function suggestSearchesAction(): Promise<ActionResult<SuggestResult>> {
  const profileId = await getActiveProfileId();
  if (profileId == null) return { ok: false, message: "Create a profile first." };

  const master = getMasterResume(profileId);
  if (!master) {
    return {
      ok: false,
      message: "Upload a resume first — suggestions are built from your master resume.",
    };
  }
  const stored = getStoredResume(master.id);
  if (!stored) {
    return { ok: false, message: "That resume has no parsed content yet. Open it and save." };
  }

  try {
    const profile = getProfile(profileId);
    const result = await suggestSearches(stored.resume, {
      targetTitles: profile?.targetTitles ?? [],
    });
    if (result.suggestions.length === 0) {
      return {
        ok: false,
        message:
          "Could not derive any searches — add job titles to your work history or target titles to your profile.",
      };
    }
    return { ok: true, data: result };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Could not suggest searches.",
    };
  }
}

export async function searchJobsAction(
  params: SearchParams,
  enabled: ApiSourceId[],
  /**
   * Drop jobs a Philippines-based candidate cannot apply to and roles outside a
   * technical search, then rank the boards that convert first. Applied after the
   * source cache, so switching it off and on again costs no API quota.
   */
  phFocus = true
): Promise<ActionResult<SearchResponse>> {
  const profileId = await getActiveProfileId();
  if (profileId == null) return { ok: false, message: "Create a profile first." };
  if (!params.keywords.trim()) return { ok: false, message: "Enter search keywords." };

  try {
    const { results, errors, fromCache } = await searchAllSources(params, enabled);
    const { merged, duplicatesMerged } = dedupeJobs(results);

    // Dedupe first so a job kept from one source is not dropped by another's
    // stricter location string, then focus.
    const focused = phFocus
      ? focusOnPhilippines(merged, params.keywords)
      : { kept: merged, counts: { notOpenToPh: 0, offTopic: 0 } };

    // Badge results the profile already ingested.
    const savedIndex = dedupeHashIndex(profileId);
    for (const job of focused.kept) {
      const hash = computeDedupeHash(job.title, job.company);
      const existingId = savedIndex.get(hash);
      if (existingId != null) job.alreadySavedJobId = existingId;
    }

    return {
      ok: true,
      data: {
        results: focused.kept,
        duplicatesMerged,
        errors,
        smartLinks: buildSmartLinks(params),
        fromCache,
        hidden: focused.counts,
      },
    };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Search failed." };
  }
}

export interface ImportResult {
  jobId: number;
  duplicate: boolean;
  matchRan: boolean;
}

/** One-click "Ingest & Analyze" from a search result card. */
export async function importSearchResultAction(
  job: MergedJob
): Promise<ActionResult<ImportResult>> {
  const profileId = await getActiveProfileId();
  if (profileId == null) return { ok: false, message: "Create a profile first." };

  const inserted = insertJob({
    profileId,
    source: job.source,
    sourceUrl: job.url || null,
    externalId: job.externalId,
    title: job.title,
    company: job.company || null,
    location: job.location || null,
    workMode: job.isRemote ? "remote" : null,
    employmentType: job.employmentType ?? null,
    salaryMin: job.salaryMin ?? null,
    salaryMax: job.salaryMax ?? null,
    salaryCurrency: job.salaryCurrency ?? null,
    salaryPeriod: job.salaryPeriod ?? null,
    salaryText: job.salaryText ?? null,
    description: job.descriptionSnippet ?? null,
    postedAt: job.postedAt ?? null,
    rawText: job.descriptionSnippet ?? null,
    extractionMethod: "api",
  });

  if (inserted.duplicate) {
    return {
      ok: true,
      data: { jobId: inserted.existingJobId, duplicate: true, matchRan: false },
      message: "Already saved — opening the existing record.",
    };
  }

  const saved = inserted.job;
  logActivity(profileId, "job_imported", `Imported "${saved.title}" from ${job.source}`, saved.id);

  // Best-effort enrichment: fetch the posting page (robots-respecting) to get
  // the full description. Failures are fine — we keep the API snippet.
  if (job.url) {
    try {
      const enriched = await ingestFromUrl(job.url);
      if (enriched.ok && enriched.job.rawText.length > (saved.description?.length ?? 0)) {
        updateJob(saved.id, {
          title: saved.title,
          company: saved.company,
          location: saved.location,
          workMode: saved.workMode ?? enriched.job.workMode,
          employmentType: saved.employmentType ?? enriched.job.employmentType,
          salaryMin: saved.salaryMin ?? enriched.job.salaryMin,
          salaryMax: saved.salaryMax ?? enriched.job.salaryMax,
          salaryCurrency: saved.salaryCurrency ?? enriched.job.salaryCurrency,
          salaryPeriod: saved.salaryPeriod ?? enriched.job.salaryPeriod,
          salaryText: saved.salaryText,
          description: enriched.job.rawText,
          responsibilities: enriched.job.responsibilities,
          requirements: enriched.job.requirements,
          skills: enriched.job.skills,
        });
      }
    } catch (err) {
      console.warn("enrichment failed:", err);
    }
  }

  const matchRan = await tryAutoMatch(profileId, saved.id);
  revalidatePath("/");
  return {
    ok: true,
    data: { jobId: saved.id, duplicate: false, matchRan },
    message: matchRan ? "Job imported and analyzed." : "Job imported.",
  };
}
