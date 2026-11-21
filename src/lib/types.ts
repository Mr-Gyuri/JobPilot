// Shared domain types used across repos, server actions, and UI components.

export type WorkSetup = "remote" | "hybrid" | "onsite" | "any";
export type WorkMode = "remote" | "hybrid" | "onsite";
export type ApplicationStatus = "saved" | "applied" | "interview" | "offer" | "rejected";
export type DocType = "resume" | "cover_letter";
export type TemplateId = "classic" | "modern" | "compact" | "centered";
export type PaperSize = "Letter" | "A4";
export type JobSource =
  | "paste"
  | "url"
  | "manual"
  | "jsearch"
  | "adzuna"
  | "jooble"
  | "careerjet"
  | "jobicy"
  | "remotive";
export type ExtractionMethod = "jsonld" | "ai" | "heuristic" | "api" | "manual";
export type GenerationMethod = "ai" | "heuristic";

export const APPLICATION_STATUSES: ApplicationStatus[] = [
  "saved",
  "applied",
  "interview",
  "offer",
  "rejected",
];

export const STATUS_LABELS: Record<ApplicationStatus, string> = {
  saved: "Saved",
  applied: "Applied",
  interview: "Interview",
  offer: "Offer",
  rejected: "Rejected",
};

export interface ProfileLink {
  label: string;
  url: string;
}

export interface Profile {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  location: string | null;
  headline: string | null;
  links: ProfileLink[];
  targetTitles: string[];
  preferredLocations: string[];
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string;
  workSetup: WorkSetup;
  createdAt: string;
  updatedAt: string;
}

export interface ResumeRecord {
  id: number;
  profileId: number;
  title: string;
  isMaster: boolean;
  sourceType: "upload" | "manual" | "duplicate";
  originalFilename: string | null;
  storedPath: string | null;
  mimeType: string | null;
  rawText: string | null;
  parseMethod: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface JobRecord {
  id: number;
  profileId: number;
  source: JobSource;
  sourceUrl: string | null;
  externalId: string | null;
  title: string;
  company: string | null;
  location: string | null;
  workMode: WorkMode | null;
  employmentType: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  salaryPeriod: string | null;
  /**
   * The board's own preformatted salary wording ("PHP 90K–130K a month").
   * JSearch v5 stopped sending a currency field, so this is the only fully
   * readable form — preferred for display when present.
   */
  salaryText: string | null;
  description: string | null;
  responsibilities: string[];
  requirements: string[];
  skills: string[];
  postedAt: string | null;
  rawText: string | null;
  extractionMethod: ExtractionMethod;
  dedupeHash: string;
  createdAt: string;
  updatedAt: string;
}

export interface MatchAnalysisRecord {
  id: number;
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
  createdAt: string;
}

export interface GeneratedDocRecord {
  id: number;
  profileId: number;
  jobId: number;
  resumeId: number | null;
  docType: DocType;
  template: TemplateId;
  version: number;
  method: GenerationMethod | null;
  pdfPath: string | null;
  changes: string[];
  warnings: string[];
  createdAt: string;
}

export interface ApplicationRecord {
  id: number;
  profileId: number;
  jobId: number;
  status: ApplicationStatus;
  sortOrder: number;
  appliedAt: string | null;
  followUpDate: string | null;
  notes: string;
  sentResumeDocId: number | null;
  sentCoverDocId: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface InterviewQuestion {
  question: string;
  category: "technical" | "behavioral" | "role_specific" | "gap_probing";
  whyLikely: string;
  answerOutline: string[];
}

export interface InterviewPrepContent {
  questions: InterviewQuestion[];
}

export interface InterviewPrepRecord {
  id: number;
  jobId: number;
  resumeId: number | null;
  method: "ai" | "template";
  model: string | null;
  content: InterviewPrepContent;
  createdAt: string;
}

export interface ActivityEntry {
  id: number;
  profileId: number;
  kind: string;
  refId: number | null;
  message: string;
  createdAt: string;
}

// Standard result envelope returned by every server action.
export type ActionResult<T = undefined> =
  | ({ ok: true; message?: string } & (T extends undefined ? { data?: undefined } : { data: T }))
  | { ok: false; message: string; code?: string };

// ---- Job search ----

export type ApiSourceId = "jsearch" | "adzuna" | "jooble" | "careerjet" | "jobicy" | "remotive";

export interface SearchParams {
  keywords: string;
  location: string;
  remoteOnly: boolean;
  datePosted: "any" | "day" | "3days" | "week" | "month";
  jobType: "" | "full_time" | "part_time" | "contract" | "temporary" | "internship";
  page: number;
}

export interface NormalizedJob {
  externalId: string;
  source: ApiSourceId;
  sourcePublisher?: string;
  title: string;
  company: string;
  location: string;
  isRemote: boolean;
  employmentType?: string;
  salaryMin?: number;
  salaryMax?: number;
  salaryCurrency?: string;
  salaryPeriod?: string;
  salaryText?: string;
  salaryIsEstimate?: boolean;
  postedAt?: string;
  url: string;
  descriptionSnippet?: string;
  /**
   * The board's own classification of the role ("Software Development",
   * "Customer Support"), when it publishes one. Used to drop results that a
   * loose keyword match dragged in from unrelated fields.
   */
  category?: string;
}

export interface SourceRef {
  source: ApiSourceId;
  publisher?: string;
  url: string;
}

export interface MergedJob extends NormalizedJob {
  sources: SourceRef[];
  duplicateCount: number;
  alreadySavedJobId?: number;
}

export interface SmartLink {
  id: string;
  label: string;
  url: string;
  note?: string;
}

export interface SourceStatus {
  id: ApiSourceId;
  label: string;
  keyStatus: "ok" | "missing";
  missingKeys: string[];
}

/**
 * `blocked` means the host answered with a bot-protection challenge rather than
 * data — a different situation from a failed call, because no key or retry fixes
 * it and the browser search link is the way through.
 */
export interface SourceError {
  source: string;
  message: string;
  kind: "error" | "blocked";
}

export interface SearchResponse {
  results: MergedJob[];
  duplicatesMerged: number;
  errors: SourceError[];
  smartLinks: SmartLink[];
  fromCache: string[];
  /**
   * What the Philippines focus filter removed. Reported so the UI can say why
   * the list is shorter instead of silently shrinking it.
   */
  hidden: { notOpenToPh: number; offTopic: number };
}

/**
 * A job reduced to what the keyword engines need. `company` and `location` are
 * carried separately so they can be excluded from keyword extraction — neither
 * is something a candidate can possess, and treating them as requirements
 * reports the employer's own name as a gap on the resume.
 */
export interface JobKeywordInput {
  title: string;
  company: string | null;
  text: string;
  location?: string | null;
}

// ---- Ingestion ----

export interface ExtractedJob {
  title: string;
  company: string | null;
  location: string | null;
  workMode: WorkMode | null;
  employmentType: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  salaryPeriod: string | null;
  responsibilities: string[];
  requirements: string[];
  skills: string[];
  rawText: string;
  extractionMethod: ExtractionMethod;
}

export type IngestFailureCode = "ROBOTS_DISALLOWED" | "FETCH_BLOCKED" | "UNSUPPORTED_CONTENT";
