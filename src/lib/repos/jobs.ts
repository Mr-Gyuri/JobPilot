import crypto from "node:crypto";
import { getDb, nowIso, parseJsonColumn } from "@/lib/db";
import type { ExtractionMethod, JobRecord, JobSource, WorkMode } from "@/lib/types";

interface JobRow {
  id: number;
  profile_id: number;
  source: JobSource;
  source_url: string | null;
  external_id: string | null;
  title: string;
  company: string | null;
  location: string | null;
  work_mode: WorkMode | null;
  employment_type: string | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  salary_period: string | null;
  salary_text: string | null;
  description: string | null;
  responsibilities_json: string;
  requirements_json: string;
  skills_json: string;
  posted_at: string | null;
  raw_text: string | null;
  extraction_method: ExtractionMethod;
  dedupe_hash: string;
  created_at: string;
  updated_at: string;
}

function toRecord(row: JobRow): JobRecord {
  return {
    id: row.id,
    profileId: row.profile_id,
    source: row.source,
    sourceUrl: row.source_url,
    externalId: row.external_id,
    title: row.title,
    company: row.company,
    location: row.location,
    workMode: row.work_mode,
    employmentType: row.employment_type,
    salaryMin: row.salary_min,
    salaryMax: row.salary_max,
    salaryCurrency: row.salary_currency,
    salaryPeriod: row.salary_period,
    salaryText: row.salary_text,
    description: row.description,
    responsibilities: parseJsonColumn<string[]>(row.responsibilities_json, []),
    requirements: parseJsonColumn<string[]>(row.requirements_json, []),
    skills: parseJsonColumn<string[]>(row.skills_json, []),
    postedAt: row.posted_at,
    rawText: row.raw_text,
    extractionMethod: row.extraction_method,
    dedupeHash: row.dedupe_hash,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Duplicate detection key: normalized title + company (location excluded — multi-location postings). */
export function computeDedupeHash(title: string, company: string | null | undefined): string {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  return crypto.createHash("sha256").update(`${norm(title)}|${norm(company ?? "")}`).digest("hex");
}

export interface JobInput {
  profileId: number;
  source: JobSource;
  sourceUrl?: string | null;
  externalId?: string | null;
  title: string;
  company?: string | null;
  location?: string | null;
  workMode?: WorkMode | null;
  employmentType?: string | null;
  salaryMin?: number | null;
  salaryMax?: number | null;
  salaryCurrency?: string | null;
  salaryPeriod?: string | null;
  salaryText?: string | null;
  description?: string | null;
  responsibilities?: string[];
  requirements?: string[];
  skills?: string[];
  postedAt?: string | null;
  rawText?: string | null;
  extractionMethod: ExtractionMethod;
}

export type JobInsertResult =
  | { duplicate: false; job: JobRecord }
  | { duplicate: true; existingJobId: number };

export function insertJob(input: JobInput): JobInsertResult {
  const db = getDb();
  const hash = computeDedupeHash(input.title, input.company);
  const result = db
    .prepare(
      `INSERT INTO jobs (profile_id, source, source_url, external_id, title, company,
        location, work_mode, employment_type, salary_min, salary_max, salary_currency,
        salary_period, salary_text, description, responsibilities_json, requirements_json,
        skills_json, posted_at, raw_text, extraction_method, dedupe_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(profile_id, dedupe_hash) DO NOTHING`
    )
    .run(
      input.profileId,
      input.source,
      input.sourceUrl ?? null,
      input.externalId ?? null,
      input.title,
      input.company ?? null,
      input.location ?? null,
      input.workMode ?? null,
      input.employmentType ?? null,
      input.salaryMin ?? null,
      input.salaryMax ?? null,
      input.salaryCurrency ?? null,
      input.salaryPeriod ?? null,
      input.salaryText ?? null,
      input.description ?? null,
      JSON.stringify(input.responsibilities ?? []),
      JSON.stringify(input.requirements ?? []),
      JSON.stringify(input.skills ?? []),
      input.postedAt ?? null,
      input.rawText ?? null,
      input.extractionMethod,
      hash
    );
  if (result.changes === 0) {
    const existing = db
      .prepare("SELECT id FROM jobs WHERE profile_id = ? AND dedupe_hash = ?")
      .get(input.profileId, hash) as { id: number };
    return { duplicate: true, existingJobId: existing.id };
  }
  return { duplicate: false, job: getJob(Number(result.lastInsertRowid))! };
}

export function getJob(id: number): JobRecord | null {
  const row = getDb().prepare("SELECT * FROM jobs WHERE id = ?").get(id) as JobRow | undefined;
  return row ? toRecord(row) : null;
}

export function listJobs(profileId: number, query?: string): JobRecord[] {
  const db = getDb();
  let rows: JobRow[];
  if (query?.trim()) {
    const like = `%${query.trim()}%`;
    rows = db
      .prepare(
        `SELECT * FROM jobs WHERE profile_id = ? AND (title LIKE ? OR company LIKE ?)
         ORDER BY created_at DESC`
      )
      .all(profileId, like, like) as JobRow[];
  } else {
    rows = db
      .prepare("SELECT * FROM jobs WHERE profile_id = ? ORDER BY created_at DESC")
      .all(profileId) as JobRow[];
  }
  return rows.map(toRecord);
}

export interface JobUpdate {
  title: string;
  company: string | null;
  location: string | null;
  workMode: WorkMode | null;
  employmentType: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  salaryPeriod: string | null;
  salaryText: string | null;
  description: string | null;
  responsibilities: string[];
  requirements: string[];
  skills: string[];
}

export function updateJob(id: number, input: JobUpdate): JobRecord | null {
  const db = getDb();
  const hash = computeDedupeHash(input.title, input.company);
  db.prepare(
    `UPDATE jobs SET title = ?, company = ?, location = ?, work_mode = ?, employment_type = ?,
      salary_min = ?, salary_max = ?, salary_currency = ?, salary_period = ?, salary_text = ?,
      description = ?,
      responsibilities_json = ?, requirements_json = ?, skills_json = ?, dedupe_hash = ?,
      updated_at = ?
     WHERE id = ?`
  ).run(
    input.title,
    input.company,
    input.location,
    input.workMode,
    input.employmentType,
    input.salaryMin,
    input.salaryMax,
    input.salaryCurrency,
    input.salaryPeriod,
    input.salaryText,
    input.description,
    JSON.stringify(input.responsibilities),
    JSON.stringify(input.requirements),
    JSON.stringify(input.skills),
    hash,
    nowIso(),
    id
  );
  return getJob(id);
}

export function deleteJob(id: number): void {
  getDb().prepare("DELETE FROM jobs WHERE id = ?").run(id);
}

/** Map of dedupe_hash -> job id for a profile (used to badge already-saved search results). */
export function dedupeHashIndex(profileId: number): Map<string, number> {
  const rows = getDb()
    .prepare("SELECT id, dedupe_hash FROM jobs WHERE profile_id = ?")
    .all(profileId) as { id: number; dedupe_hash: string }[];
  return new Map(rows.map((r) => [r.dedupe_hash, r.id]));
}

/** Full job description text used for matching/tailoring. */
export function jobFullText(job: JobRecord): string {
  const parts = [
    job.title,
    job.company ?? "",
    job.description ?? "",
    ...job.responsibilities,
    ...job.requirements,
    ...job.skills,
  ];
  const text = parts.filter(Boolean).join("\n");
  return text.trim() || (job.rawText ?? "");
}
