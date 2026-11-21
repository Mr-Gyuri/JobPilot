import { getDb, nowIso, parseJsonColumn } from "@/lib/db";
import type { Profile, ProfileLink, WorkSetup } from "@/lib/types";

interface ProfileRow {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  location: string | null;
  headline: string | null;
  links_json: string;
  target_titles_json: string;
  preferred_locations_json: string;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string;
  work_setup: WorkSetup;
  created_at: string;
  updated_at: string;
}

function toProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    location: row.location,
    headline: row.headline,
    links: parseJsonColumn<ProfileLink[]>(row.links_json, []),
    targetTitles: parseJsonColumn<string[]>(row.target_titles_json, []),
    preferredLocations: parseJsonColumn<string[]>(row.preferred_locations_json, []),
    salaryMin: row.salary_min,
    salaryMax: row.salary_max,
    salaryCurrency: row.salary_currency,
    workSetup: row.work_setup,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface ProfileInput {
  name: string;
  email?: string | null;
  phone?: string | null;
  location?: string | null;
  headline?: string | null;
  links?: ProfileLink[];
  targetTitles?: string[];
  preferredLocations?: string[];
  salaryMin?: number | null;
  salaryMax?: number | null;
  salaryCurrency?: string;
  workSetup?: WorkSetup;
}

export function listProfiles(): Profile[] {
  const rows = getDb().prepare("SELECT * FROM profiles ORDER BY id").all() as ProfileRow[];
  return rows.map(toProfile);
}

export function getProfile(id: number): Profile | null {
  const row = getDb().prepare("SELECT * FROM profiles WHERE id = ?").get(id) as
    | ProfileRow
    | undefined;
  return row ? toProfile(row) : null;
}

export function countProfiles(): number {
  const row = getDb().prepare("SELECT COUNT(*) AS n FROM profiles").get() as { n: number };
  return row.n;
}

export function createProfile(input: ProfileInput): Profile {
  const db = getDb();
  const result = db
    .prepare(
      `INSERT INTO profiles (name, email, phone, location, headline, links_json,
        target_titles_json, preferred_locations_json, salary_min, salary_max,
        salary_currency, work_setup)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.name,
      input.email ?? null,
      input.phone ?? null,
      input.location ?? null,
      input.headline ?? null,
      JSON.stringify(input.links ?? []),
      JSON.stringify(input.targetTitles ?? []),
      JSON.stringify(input.preferredLocations ?? []),
      input.salaryMin ?? null,
      input.salaryMax ?? null,
      input.salaryCurrency ?? "PHP",
      input.workSetup ?? "any"
    );
  return getProfile(Number(result.lastInsertRowid))!;
}

export function updateProfile(id: number, input: ProfileInput): Profile | null {
  const db = getDb();
  db.prepare(
    `UPDATE profiles SET name = ?, email = ?, phone = ?, location = ?, headline = ?,
      links_json = ?, target_titles_json = ?, preferred_locations_json = ?,
      salary_min = ?, salary_max = ?, salary_currency = ?, work_setup = ?, updated_at = ?
     WHERE id = ?`
  ).run(
    input.name,
    input.email ?? null,
    input.phone ?? null,
    input.location ?? null,
    input.headline ?? null,
    JSON.stringify(input.links ?? []),
    JSON.stringify(input.targetTitles ?? []),
    JSON.stringify(input.preferredLocations ?? []),
    input.salaryMin ?? null,
    input.salaryMax ?? null,
    input.salaryCurrency ?? "PHP",
    input.workSetup ?? "any",
    nowIso(),
    id
  );
  return getProfile(id);
}

export function deleteProfile(id: number): void {
  getDb().prepare("DELETE FROM profiles WHERE id = ?").run(id);
}
