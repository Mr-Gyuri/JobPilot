import { getDb, parseJsonColumn } from "@/lib/db";
import type { MatchAnalysisRecord } from "@/lib/types";

interface MatchRow {
  id: number;
  job_id: number;
  resume_id: number;
  method: "ai" | "keyword";
  model: string | null;
  score: number;
  summary: string | null;
  matched_keywords_json: string;
  missing_keywords_json: string;
  strengths_json: string;
  gaps_json: string;
  suggestions_json: string;
  created_at: string;
}

function toRecord(row: MatchRow): MatchAnalysisRecord {
  return {
    id: row.id,
    jobId: row.job_id,
    resumeId: row.resume_id,
    method: row.method,
    model: row.model,
    score: row.score,
    summary: row.summary,
    matchedKeywords: parseJsonColumn<string[]>(row.matched_keywords_json, []),
    missingKeywords: parseJsonColumn<string[]>(row.missing_keywords_json, []),
    strengths: parseJsonColumn<string[]>(row.strengths_json, []),
    gaps: parseJsonColumn<string[]>(row.gaps_json, []),
    suggestions: parseJsonColumn<string[]>(row.suggestions_json, []),
    createdAt: row.created_at,
  };
}

export interface MatchInput {
  jobId: number;
  resumeId: number;
  method: "ai" | "keyword";
  model: string | null;
  score: number;
  summary: string | null;
  matchedKeywords: string[];
  missingKeywords: string[];
  strengths: string[];
  gaps: string[];
  suggestions: string[];
}

export function createMatch(input: MatchInput): MatchAnalysisRecord {
  const result = getDb()
    .prepare(
      `INSERT INTO match_analyses (job_id, resume_id, method, model, score, summary,
        matched_keywords_json, missing_keywords_json, strengths_json, gaps_json, suggestions_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.jobId,
      input.resumeId,
      input.method,
      input.model,
      Math.max(0, Math.min(100, Math.round(input.score))),
      input.summary,
      JSON.stringify(input.matchedKeywords),
      JSON.stringify(input.missingKeywords),
      JSON.stringify(input.strengths),
      JSON.stringify(input.gaps),
      JSON.stringify(input.suggestions)
    );
  return getMatch(Number(result.lastInsertRowid))!;
}

export function getMatch(id: number): MatchAnalysisRecord | null {
  const row = getDb().prepare("SELECT * FROM match_analyses WHERE id = ?").get(id) as
    | MatchRow
    | undefined;
  return row ? toRecord(row) : null;
}

export function latestMatchForJob(jobId: number): MatchAnalysisRecord | null {
  const row = getDb()
    .prepare("SELECT * FROM match_analyses WHERE job_id = ? ORDER BY created_at DESC LIMIT 1")
    .get(jobId) as MatchRow | undefined;
  return row ? toRecord(row) : null;
}

export function averageMatchScore(profileId: number): number | null {
  const row = getDb()
    .prepare(
      `SELECT AVG(m.score) AS avg FROM match_analyses m
       JOIN jobs j ON j.id = m.job_id WHERE j.profile_id = ?`
    )
    .get(profileId) as { avg: number | null };
  return row.avg == null ? null : Math.round(row.avg);
}
