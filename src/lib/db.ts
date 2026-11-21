import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

// JOBPILOT_DATA_DIR redirects the database, which the verification scripts set
// to a throwaway directory. Without it they run against the real database —
// they create and delete profiles and clear saved API keys, so a stray run
// would destroy real data.
export const DATA_DIR = process.env.JOBPILOT_DATA_DIR
  ? path.resolve(process.env.JOBPILOT_DATA_DIR)
  : path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "jobpilot.db");

const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";

const MIGRATIONS: string[] = [
  // ---- v1: initial schema ----
  `
  CREATE TABLE IF NOT EXISTS profiles (
    id                       INTEGER PRIMARY KEY AUTOINCREMENT,
    name                     TEXT NOT NULL UNIQUE,
    email                    TEXT,
    phone                    TEXT,
    location                 TEXT,
    headline                 TEXT,
    links_json               TEXT NOT NULL DEFAULT '[]',
    target_titles_json       TEXT NOT NULL DEFAULT '[]',
    preferred_locations_json TEXT NOT NULL DEFAULT '[]',
    salary_min               INTEGER,
    salary_max               INTEGER,
    salary_currency          TEXT NOT NULL DEFAULT 'PHP',
    work_setup               TEXT NOT NULL DEFAULT 'any'
                             CHECK (work_setup IN ('remote','hybrid','onsite','any')),
    created_at               TEXT NOT NULL DEFAULT (${NOW}),
    updated_at               TEXT NOT NULL DEFAULT (${NOW})
  );

  CREATE TABLE IF NOT EXISTS resumes (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_id        INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    title             TEXT NOT NULL,
    is_master         INTEGER NOT NULL DEFAULT 0,
    source_type       TEXT NOT NULL DEFAULT 'upload'
                      CHECK (source_type IN ('upload','manual','duplicate')),
    original_filename TEXT,
    stored_path       TEXT,
    mime_type         TEXT,
    raw_text          TEXT,
    parsed_json       TEXT,
    parse_method      TEXT,
    created_at        TEXT NOT NULL DEFAULT (${NOW}),
    updated_at        TEXT NOT NULL DEFAULT (${NOW})
  );
  CREATE INDEX IF NOT EXISTS idx_resumes_profile ON resumes(profile_id, updated_at DESC);
  CREATE UNIQUE INDEX IF NOT EXISTS uq_resumes_master ON resumes(profile_id) WHERE is_master = 1;

  CREATE TABLE IF NOT EXISTS jobs (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_id            INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    source                TEXT NOT NULL DEFAULT 'paste'
                          CHECK (source IN ('paste','url','manual','jsearch','adzuna','jooble','careerjet')),
    source_url            TEXT,
    external_id           TEXT,
    title                 TEXT NOT NULL,
    company               TEXT,
    location              TEXT,
    work_mode             TEXT CHECK (work_mode IN ('remote','hybrid','onsite') OR work_mode IS NULL),
    employment_type       TEXT,
    salary_min            INTEGER,
    salary_max            INTEGER,
    salary_currency       TEXT,
    salary_period         TEXT,
    description           TEXT,
    responsibilities_json TEXT NOT NULL DEFAULT '[]',
    requirements_json     TEXT NOT NULL DEFAULT '[]',
    skills_json           TEXT NOT NULL DEFAULT '[]',
    posted_at             TEXT,
    raw_text              TEXT,
    extraction_method     TEXT NOT NULL DEFAULT 'manual'
                          CHECK (extraction_method IN ('jsonld','ai','heuristic','api','manual')),
    dedupe_hash           TEXT NOT NULL,
    created_at            TEXT NOT NULL DEFAULT (${NOW}),
    updated_at            TEXT NOT NULL DEFAULT (${NOW})
  );
  CREATE UNIQUE INDEX IF NOT EXISTS uq_jobs_dedupe ON jobs(profile_id, dedupe_hash);
  CREATE INDEX IF NOT EXISTS idx_jobs_profile ON jobs(profile_id, created_at DESC);

  CREATE TABLE IF NOT EXISTS match_analyses (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id                INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    resume_id             INTEGER NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,
    method                TEXT NOT NULL CHECK (method IN ('ai','keyword')),
    model                 TEXT,
    score                 INTEGER NOT NULL CHECK (score BETWEEN 0 AND 100),
    summary               TEXT,
    matched_keywords_json TEXT NOT NULL DEFAULT '[]',
    missing_keywords_json TEXT NOT NULL DEFAULT '[]',
    strengths_json        TEXT NOT NULL DEFAULT '[]',
    gaps_json             TEXT NOT NULL DEFAULT '[]',
    suggestions_json      TEXT NOT NULL DEFAULT '[]',
    created_at            TEXT NOT NULL DEFAULT (${NOW})
  );
  CREATE INDEX IF NOT EXISTS idx_match_job ON match_analyses(job_id, created_at DESC);

  CREATE TABLE IF NOT EXISTS generated_documents (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_id    INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    job_id        INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    resume_id     INTEGER REFERENCES resumes(id) ON DELETE SET NULL,
    doc_type      TEXT NOT NULL CHECK (doc_type IN ('resume','cover_letter')),
    template      TEXT NOT NULL DEFAULT 'classic'
                  CHECK (template IN ('classic','modern','compact')),
    version       INTEGER NOT NULL DEFAULT 1,
    method        TEXT CHECK (method IN ('ai','heuristic') OR method IS NULL),
    content_json  TEXT,
    html          TEXT,
    pdf_path      TEXT,
    changes_json  TEXT NOT NULL DEFAULT '[]',
    warnings_json TEXT NOT NULL DEFAULT '[]',
    created_at    TEXT NOT NULL DEFAULT (${NOW})
  );
  CREATE INDEX IF NOT EXISTS idx_gendocs_job ON generated_documents(job_id, doc_type, version DESC);
  CREATE INDEX IF NOT EXISTS idx_gendocs_profile ON generated_documents(profile_id, created_at DESC);

  CREATE TABLE IF NOT EXISTS applications (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_id         INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    job_id             INTEGER NOT NULL UNIQUE REFERENCES jobs(id) ON DELETE CASCADE,
    status             TEXT NOT NULL DEFAULT 'saved'
                       CHECK (status IN ('saved','applied','interview','offer','rejected')),
    sort_order         INTEGER NOT NULL DEFAULT 0,
    applied_at         TEXT,
    follow_up_date     TEXT,
    notes              TEXT NOT NULL DEFAULT '',
    sent_resume_doc_id INTEGER REFERENCES generated_documents(id) ON DELETE SET NULL,
    sent_cover_doc_id  INTEGER REFERENCES generated_documents(id) ON DELETE SET NULL,
    created_at         TEXT NOT NULL DEFAULT (${NOW}),
    updated_at         TEXT NOT NULL DEFAULT (${NOW})
  );
  CREATE INDEX IF NOT EXISTS idx_applications_board ON applications(profile_id, status, sort_order);
  CREATE INDEX IF NOT EXISTS idx_applications_followup ON applications(profile_id, follow_up_date)
    WHERE follow_up_date IS NOT NULL;

  CREATE TABLE IF NOT EXISTS interview_preps (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id       INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    resume_id    INTEGER REFERENCES resumes(id) ON DELETE SET NULL,
    method       TEXT NOT NULL CHECK (method IN ('ai','template')),
    model        TEXT,
    content_json TEXT NOT NULL,
    created_at   TEXT NOT NULL DEFAULT (${NOW})
  );
  CREATE INDEX IF NOT EXISTS idx_preps_job ON interview_preps(job_id, created_at DESC);

  CREATE TABLE IF NOT EXISTS settings (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (${NOW})
  );

  CREATE TABLE IF NOT EXISTS search_cache (
    cache_key  TEXT PRIMARY KEY,
    source     TEXT NOT NULL,
    payload    TEXT NOT NULL,
    fetched_at TEXT NOT NULL DEFAULT (${NOW})
  );

  CREATE TABLE IF NOT EXISTS activity_log (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    kind       TEXT NOT NULL,
    ref_id     INTEGER,
    message    TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (${NOW})
  );
  CREATE INDEX IF NOT EXISTS idx_activity_profile ON activity_log(profile_id, created_at DESC);
  `,

  // ---- v2: admit 'jobicy' and 'remotive' as job sources ----
  // SQLite cannot alter a CHECK constraint, so the jobs table is rebuilt.
  // Child tables reference jobs by name, so after DROP + RENAME their foreign
  // keys land on the new table; migrate() turns foreign_keys off around this
  // (the pragma is a no-op inside a transaction) and runs foreign_key_check.
  `
  CREATE TABLE jobs_v2 (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_id            INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    source                TEXT NOT NULL DEFAULT 'paste'
                          CHECK (source IN ('paste','url','manual','jsearch','adzuna','jooble','careerjet','jobicy','remotive')),
    source_url            TEXT,
    external_id           TEXT,
    title                 TEXT NOT NULL,
    company               TEXT,
    location              TEXT,
    work_mode             TEXT CHECK (work_mode IN ('remote','hybrid','onsite') OR work_mode IS NULL),
    employment_type       TEXT,
    salary_min            INTEGER,
    salary_max            INTEGER,
    salary_currency       TEXT,
    salary_period         TEXT,
    description           TEXT,
    responsibilities_json TEXT NOT NULL DEFAULT '[]',
    requirements_json     TEXT NOT NULL DEFAULT '[]',
    skills_json           TEXT NOT NULL DEFAULT '[]',
    posted_at             TEXT,
    raw_text              TEXT,
    extraction_method     TEXT NOT NULL DEFAULT 'manual'
                          CHECK (extraction_method IN ('jsonld','ai','heuristic','api','manual')),
    dedupe_hash           TEXT NOT NULL,
    created_at            TEXT NOT NULL DEFAULT (${NOW}),
    updated_at            TEXT NOT NULL DEFAULT (${NOW})
  );
  INSERT INTO jobs_v2 (id, profile_id, source, source_url, external_id, title, company, location,
                       work_mode, employment_type, salary_min, salary_max, salary_currency,
                       salary_period, description, responsibilities_json, requirements_json,
                       skills_json, posted_at, raw_text, extraction_method, dedupe_hash,
                       created_at, updated_at)
    SELECT id, profile_id, source, source_url, external_id, title, company, location,
           work_mode, employment_type, salary_min, salary_max, salary_currency,
           salary_period, description, responsibilities_json, requirements_json,
           skills_json, posted_at, raw_text, extraction_method, dedupe_hash,
           created_at, updated_at
    FROM jobs;
  DROP TABLE jobs;
  ALTER TABLE jobs_v2 RENAME TO jobs;
  CREATE UNIQUE INDEX uq_jobs_dedupe ON jobs(profile_id, dedupe_hash);
  CREATE INDEX idx_jobs_profile ON jobs(profile_id, created_at DESC);
  `,

  // ---- v3: keep the board's own salary wording ----
  // JSearch v5 stopped sending job_salary_currency and gives a preformatted
  // string instead ("133K–185K a year"). Without somewhere to keep it, an
  // ingested job rendered as a bare "133,000 – 185,000" with no currency at
  // all — unreadable when PHP and USD postings sit side by side.
  `
  ALTER TABLE jobs ADD COLUMN salary_text TEXT;
  `,

  // ---- v4: admit the 'centered' resume template ----
  // SQLite cannot alter a CHECK constraint, so the table is rebuilt. Two child
  // columns reference it (applications.sent_resume_doc_id and
  // sent_cover_doc_id, both ON DELETE SET NULL); migrate() disables foreign key
  // enforcement around migrations and runs foreign_key_check afterwards, so the
  // DROP + RENAME leaves those pointing at the new table.
  `
  CREATE TABLE generated_documents_v2 (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_id    INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    job_id        INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    resume_id     INTEGER REFERENCES resumes(id) ON DELETE SET NULL,
    doc_type      TEXT NOT NULL CHECK (doc_type IN ('resume','cover_letter')),
    template      TEXT NOT NULL DEFAULT 'classic'
                  CHECK (template IN ('classic','modern','compact','centered')),
    version       INTEGER NOT NULL DEFAULT 1,
    method        TEXT CHECK (method IN ('ai','heuristic') OR method IS NULL),
    content_json  TEXT,
    html          TEXT,
    pdf_path      TEXT,
    changes_json  TEXT NOT NULL DEFAULT '[]',
    warnings_json TEXT NOT NULL DEFAULT '[]',
    created_at    TEXT NOT NULL DEFAULT (${NOW})
  );
  INSERT INTO generated_documents_v2 (id, profile_id, job_id, resume_id, doc_type, template,
                                      version, method, content_json, html, pdf_path,
                                      changes_json, warnings_json, created_at)
    SELECT id, profile_id, job_id, resume_id, doc_type, template,
           version, method, content_json, html, pdf_path,
           changes_json, warnings_json, created_at
    FROM generated_documents;
  DROP TABLE generated_documents;
  ALTER TABLE generated_documents_v2 RENAME TO generated_documents;
  CREATE INDEX idx_gendocs_job ON generated_documents(job_id, doc_type, version DESC);
  CREATE INDEX idx_gendocs_profile ON generated_documents(profile_id, created_at DESC);
  `,
];

