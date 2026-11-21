import { getDb, nowIso } from "@/lib/db";
import type { ApplicationRecord, ApplicationStatus } from "@/lib/types";

interface ApplicationRow {
  id: number;
  profile_id: number;
  job_id: number;
  status: ApplicationStatus;
  sort_order: number;
  applied_at: string | null;
  follow_up_date: string | null;
  notes: string;
  sent_resume_doc_id: number | null;
  sent_cover_doc_id: number | null;
  created_at: string;
  updated_at: string;
}

function toRecord(row: ApplicationRow): ApplicationRecord {
  return {
    id: row.id,
    profileId: row.profile_id,
    jobId: row.job_id,
    status: row.status,
    sortOrder: row.sort_order,
    appliedAt: row.applied_at,
    followUpDate: row.follow_up_date,
    notes: row.notes,
    sentResumeDocId: row.sent_resume_doc_id,
    sentCoverDocId: row.sent_cover_doc_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listApplications(profileId: number): ApplicationRecord[] {
  const rows = getDb()
    .prepare("SELECT * FROM applications WHERE profile_id = ? ORDER BY status, sort_order")
    .all(profileId) as ApplicationRow[];
  return rows.map(toRecord);
}

export function getApplication(id: number): ApplicationRecord | null {
  const row = getDb().prepare("SELECT * FROM applications WHERE id = ?").get(id) as
    | ApplicationRow
    | undefined;
  return row ? toRecord(row) : null;
}

export function getApplicationByJob(jobId: number): ApplicationRecord | null {
  const row = getDb().prepare("SELECT * FROM applications WHERE job_id = ?").get(jobId) as
    | ApplicationRow
    | undefined;
  return row ? toRecord(row) : null;
}

export function createApplication(profileId: number, jobId: number): ApplicationRecord {
  const db = getDb();
  const max = db
    .prepare(
      "SELECT COALESCE(MAX(sort_order), 0) AS m FROM applications WHERE profile_id = ? AND status = 'saved'"
    )
    .get(profileId) as { m: number };
  const result = db
    .prepare(
      "INSERT INTO applications (profile_id, job_id, status, sort_order) VALUES (?, ?, 'saved', ?)"
    )
    .run(profileId, jobId, max.m + 1000);
  return getApplication(Number(result.lastInsertRowid))!;
}

/**
 * Drag-and-drop move: set the card's status and rewrite the destination
 * column's ordering in one transaction. orderedIds is the full id order of the
 * destination column after the drop. First move into 'applied' stamps applied_at.
 */
export function moveApplication(
  id: number,
  toStatus: ApplicationStatus,
  orderedIds: number[]
): ApplicationRecord | null {
  const db = getDb();
  db.transaction(() => {
    const current = db.prepare("SELECT status, applied_at FROM applications WHERE id = ?").get(id) as
      | { status: ApplicationStatus; applied_at: string | null }
      | undefined;
    if (!current) return;
    const stampApplied = toStatus === "applied" && !current.applied_at;
    db.prepare(
      `UPDATE applications SET status = ?, applied_at = COALESCE(applied_at, ?), updated_at = ? WHERE id = ?`
    ).run(toStatus, stampApplied ? nowIso() : null, nowIso(), id);
    const reorder = db.prepare("UPDATE applications SET sort_order = ? WHERE id = ?");
    orderedIds.forEach((appId, index) => {
      reorder.run((index + 1) * 1000, appId);
    });
  })();
  return getApplication(id);
}

export interface ApplicationDetailsUpdate {
  notes?: string;
  followUpDate?: string | null;
  appliedAt?: string | null;
  sentResumeDocId?: number | null;
  sentCoverDocId?: number | null;
}

export function updateApplicationDetails(
  id: number,
  update: ApplicationDetailsUpdate
): ApplicationRecord | null {
  const db = getDb();
  const existing = getApplication(id);
  if (!existing) return null;
  db.prepare(
    `UPDATE applications SET notes = ?, follow_up_date = ?, applied_at = ?,
      sent_resume_doc_id = ?, sent_cover_doc_id = ?, updated_at = ?
     WHERE id = ?`
  ).run(
    update.notes ?? existing.notes,
    update.followUpDate !== undefined ? update.followUpDate : existing.followUpDate,
    update.appliedAt !== undefined ? update.appliedAt : existing.appliedAt,
    update.sentResumeDocId !== undefined ? update.sentResumeDocId : existing.sentResumeDocId,
    update.sentCoverDocId !== undefined ? update.sentCoverDocId : existing.sentCoverDocId,
    nowIso(),
    id
  );
  return getApplication(id);
}

export function deleteApplication(id: number): void {
  getDb().prepare("DELETE FROM applications WHERE id = ?").run(id);
}

export interface DashboardStats {
  countsByStatus: Record<ApplicationStatus, number>;
  totalApplications: number;
  applied: number;
  interviews: number;
  offers: number;
  responseRate: number | null;
  weeklyCounts: { weekStart: string; count: number }[];
  upcomingFollowUps: { applicationId: number; jobId: number; date: string }[];
}

export function dashboardStats(profileId: number): DashboardStats {
  const db = getDb();
  const counts: Record<ApplicationStatus, number> = {
    saved: 0,
    applied: 0,
    interview: 0,
    offer: 0,
    rejected: 0,
  };
  const rows = db
    .prepare("SELECT status, COUNT(*) AS n FROM applications WHERE profile_id = ? GROUP BY status")
    .all(profileId) as { status: ApplicationStatus; n: number }[];
  for (const row of rows) counts[row.status] = row.n;

  const everApplied = db
    .prepare(
      "SELECT COUNT(*) AS n FROM applications WHERE profile_id = ? AND applied_at IS NOT NULL"
    )
    .get(profileId) as { n: number };
  const interviewsPlus = counts.interview + counts.offer;
  const responseRate = everApplied.n > 0 ? Math.round((interviewsPlus / everApplied.n) * 100) : null;

  // Applications per week over the last 12 weeks, keyed by the Monday of each week.
  const weeklyCounts: { weekStart: string; count: number }[] = [];
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  monday.setHours(0, 0, 0, 0);
  for (let i = 11; i >= 0; i--) {
    const start = new Date(monday);
    start.setDate(monday.getDate() - i * 7);
    const end = new Date(start);
    end.setDate(start.getDate() + 7);
    const row = db
      .prepare(
        "SELECT COUNT(*) AS n FROM applications WHERE profile_id = ? AND applied_at >= ? AND applied_at < ?"
      )
      .get(profileId, start.toISOString(), end.toISOString()) as { n: number };
    weeklyCounts.push({ weekStart: start.toISOString().slice(0, 10), count: row.n });
  }

  const horizon = new Date(now);
  horizon.setDate(now.getDate() + 7);
  const followRows = db
    .prepare(
      `SELECT id, job_id, follow_up_date FROM applications
       WHERE profile_id = ? AND follow_up_date IS NOT NULL AND follow_up_date <= ?
       ORDER BY follow_up_date`
    )
    .all(profileId, horizon.toISOString().slice(0, 10)) as {
    id: number;
    job_id: number;
    follow_up_date: string;
  }[];

  return {
    countsByStatus: counts,
    totalApplications: counts.saved + counts.applied + counts.interview + counts.offer + counts.rejected,
    applied: everApplied.n,
    interviews: counts.interview,
    offers: counts.offer,
    responseRate,
    weeklyCounts,
    upcomingFollowUps: followRows.map((r) => ({
      applicationId: r.id,
      jobId: r.job_id,
      date: r.follow_up_date,
    })),
  };
}
