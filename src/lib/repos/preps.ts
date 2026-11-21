import { getDb, parseJsonColumn } from "@/lib/db";
import type { InterviewPrepContent, InterviewPrepRecord } from "@/lib/types";

interface PrepRow {
  id: number;
  job_id: number;
  resume_id: number | null;
  method: "ai" | "template";
  model: string | null;
  content_json: string;
  created_at: string;
}

function toRecord(row: PrepRow): InterviewPrepRecord {
  return {
    id: row.id,
    jobId: row.job_id,
    resumeId: row.resume_id,
    method: row.method,
    model: row.model,
    content: parseJsonColumn<InterviewPrepContent>(row.content_json, { questions: [] }),
    createdAt: row.created_at,
  };
}

export function createPrep(input: {
  jobId: number;
  resumeId: number | null;
  method: "ai" | "template";
  model: string | null;
  content: InterviewPrepContent;
}): InterviewPrepRecord {
  const result = getDb()
    .prepare(
      "INSERT INTO interview_preps (job_id, resume_id, method, model, content_json) VALUES (?, ?, ?, ?, ?)"
    )
    .run(input.jobId, input.resumeId, input.method, input.model, JSON.stringify(input.content));
  return getPrep(Number(result.lastInsertRowid))!;
}

export function getPrep(id: number): InterviewPrepRecord | null {
  const row = getDb().prepare("SELECT * FROM interview_preps WHERE id = ?").get(id) as
    | PrepRow
    | undefined;
  return row ? toRecord(row) : null;
}

export function latestPrepForJob(jobId: number): InterviewPrepRecord | null {
  const row = getDb()
    .prepare("SELECT * FROM interview_preps WHERE job_id = ? ORDER BY created_at DESC LIMIT 1")
    .get(jobId) as PrepRow | undefined;
  return row ? toRecord(row) : null;
}