// Cache the connection on globalThis: Next dev HMR re-evaluates modules, and a
// module-scoped instance would leak open handles (Windows then holds file
// locks that break backups and checkpoints).
const g = globalThis as unknown as { __jobpilot_db?: Database.Database };

export function getDb(): Database.Database {
  if (g.__jobpilot_db) return g.__jobpilot_db;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.pragma("busy_timeout = 5000");
  db.pragma("foreign_keys = ON");
  migrate(db);
  g.__jobpilot_db = db;
  return db;
}

function migrate(db: Database.Database) {
  const current = db.pragma("user_version", { simple: true }) as number;
  if (current >= MIGRATIONS.length) return;
  // Table rebuilds (v2) drop and recreate a parent table; with enforcement on,
  // the DROP would fail against existing child rows. Disabling enforcement for
  // the migration window and checking afterwards is SQLite's documented
  // procedure — the pragma must be set outside the transaction to take effect.
  db.pragma("foreign_keys = OFF");
  try {
    for (let i = current; i < MIGRATIONS.length; i++) {
      db.transaction(() => {
        db.exec(MIGRATIONS[i]);
        db.pragma(`user_version = ${i + 1}`);
      })();
    }
    const violations = db.pragma("foreign_key_check") as unknown[];
    if (violations.length > 0) {
      throw new Error(
        `Migration left ${violations.length} foreign key violation(s): ${JSON.stringify(violations[0])}`
      );
    }
  } finally {
    db.pragma("foreign_keys = ON");
  }
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function parseJsonColumn<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
