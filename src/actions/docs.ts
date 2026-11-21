"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { getConfigValue } from "@/lib/config";
import { getActiveProfileId } from "@/lib/active-profile";
import { getJob, jobFullText } from "@/lib/repos/jobs";
import { getResume, getStoredResume } from "@/lib/repos/resumes";
import { latestMatchForJob } from "@/lib/repos/matches";
import {
  createDocument,
  getDocument,
  getDocumentContent,
} from "@/lib/repos/documents";
import { logActivity } from "@/lib/repos/activity";
import { tailorResume, generateCoverLetter } from "@/lib/tailoring";
import { generateResumePdf, generateCoverLetterPdf } from "@/lib/pdf";
import { writeStorageFile } from "@/lib/storage";
import type { ActionResult, GeneratedDocRecord, PaperSize, TemplateId } from "@/lib/types";

export interface GenerateDocsResult {
  resumeDoc: GeneratedDocRecord;
  coverDoc: GeneratedDocRecord | null;
  method: "ai" | "heuristic";
  changes: string[];
  warnings: string[];
}

export async function generateDocumentsAction(
  jobId: number,
  resumeId: number,
  template: TemplateId,
  includeCoverLetter: boolean
): Promise<ActionResult<GenerateDocsResult>> {
  const profileId = await getActiveProfileId();
  if (profileId == null) return { ok: false, message: "Create a profile first." };

  const job = getJob(jobId);
  if (!job || job.profileId !== profileId) return { ok: false, message: "Job not found." };
  const resume = getResume(resumeId);
  if (!resume || resume.profileId !== profileId) return { ok: false, message: "Resume not found." };
  const stored = getStoredResume(resumeId);
  if (!stored) return { ok: false, message: "That resume has no parsed content yet." };

  const paper = (getConfigValue("PAPER_SIZE") as PaperSize) ?? "Letter";
  const jobInput = {
    title: job.title,
    company: job.company,
    text: jobFullText(job),
    location: job.location,
  };
  const latestMatch = latestMatchForJob(jobId);
  const hints = latestMatch
    ? { matched: latestMatch.matchedKeywords, missing: latestMatch.missingKeywords }
    : undefined;

  try {
    const tailored = await tailorResume(stored.resume, jobInput, hints);
    const { pdf, html } = await generateResumePdf(tailored.resume, template, paper);
    const version = nextVersion(jobId, "resume");
    const pdfPath = writeStorageFile(
      ["generated", String(profileId), String(jobId), `resume-v${version}-${template}.pdf`].join("/"),
      pdf
    );
    const resumeDoc = createDocument({
      profileId,
      jobId,
      resumeId,
      docType: "resume",
      template,
      method: tailored.method,
      content: { kind: "resume", resume: tailored.resume },
      html,
      pdfPath,
      changes: tailored.changes,
      warnings: tailored.warnings,
    });

    let coverDoc: GeneratedDocRecord | null = null;
    if (includeCoverLetter) {
      const letter = await generateCoverLetter(tailored.resume, jobInput);
      const rendered = await generateCoverLetterPdf({
        contact: tailored.resume.contact,
        body: letter.body,
        jobTitle: job.title,
        company: job.company,
        paper,
      });
      const coverVersion = nextVersion(jobId, "cover_letter");
      const coverPath = writeStorageFile(
        ["generated", String(profileId), String(jobId), `cover-letter-v${coverVersion}.pdf`].join("/"),
        rendered.pdf
      );
      coverDoc = createDocument({
        profileId,
        jobId,
        resumeId,
        docType: "cover_letter",
        template,
        method: letter.method === "ai" ? "ai" : "heuristic",
        content: { kind: "cover_letter", body: letter.body },
        html: rendered.html,
        pdfPath: coverPath,
        changes: [],
        warnings: [],
      });
    }

    logActivity(
      profileId,
      "docs_generated",
      `Generated tailored resume v${resumeDoc.version}${coverDoc ? " + cover letter" : ""} for "${job.title}"`,
      jobId
    );
    revalidatePath(`/jobs/${jobId}`);
    return {
      ok: true,
      data: {
        resumeDoc,
        coverDoc,
        method: tailored.method,
        changes: tailored.changes,
        warnings: tailored.warnings,
      },
      message:
        tailored.method === "ai"
          ? "Tailored resume generated with AI."
          : "Tailored resume generated with keyword-based tailoring (no AI key — content was reordered/trimmed, never rewritten).",
    };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Document generation failed.",
    };
  }
}

/** Re-render an existing document's stored content with a different template — no AI call. */
export async function rerenderDocumentAction(
  docId: number,
  template: TemplateId
): Promise<ActionResult<GeneratedDocRecord>> {
  const profileId = await getActiveProfileId();
  if (profileId == null) return { ok: false, message: "Create a profile first." };

  const doc = getDocument(docId);
  if (!doc || doc.profileId !== profileId) return { ok: false, message: "Document not found." };
  const content = getDocumentContent(docId);
  if (!content || content.kind !== "resume") {
    return { ok: false, message: "Only tailored resumes can be re-rendered." };
  }

  const paper = (getConfigValue("PAPER_SIZE") as PaperSize) ?? "Letter";
  try {
    const { pdf, html } = await generateResumePdf(content.resume, template, paper);
    const version = nextVersion(doc.jobId, "resume");
    const pdfPath = writeStorageFile(
      ["generated", String(profileId), String(doc.jobId), `resume-v${version}-${template}.pdf`].join("/"),
      pdf
    );
    const newDoc = createDocument({
      profileId,
      jobId: doc.jobId,
      resumeId: doc.resumeId,
      docType: "resume",
      template,
      method: doc.method ?? "heuristic",
      content,
      html,
      pdfPath,
      changes: [`Re-rendered v${doc.version} with the ${template} template`],
      warnings: [],
    });
    revalidatePath(`/jobs/${doc.jobId}`);
    return { ok: true, data: newDoc, message: `Re-rendered with the ${template} template.` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Re-render failed." };
  }
}

function nextVersion(jobId: number, docType: "resume" | "cover_letter"): number {
  const row = getDb()
    .prepare(
      "SELECT COALESCE(MAX(version), 0) AS v FROM generated_documents WHERE job_id = ? AND doc_type = ?"
    )
    .get(jobId, docType) as { v: number };
  return row.v + 1;
}
