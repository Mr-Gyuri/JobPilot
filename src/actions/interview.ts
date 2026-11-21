"use server";

import { revalidatePath } from "next/cache";
import { getActiveProfileId } from "@/lib/active-profile";
import { getJob, jobFullText } from "@/lib/repos/jobs";
import { getResume, getStoredResume } from "@/lib/repos/resumes";
import { createPrep } from "@/lib/repos/preps";
import { logActivity } from "@/lib/repos/activity";
import { generateInterviewPrep } from "@/lib/interview";
import type { ActionResult, InterviewPrepRecord } from "@/lib/types";

export async function generatePrepAction(
  jobId: number,
  resumeId: number
): Promise<ActionResult<InterviewPrepRecord>> {
  const profileId = await getActiveProfileId();
  if (profileId == null) return { ok: false, message: "Create a profile first." };

  const job = getJob(jobId);
  if (!job || job.profileId !== profileId) return { ok: false, message: "Job not found." };
  const resume = getResume(resumeId);
  if (!resume || resume.profileId !== profileId) return { ok: false, message: "Resume not found." };
  const stored = getStoredResume(resumeId);
  if (!stored) return { ok: false, message: "That resume has no parsed content yet." };

  try {
    const result = await generateInterviewPrep(stored.resume, {
      title: job.title,
      company: job.company,
      text: jobFullText(job),
      location: job.location,
    });
    const record = createPrep({
      jobId,
      resumeId,
      method: result.method === "ai" ? "ai" : "template",
      model: result.model,
      content: result.content,
    });
    logActivity(profileId, "prep_generated", `Interview prep generated for "${job.title}"`, jobId);
    revalidatePath(`/jobs/${jobId}`);
    return {
      ok: true,
      data: record,
      message:
        result.method === "ai"
          ? "Interview prep generated with AI."
          : "Interview prep generated from templates (no AI key configured).",
    };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Interview prep failed." };
  }
}
