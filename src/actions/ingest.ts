"use server";

import { revalidatePath } from "next/cache";
import { getActiveProfileId } from "@/lib/active-profile";
import { ingestFromText, ingestFromUrl } from "@/lib/ingest/pipeline";
import { insertJob, getJob, jobFullText } from "@/lib/repos/jobs";
import { getMasterResume, getStoredResume } from "@/lib/repos/resumes";
import { createMatch } from "@/lib/repos/matches";
import { logActivity } from "@/lib/repos/activity";
import { analyzeMatch } from "@/lib/matching";
import type { ActionResult, ExtractedJob, IngestFailureCode, JobSource } from "@/lib/types";

export interface IngestActionResult {
  jobId: number;
  duplicate: boolean;
  matchRan: boolean;
  extractionMethod: string;
}

export async function ingestUrlAction(
  url: string
): Promise<ActionResult<IngestActionResult> | { ok: false; message: string; code: IngestFailureCode }> {
  const profileId = await getActiveProfileId();
  if (profileId == null) return { ok: false, message: "Create a profile first." };
  const result = await ingestFromUrl(url.trim());
  if (!result.ok) {
    return { ok: false, message: result.message, code: result.code };
  }
  return saveExtractedJob(profileId, result.job, "url", result.sourceUrl);
}

export async function ingestTextAction(
  text: string,
  referenceUrl?: string
): Promise<ActionResult<IngestActionResult> | { ok: false; message: string; code: IngestFailureCode }> {
  const profileId = await getActiveProfileId();
  if (profileId == null) return { ok: false, message: "Create a profile first." };
  const result = await ingestFromText(text, referenceUrl?.trim() || undefined);
  if (!result.ok) {
    return { ok: false, message: result.message, code: result.code };
  }
  return saveExtractedJob(profileId, result.job, "paste", result.sourceUrl);
}

async function saveExtractedJob(
  profileId: number,
  extracted: ExtractedJob,
  source: JobSource,
  sourceUrl: string | null
): Promise<ActionResult<IngestActionResult>> {
  const inserted = insertJob({
    profileId,
    source,
    sourceUrl,
    title: extracted.title || "Untitled role",
    company: extracted.company,
    location: extracted.location,
    workMode: extracted.workMode,
    employmentType: extracted.employmentType,
    salaryMin: extracted.salaryMin,
    salaryMax: extracted.salaryMax,
    salaryCurrency: extracted.salaryCurrency,
    salaryPeriod: extracted.salaryPeriod,
    description: extracted.rawText,
    responsibilities: extracted.responsibilities,
    requirements: extracted.requirements,
    skills: extracted.skills,
    rawText: extracted.rawText,
    extractionMethod: extracted.extractionMethod,
  });

  if (inserted.duplicate) {
    return {
      ok: true,
      data: {
        jobId: inserted.existingJobId,
        duplicate: true,
        matchRan: false,
        extractionMethod: extracted.extractionMethod,
      },
      message: "You already saved this job — opening the existing record.",
    };
  }

  const job = inserted.job;
  logActivity(profileId, "job_ingested", `Ingested "${job.title}"${job.company ? ` at ${job.company}` : ""}`, job.id);

  // Auto-run match analysis against the master resume — non-fatal if it fails.
  const matchRan = await tryAutoMatch(profileId, job.id);

  revalidatePath("/tracker");
  revalidatePath("/");
  return {
    ok: true,
    data: { jobId: job.id, duplicate: false, matchRan, extractionMethod: extracted.extractionMethod },
    message: "Job ingested.",
  };
}

export async function tryAutoMatch(profileId: number, jobId: number): Promise<boolean> {
  try {
    const master = getMasterResume(profileId);
    if (!master) return false;
    const stored = getStoredResume(master.id);
    if (!stored) return false;
    const job = getJob(jobId);
    if (!job) return false;
    const result = await analyzeMatch(stored.resume, {
      title: job.title,
      company: job.company,
      text: jobFullText(job),
      location: job.location,
    });
    createMatch({
      jobId,
      resumeId: master.id,
      method: result.method === "ai" ? "ai" : "keyword",
      model: result.model,
      score: result.score,
      summary: result.summary,
      matchedKeywords: result.matchedKeywords,
      missingKeywords: result.missingKeywords,
      strengths: result.strengths,
      gaps: result.gaps,
      suggestions: result.suggestions,
    });
    return true;
  } catch (err) {
    console.warn("auto-match failed:", err);
    return false;
  }
}
