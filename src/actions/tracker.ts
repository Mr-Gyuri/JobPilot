"use server";

import { revalidatePath } from "next/cache";
import { getActiveProfileId } from "@/lib/active-profile";
import { getJob } from "@/lib/repos/jobs";
import {
  createApplication,
  deleteApplication,
  getApplication,
  getApplicationByJob,
  moveApplication,
  updateApplicationDetails,
  type ApplicationDetailsUpdate,
} from "@/lib/repos/applications";
import { logActivity } from "@/lib/repos/activity";
import { STATUS_LABELS, type ActionResult, type ApplicationRecord, type ApplicationStatus } from "@/lib/types";

export async function addToTrackerAction(jobId: number): Promise<ActionResult<ApplicationRecord>> {
  const profileId = await getActiveProfileId();
  if (profileId == null) return { ok: false, message: "Create a profile first." };
  const job = getJob(jobId);
  if (!job || job.profileId !== profileId) return { ok: false, message: "Job not found." };
  const existing = getApplicationByJob(jobId);
  if (existing) return { ok: true, data: existing, message: "Already on the tracker." };
  const app = createApplication(profileId, jobId);
  logActivity(profileId, "tracker_added", `Added "${job.title}" to the tracker`, jobId);
  revalidatePath("/tracker");
  revalidatePath("/");
  return { ok: true, data: app, message: "Added to tracker." };
}

export async function moveApplicationAction(
  applicationId: number,
  toStatus: ApplicationStatus,
  orderedIds: number[]
): Promise<ActionResult<ApplicationRecord>> {
  const profileId = await getActiveProfileId();
  if (profileId == null) return { ok: false, message: "Create a profile first." };
  const app = getApplication(applicationId);
  if (!app || app.profileId !== profileId) return { ok: false, message: "Card not found." };
  const fromStatus = app.status;
  const moved = moveApplication(applicationId, toStatus, orderedIds);
  if (!moved) return { ok: false, message: "Failed to move card." };
  if (fromStatus !== toStatus) {
    const job = getJob(app.jobId);
    logActivity(
      profileId,
      "tracker_moved",
      `Moved "${job?.title ?? "job"}" to ${STATUS_LABELS[toStatus]}`,
      app.jobId
    );
  }
  revalidatePath("/tracker");
  revalidatePath("/");
  return { ok: true, data: moved };
}

export async function updateApplicationAction(
  applicationId: number,
  update: ApplicationDetailsUpdate
): Promise<ActionResult<ApplicationRecord>> {
  const profileId = await getActiveProfileId();
  if (profileId == null) return { ok: false, message: "Create a profile first." };
  const app = getApplication(applicationId);
  if (!app || app.profileId !== profileId) return { ok: false, message: "Card not found." };
  const updated = updateApplicationDetails(applicationId, update);
  if (!updated) return { ok: false, message: "Failed to save." };
  revalidatePath("/tracker");
  revalidatePath("/");
  return { ok: true, data: updated };
}

export async function removeApplicationAction(applicationId: number): Promise<ActionResult> {
  const profileId = await getActiveProfileId();
  if (profileId == null) return { ok: false, message: "Create a profile first." };
  const app = getApplication(applicationId);
  if (!app || app.profileId !== profileId) return { ok: false, message: "Card not found." };
  deleteApplication(applicationId);
  revalidatePath("/tracker");
  revalidatePath("/");
  return { ok: true, message: "Removed from tracker." };
}
