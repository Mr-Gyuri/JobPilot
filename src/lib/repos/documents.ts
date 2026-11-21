import { getDb, parseJsonColumn } from "@/lib/db";
import type { DocType, GeneratedDocRecord, GenerationMethod, TemplateId } from "@/lib/types";
import type { ParsedResume } from "@/lib/parsing/schema";

interface DocRow {
  id: number;
  profile_id: number;
  job_id: number;
  resume_id: number | null;
  doc_type: DocType;
  template: TemplateId;
  version: number;
  method: GenerationMethod | null;
  content_json: string | null;
  html: string | null;
  pdf_path: string | null;
  changes_json: string;
  warnings_json: string;
  created_at: string;
}

function toRecord(row: DocRow): GeneratedDocRecord {
  return {
    id: row.id,
    profileId: row.profile_id,
    jobId: row.job_id,
    resumeId: row.resume_id,
    docType: row.doc_type,
    template: row.template,
    version: row.version,
    method: row.method,
    pdfPath: row.pdf_path,
    changes: parseJsonColumn<string[]>(row.changes_json, []),
    warnings: parseJsonColumn<string[]>(row.warnings_json, []),
    createdAt: row.created_at,
  };
}

// content_json holds the re-renderable content: the tailored resume for
// doc_type='resume', or the letter body for doc_type='cover_letter'.
export type DocContent =
  | { kind: "resume"; resume: ParsedResume }
  | { kind: "cover_letter"; body: string };

export interface DocInput {
  profileId: number;
  jobId: number;
  resumeId: number | null;
  docType: DocType;
  template: TemplateId;
  method: GenerationMethod;
  content: DocContent;
  html: string;
  pdfPath: string;
  changes: string[];
  warnings: string[];
}

export function createDocument(input: DocInput): GeneratedDocRecord {
  const db = getDb();
  let id = 0;
  db.transaction(() => {
    const max = db
      .prepare(
        "SELECT COALESCE(MAX(version), 0) AS v FROM generated_documents WHERE job_id = ? AND doc_type = ?"
      )
      .get(input.jobId, input.docType) as { v: number };
    const result = db
      .prepare(
        `INSERT INTO generated_documents (profile_id, job_id, resume_id, doc_type, template,
          version, method, content_json, html, pdf_path, changes_json, warnings_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        input.profileId,
        input.jobId,
        input.resumeId,
        input.docType,
        input.template,
        max.v + 1,
        input.method,
        JSON.stringify(input.content),
        input.html,
        input.pdfPath,
        JSON.stringify(input.changes),
        JSON.stringify(input.warnings)
      );
    id = Number(result.lastInsertRowid);
  })();
  return getDocument(id)!;
}

export function getDocument(id: number): GeneratedDocRecord | null {
  const row = getDb().prepare("SELECT * FROM generated_documents WHERE id = ?").get(id) as
    | DocRow
    | undefined;
  return row ? toRecord(row) : null;
}

export function getDocumentContent(id: number): DocContent | null {
  const row = getDb()
    .prepare("SELECT content_json FROM generated_documents WHERE id = ?")
    .get(id) as { content_json: string | null } | undefined;
  if (!row?.content_json) return null;
  return parseJsonColumn<DocContent | null>(row.content_json, null);
}

export function listDocumentsForJob(jobId: number): GeneratedDocRecord[] {
  const rows = getDb()
    .prepare("SELECT * FROM generated_documents WHERE job_id = ? ORDER BY created_at DESC")
    .all(jobId) as DocRow[];
  return rows.map(toRecord);
}

export function getDocumentPdfPath(id: number): { pdfPath: string | null; docType: DocType; template: TemplateId; version: number; jobId: number } | null {
  const row = getDb()
    .prepare("SELECT pdf_path, doc_type, template, version, job_id FROM generated_documents WHERE id = ?")
    .get(id) as
    | { pdf_path: string | null; doc_type: DocType; template: TemplateId; version: number; job_id: number }
    | undefined;
  if (!row) return null;
  return {
    pdfPath: row.pdf_path,
    docType: row.doc_type,
    template: row.template,
    version: row.version,
    jobId: row.job_id,
  };
}

export function deleteDocument(id: number): void {
  getDb().prepare("DELETE FROM generated_documents WHERE id = ?").run(id);
}
