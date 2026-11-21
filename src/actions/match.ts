"use server";

import { revalidatePath } from "next/cache";
import { getActiveProfileId } from "@/lib/active-profile";
import { getJob, jobFullText } from "@/lib/repos/jobs";
import { getResume, getStoredResume } from "@/lib/repos/resumes";
import { createMatch } from "@/lib/repos/matches";
import { logActivity } from "@/lib/repos/activity";
import { analyzeMatch } from "@/lib/matching";
import type { ActionResult, MatchAnalysisRecord } from "@/lib/types";

export async function runMatchAction(
  jobId: number,
  resumeId: number
): Promise<ActionResult<MatchAnalysisRecord>> {
  const profileId = await getActiveProfileId();
  if (profileId == null) return { ok: false, message: "Create a profile first." };

  const job = getJob(jobId);
  if (!job || job.profileId !== profileId) return { ok: false, message: "Job not found." };
  const resume = getResume(resumeId);
  if (!resume || resume.profileId !== profileId) return { ok: false, message: "Resume not found." };
  const stored = getStoredResume(resumeId);
  if (!stored) return { ok: false, message: "That resume has no parsed content yet." };

  try {
    const result = await analyzeMatch(stored.resume, {
      title: job.title,
      company: job.company,
      text: jobFullText(job),
      location: job.location,
    });
    const record = createMatch({
      jobId,
      resumeId,
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
    logActivity(profileId, "match_run", `Match analysis for "${job.title}": ${record.score}%`, jobId);
    revalidatePath(`/jobs/${jobId}`);
    return {
      ok: true,
      data: record,
      message:
        result.method === "ai"
          ? `Match score: ${record.score}% (AI analysis).`
          : `Match score: ${record.score}% (keyword analysis — add an Anthropic or Gemini key in Settings for deeper insight).`,
    };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Match analysis failed." };
  }
}
