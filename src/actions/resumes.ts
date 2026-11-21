"use server";

import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { getActiveProfileId } from "@/lib/active-profile";
import { sanitizeFilename, writeStorageFile, deleteStorageFile } from "@/lib/storage";
import {
  createResume,
  deleteResume,
  getResume,
  getStoredResume,
  setMasterResume,
  updateResumeContent,
} from "@/lib/repos/resumes";
import { logActivity } from "@/lib/repos/activity";
import {
  parseResumeFile,
  reparseResumeText,
  ScannedPdfError,
  UnsupportedFileError,
} from "@/lib/parsing";
import { ParsedResumeSchema, type ParsedResume, type StoredResume } from "@/lib/parsing/schema";
import type { ActionResult } from "@/lib/types";

export interface UploadResult {
  resumeId: number;
  method: "ai" | "heuristic";
  warnings: string[];
}

export async function uploadResumeAction(formData: FormData): Promise<ActionResult<UploadResult>> {
  const profileId = await getActiveProfileId();
  if (profileId == null) return { ok: false, message: "Create a profile first." };

  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, message: "No file provided." };
  if (file.size > 15 * 1024 * 1024) return { ok: false, message: "File is too large (max 15 MB)." };

  const buffer = Buffer.from(await file.arrayBuffer());
  try {
    const outcome = await parseResumeFile(buffer, file.name);
    const relPath = ["uploads", "resumes", String(profileId), `${crypto.randomUUID().slice(0, 8)}-${sanitizeFilename(file.name)}`].join("/");
    writeStorageFile(relPath, buffer);

    const stored: StoredResume = {
      schemaVersion: 1,
      resume: outcome.resume,
      parseMethod: outcome.method,
      parseWarnings: outcome.warnings,
    };
    const record = createResume({
      profileId,
      title: file.name.replace(/\.(pdf|docx)$/i, ""),
      sourceType: "upload",
      originalFilename: file.name,
      storedPath: relPath,
      mimeType: file.type || null,
      rawText: outcome.rawText,
      stored,
    });
    logActivity(profileId, "resume_uploaded", `Uploaded resume "${record.title}"`, record.id);
    revalidatePath("/resumes");
    return {
      ok: true,
      data: { resumeId: record.id, method: outcome.method, warnings: outcome.warnings },
      message:
        outcome.method === "ai"
          ? "Resume parsed with AI — review and correct below."
          : "Resume parsed with built-in heuristics (no AI key) — review and correct below.",
    };
  } catch (err) {
    if (err instanceof ScannedPdfError) {
      return {
        ok: false,
        message:
          "This looks like a scanned/image-only PDF with no extractable text. Export a text-based PDF or DOCX and try again.",
      };
    }
    if (err instanceof UnsupportedFileError) {
      return { ok: false, message: "Unsupported file — upload a PDF or DOCX resume." };
    }
    return { ok: false, message: err instanceof Error ? err.message : "Failed to parse resume." };
  }
}

export async function saveResumeAction(
  resumeId: number,
  resume: ParsedResume,
  title: string,
  mode: "overwrite" | "new_version"
): Promise<ActionResult<{ resumeId: number }>> {
  const profileId = await getActiveProfileId();
  if (profileId == null) return { ok: false, message: "Create a profile first." };

  const check = ParsedResumeSchema.safeParse(resume);
  if (!check.success) return { ok: false, message: "Resume data failed validation." };

  const existing = getResume(resumeId);
  if (!existing || existing.profileId !== profileId) {
    return { ok: false, message: "Resume not found." };
  }

  const prior = getStoredResume(resumeId);
  const stored: StoredResume = {
    schemaVersion: 1,
    resume: check.data,
    parseMethod: "manual",
    parseWarnings: prior?.parseWarnings ?? [],
  };

  if (mode === "overwrite") {
    updateResumeContent(resumeId, stored, title.trim() || existing.title);
    revalidatePath("/resumes");
    return { ok: true, data: { resumeId }, message: "Resume saved." };
  }

  const copy = createResume({
    profileId,
    title: title.trim() || `${existing.title} (edited)`,
    sourceType: "duplicate",
    originalFilename: existing.originalFilename,
    storedPath: null,
    mimeType: existing.mimeType,
    rawText: existing.rawText,
    stored,
  });
  logActivity(profileId, "resume_version", `Saved new resume version "${copy.title}"`, copy.id);
  revalidatePath("/resumes");
  return { ok: true, data: { resumeId: copy.id }, message: "Saved as a new version." };
}

export async function setMasterResumeAction(resumeId: number): Promise<ActionResult> {
  const profileId = await getActiveProfileId();
  if (profileId == null) return { ok: false, message: "Create a profile first." };
  const resume = getResume(resumeId);
  if (!resume || resume.profileId !== profileId) return { ok: false, message: "Resume not found." };
  setMasterResume(profileId, resumeId);
  revalidatePath("/resumes");
  return { ok: true, message: `"${resume.title}" is now the master resume.` };
}

export async function deleteResumeAction(resumeId: number): Promise<ActionResult> {
  const profileId = await getActiveProfileId();
  if (profileId == null) return { ok: false, message: "Create a profile first." };
  const resume = getResume(resumeId);
  if (!resume || resume.profileId !== profileId) return { ok: false, message: "Resume not found." };
  if (resume.isMaster) {
    return { ok: false, message: "Set another resume as master before deleting this one." };
  }
  deleteStorageFile(resume.storedPath);
  deleteResume(resumeId);
  revalidatePath("/resumes");
  return { ok: true, message: "Resume deleted." };
}

export async function reparseResumeAction(resumeId: number): Promise<ActionResult> {
  const profileId = await getActiveProfileId();
  if (profileId == null) return { ok: false, message: "Create a profile first." };
  const resume = getResume(resumeId);
  if (!resume || resume.profileId !== profileId) return { ok: false, message: "Resume not found." };
  if (!resume.rawText) return { ok: false, message: "No stored text to re-parse." };
  try {
    const outcome = await reparseResumeText(resume.rawText);
    const stored: StoredResume = {
      schemaVersion: 1,
      resume: outcome.resume,
      parseMethod: outcome.method,
      parseWarnings: outcome.warnings,
    };
    updateResumeContent(resumeId, stored);
    revalidatePath("/resumes");
    return { ok: true, message: `Re-parsed with ${outcome.method === "ai" ? "AI" : "heuristics"}.` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Failed to re-parse." };
  }
}
