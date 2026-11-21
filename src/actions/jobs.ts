"use server";

import { revalidatePath } from "next/cache";
import { getActiveProfileId } from "@/lib/active-profile";
import { deleteJob, getJob, updateJob, type JobUpdate } from "@/lib/repos/jobs";
import type { ActionResult, JobRecord } from "@/lib/types";

export async function updateJobAction(
  jobId: number,
  update: JobUpdate
): Promise<ActionResult<JobRecord>> {
  const profileId = await getActiveProfileId();
  if (profileId == null) return { ok: false, message: "Create a profile first." };
  const job = getJob(jobId);
  if (!job || job.profileId !== profileId) return { ok: false, message: "Job not found." };
  if (!update.title?.trim()) return { ok: false, message: "Job title is required." };
  const updated = updateJob(jobId, { ...update, title: update.title.trim() });
  if (!updated) return { ok: false, message: "Failed to update job." };
  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/tracker");
  return { ok: true, data: updated, message: "Job updated." };
}

export async function deleteJobAction(jobId: number): Promise<ActionResult> {
  const profileId = await getActiveProfileId();
  if (profileId == null) return { ok: false, message: "Create a profile first." };
  const job = getJob(jobId);
  if (!job || job.profileId !== profileId) return { ok: false, message: "Job not found." };
  deleteJob(jobId);
  revalidatePath("/tracker");
  revalidatePath("/");
  return { ok: true, message: "Job deleted." };
}
