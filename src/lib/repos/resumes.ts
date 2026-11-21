import { getDb, nowIso, parseJsonColumn } from "@/lib/db";
import type { ResumeRecord } from "@/lib/types";
import type { StoredResume } from "@/lib/parsing/schema";

interface ResumeRow {
  id: number;
  profile_id: number;
  title: string;
  is_master: number;
  source_type: "upload" | "manual" | "duplicate";
  original_filename: string | null;
  stored_path: string | null;
  mime_type: string | null;
  raw_text: string | null;
  parsed_json: string | null;
  parse_method: string | null;
  created_at: string;
  updated_at: string;
}

function toRecord(row: ResumeRow): ResumeRecord {
  return {
    id: row.id,
    profileId: row.profile_id,
    title: row.title,
    isMaster: row.is_master === 1,
    sourceType: row.source_type,
    originalFilename: row.original_filename,
    storedPath: row.stored_path,
    mimeType: row.mime_type,
    rawText: row.raw_text,
    parseMethod: row.parse_method,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listResumes(profileId: number): ResumeRecord[] {
  const rows = getDb()
    .prepare("SELECT * FROM resumes WHERE profile_id = ? ORDER BY is_master DESC, updated_at DESC")
    .all(profileId) as ResumeRow[];
  return rows.map(toRecord);
}

export function getResume(id: number): ResumeRecord | null {
  const row = getDb().prepare("SELECT * FROM resumes WHERE id = ?").get(id) as
    | ResumeRow
    | undefined;
  return row ? toRecord(row) : null;
}

export function getStoredResume(id: number): StoredResume | null {
  const row = getDb().prepare("SELECT parsed_json FROM resumes WHERE id = ?").get(id) as
    | { parsed_json: string | null }
    | undefined;
  if (!row?.parsed_json) return null;
  return parseJsonColumn<StoredResume | null>(row.parsed_json, null);
}

export function getMasterResume(profileId: number): ResumeRecord | null {
  const row = getDb()
    .prepare("SELECT * FROM resumes WHERE profile_id = ? AND is_master = 1")
    .get(profileId) as ResumeRow | undefined;
  return row ? toRecord(row) : null;
}

export interface ResumeInput {
  profileId: number;
  title: string;
  sourceType?: "upload" | "manual" | "duplicate";
  originalFilename?: string | null;
  storedPath?: string | null;
  mimeType?: string | null;
  rawText?: string | null;
  stored: StoredResume;
}

export function createResume(input: ResumeInput): ResumeRecord {
  const db = getDb();
  const hasMaster = db
    .prepare("SELECT 1 FROM resumes WHERE profile_id = ? AND is_master = 1")
    .get(input.profileId);
  const result = db
    .prepare(
      `INSERT INTO resumes (profile_id, title, is_master, source_type, original_filename,
        stored_path, mime_type, raw_text, parsed_json, parse_method)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.profileId,
      input.title,
      hasMaster ? 0 : 1, // first resume automatically becomes the master
      input.sourceType ?? "upload",
      input.originalFilename ?? null,
      input.storedPath ?? null,
      input.mimeType ?? null,
      input.rawText ?? null,
      JSON.stringify(input.stored),
      input.stored.parseMethod
    );
  return getResume(Number(result.lastInsertRowid))!;
}

export function updateResumeContent(
  id: number,
  stored: StoredResume,
  title?: string
): ResumeRecord | null {
  const db = getDb();
  if (title !== undefined) {
    db.prepare(
      "UPDATE resumes SET parsed_json = ?, parse_method = ?, title = ?, updated_at = ? WHERE id = ?"
    ).run(JSON.stringify(stored), stored.parseMethod, title, nowIso(), id);
  } else {
    db.prepare(
      "UPDATE resumes SET parsed_json = ?, parse_method = ?, updated_at = ? WHERE id = ?"
    ).run(JSON.stringify(stored), stored.parseMethod, nowIso(), id);
  }
  return getResume(id);
}

/** Exactly one master per profile is enforced by a partial unique index; swap inside a tx. */
export function setMasterResume(profileId: number, resumeId: number): void {
  const db = getDb();
  db.transaction(() => {
    db.prepare("UPDATE resumes SET is_master = 0 WHERE profile_id = ? AND is_master = 1").run(
      profileId
    );
    db.prepare("UPDATE resumes SET is_master = 1, updated_at = ? WHERE id = ? AND profile_id = ?").run(
      nowIso(),
      resumeId,
      profileId
    );
  })();
}

export function deleteResume(id: number): void {
  getDb().prepare("DELETE FROM resumes WHERE id = ?").run(id);
}
