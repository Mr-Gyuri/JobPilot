/**
 * Verifies the persisted end-to-end flow through real SQLite and real file
 * storage — but a sandboxed copy of each, never the user's:
 * upload -> parse -> save master -> ingest job -> match -> generate documents
 * -> add to tracker -> move through stages -> dashboard stats -> cleanup.
 *
 *   npm run verify:flow
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const FIXTURES = process.argv[2];
if (!FIXTURES) {
  console.error("usage: node scripts/verify-flow.mts <fixtures-dir>");
  process.exit(1);
}

// This suite creates and deletes profiles, and deleting one cascades to its
// resumes, jobs and applications. Against the real database that is destructive,
// so require the sandbox that scripts/test-env.mjs sets up.
if (!process.env.JOBPILOT_DATA_DIR) {
  console.error(
    "Refusing to run against the real database — this suite deletes profiles.\n" +
      "Run via `npm run verify:flow`, which preloads scripts/test-env.mjs."
  );
  process.exit(1);
}

let failures = 0;
function check(label: string, condition: boolean, detail?: string) {
  if (!condition) failures++;
  console.log(`  [${condition ? "PASS" : "FAIL"}] ${label}${detail ? ` — ${detail}` : ""}`);
}

const { getDb } = await import("../src/lib/db.ts");
const profiles = await import("../src/lib/repos/profiles.ts");
const resumesRepo = await import("../src/lib/repos/resumes.ts");
const jobsRepo = await import("../src/lib/repos/jobs.ts");
const matchesRepo = await import("../src/lib/repos/matches.ts");
const docsRepo = await import("../src/lib/repos/documents.ts");
const appsRepo = await import("../src/lib/repos/applications.ts");
const activityRepo = await import("../src/lib/repos/activity.ts");
const { parseResumeFile } = await import("../src/lib/parsing/index.ts");
const { ingestFromText } = await import("../src/lib/ingest/pipeline.ts");
const { analyzeMatch } = await import("../src/lib/matching/index.ts");
const { tailorResume, generateCoverLetter } = await import("../src/lib/tailoring/index.ts");
const { generateResumePdf, generateCoverLetterPdf } = await import("../src/lib/pdf/index.ts");
const { writeStorageFile, resolveStoragePath, sanitizeFilename } = await import("../src/lib/storage.ts");
const { generateInterviewPrep } = await import("../src/lib/interview/index.ts");
const prepsRepo = await import("../src/lib/repos/preps.ts");

const TEST_PROFILE = "__verify_flow__";

// Clean up any leftovers from a previous run.
for (const existing of profiles.listProfiles().filter((p) => p.name === TEST_PROFILE)) {
  profiles.deleteProfile(existing.id);
}

console.log("\n1. Profile");
const profile = profiles.createProfile({
  name: TEST_PROFILE,
  email: "verify@example.com",
  targetTitles: ["Senior Backend Engineer"],
  preferredLocations: ["Philippines"],
  salaryCurrency: "PHP",
  workSetup: "remote",
});
check("created", profile.id > 0, `id=${profile.id}`);

console.log("\n2. Resume upload + parse + store");
const buffer = fs.readFileSync(path.join(FIXTURES, "maria-reyes-resume.pdf"));
const parsed = await parseResumeFile(buffer, "maria-reyes-resume.pdf");
const relPath = `uploads/resumes/${profile.id}/${crypto.randomUUID().slice(0, 8)}-${sanitizeFilename("maria-reyes-resume.pdf")}`;
writeStorageFile(relPath, buffer);
check("file written to storage", fs.existsSync(resolveStoragePath(relPath)), relPath);

const resume = resumesRepo.createResume({
  profileId: profile.id,
  title: "Maria Reyes — master",
  originalFilename: "maria-reyes-resume.pdf",
  storedPath: relPath,
  mimeType: "application/pdf",
  rawText: parsed.rawText,
  stored: {
    schemaVersion: 1,
    resume: parsed.resume,
    parseMethod: parsed.method,
    parseWarnings: parsed.warnings,
  },
});
check("first resume auto-becomes master", resume.isMaster, `isMaster=${resume.isMaster}`);
const roundTripped = resumesRepo.getStoredResume(resume.id);
check("parsed JSON round-trips", roundTripped?.resume.experience.length === 3,
  `${roundTripped?.resume.experience.length} roles`);

// A second version must not silently become master, and set-master must swap.
const second = resumesRepo.createResume({
  profileId: profile.id,
  title: "Maria Reyes — v2",
  sourceType: "duplicate",
  rawText: parsed.rawText,
  stored: { schemaVersion: 1, resume: parsed.resume, parseMethod: "manual", parseWarnings: [] },
});
check("second version is not master", !second.isMaster);
resumesRepo.setMasterResume(profile.id, second.id);
check("set-master swaps exactly one",
  resumesRepo.getMasterResume(profile.id)?.id === second.id &&
    resumesRepo.listResumes(profile.id).filter((r) => r.isMaster).length === 1);
resumesRepo.setMasterResume(profile.id, resume.id); // restore

console.log("\n3. Job ingestion + dedupe");
const jobText = fs.readFileSync(path.join(FIXTURES, "job-description.txt"), "utf8");
const ingested = await ingestFromText(jobText, "https://example.com/jobs/123");
if (!ingested.ok) {
  check("ingest ok", false, ingested.message);
  process.exit(1);
}
const inserted = jobsRepo.insertJob({
  profileId: profile.id,
  source: "paste",
  sourceUrl: ingested.sourceUrl,
  title: ingested.job.title,
  company: ingested.job.company,
  location: ingested.job.location,
  workMode: ingested.job.workMode,
  employmentType: ingested.job.employmentType,
  salaryMin: ingested.job.salaryMin,
  salaryMax: ingested.job.salaryMax,
  salaryCurrency: ingested.job.salaryCurrency,
  salaryPeriod: ingested.job.salaryPeriod,
  // JSearch v5 sends no currency field, so this preformatted wording is the
  // only fully readable salary a saved job may have. Round-trip asserted below.
  salaryText: "PHP 90K–130K a month",
  description: ingested.job.rawText,
  responsibilities: ingested.job.responsibilities,
  requirements: ingested.job.requirements,
  skills: ingested.job.skills,
  rawText: ingested.job.rawText,
  extractionMethod: ingested.job.extractionMethod,
});
check("job inserted", !inserted.duplicate);
const job = inserted.duplicate ? jobsRepo.getJob(inserted.existingJobId)! : inserted.job;
check("salary wording survives the round trip",
  jobsRepo.getJob(job.id)?.salaryText === "PHP 90K–130K a month",
  String(jobsRepo.getJob(job.id)?.salaryText));
check("arrays round-trip", job.requirements.length >= 4 && job.responsibilities.length >= 3,
  `${job.responsibilities.length} resp / ${job.requirements.length} req`);

// Same posting again must be reported as a duplicate, not inserted twice.
const again = jobsRepo.insertJob({
  profileId: profile.id, source: "paste", title: ingested.job.title,
  company: ingested.job.company, extractionMethod: "heuristic",
});
check("re-ingest detected as duplicate", again.duplicate, `existing id ${again.duplicate ? again.existingJobId : "-"}`);
check("still only 1 job", jobsRepo.listJobs(profile.id).length === 1);

console.log("\n4. Match analysis persisted");
const stored = resumesRepo.getStoredResume(resume.id)!;
const jobInput = { title: job.title, company: job.company, text: jobsRepo.jobFullText(job) };
const match = await analyzeMatch(stored.resume, jobInput);
const matchRecord = matchesRepo.createMatch({
  jobId: job.id, resumeId: resume.id,
  method: match.method === "ai" ? "ai" : "keyword", model: match.model,
  score: match.score, summary: match.summary,
  matchedKeywords: match.matchedKeywords, missingKeywords: match.missingKeywords,
  strengths: match.strengths, gaps: match.gaps, suggestions: match.suggestions,
});
check("match saved", matchRecord.id > 0, `${matchRecord.score}% via ${matchRecord.method}`);
check("latest match readable", matchesRepo.latestMatchForJob(job.id)?.id === matchRecord.id);
check("keywords round-trip", (matchesRepo.latestMatchForJob(job.id)?.matchedKeywords.length ?? 0) > 3);
check("average score computed", matchesRepo.averageMatchScore(profile.id) === matchRecord.score);

console.log("\n5. Document generation to disk");
const tailored = await tailorResume(stored.resume, jobInput, {
  matched: match.matchedKeywords, missing: match.missingKeywords,
});
const { pdf, html } = await generateResumePdf(tailored.resume, "modern", "Letter");
const pdfRel = `generated/${profile.id}/${job.id}/resume-v1-modern.pdf`;
writeStorageFile(pdfRel, pdf);
const resumeDoc = docsRepo.createDocument({
  profileId: profile.id, jobId: job.id, resumeId: resume.id,
  docType: "resume", template: "modern", method: tailored.method,
  content: { kind: "resume", resume: tailored.resume },
  html, pdfPath: pdfRel, changes: tailored.changes, warnings: tailored.warnings,
});
check("resume doc v1", resumeDoc.version === 1, `v${resumeDoc.version}`);
check("PDF on disk", fs.statSync(resolveStoragePath(pdfRel)).size > 8000,
  `${(fs.statSync(resolveStoragePath(pdfRel)).size / 1024).toFixed(0)} KB`);

const letter = await generateCoverLetter(tailored.resume, jobInput);
const coverRendered = await generateCoverLetterPdf({
  contact: tailored.resume.contact, body: letter.body,
  jobTitle: job.title, company: job.company, paper: "Letter",
});
const coverRel = `generated/${profile.id}/${job.id}/cover-letter-v1.pdf`;
writeStorageFile(coverRel, coverRendered.pdf);
const coverDoc = docsRepo.createDocument({
  profileId: profile.id, jobId: job.id, resumeId: resume.id,
  docType: "cover_letter", template: "modern",
  method: letter.method === "ai" ? "ai" : "heuristic",
  content: { kind: "cover_letter", body: letter.body },
  html: coverRendered.html, pdfPath: coverRel, changes: [], warnings: [],
});
check("cover letter v1", coverDoc.version === 1);
check("versions are per doc type", resumeDoc.version === 1 && coverDoc.version === 1);

// A second resume generation must be v2 (independent of the cover letter).
const v2 = docsRepo.createDocument({
  profileId: profile.id, jobId: job.id, resumeId: resume.id,
  docType: "resume", template: "classic", method: tailored.method,
  content: { kind: "resume", resume: tailored.resume },
  html, pdfPath: pdfRel, changes: [], warnings: [],
});
check("second resume is v2", v2.version === 2, `v${v2.version}`);
check("job has 3 documents", docsRepo.listDocumentsForJob(job.id).length === 3);
check("content re-readable for re-render",
  docsRepo.getDocumentContent(resumeDoc.id)?.kind === "resume");

console.log("\n6. Interview prep persisted");
const prep = await generateInterviewPrep(stored.resume, jobInput);
const prepRecord = prepsRepo.createPrep({
  jobId: job.id, resumeId: resume.id,
  method: prep.method === "ai" ? "ai" : "template", model: prep.model,
  content: prep.content,
});
check("prep saved", prepRecord.content.questions.length >= 8, `${prepRecord.content.questions.length} questions`);
check("prep readable", prepsRepo.latestPrepForJob(job.id)?.id === prepRecord.id);

console.log("\n7. Tracker: kanban moves");
const app = appsRepo.createApplication(profile.id, job.id);
check("card created in Saved", app.status === "saved" && app.appliedAt === null);
check("one card per job", appsRepo.getApplicationByJob(job.id)?.id === app.id);

const applied = appsRepo.moveApplication(app.id, "applied", [app.id]);
check("moved to Applied", applied?.status === "applied");
check("applied_at auto-stamped", applied?.appliedAt != null, String(applied?.appliedAt));
const stampedAt = applied!.appliedAt;

const interview = appsRepo.moveApplication(app.id, "interview", [app.id]);
check("moved to Interview", interview?.status === "interview");
check("applied_at preserved", interview?.appliedAt === stampedAt);

// Ordering: three cards in one column get rewritten in the given order.
const extraJobs = ["Alpha Role", "Beta Role"].map((title) => {
  const r = jobsRepo.insertJob({ profileId: profile.id, source: "manual", title, company: "Other Co", extractionMethod: "manual" });
  return r.duplicate ? jobsRepo.getJob(r.existingJobId)! : r.job;
});
const extraApps = extraJobs.map((j) => appsRepo.createApplication(profile.id, j.id));
const desiredOrder = [extraApps[1].id, extraApps[0].id];
appsRepo.moveApplication(extraApps[1].id, "saved", desiredOrder);
const savedColumn = appsRepo
  .listApplications(profile.id)
  .filter((a) => a.status === "saved")
  .sort((a, b) => a.sortOrder - b.sortOrder)
  .map((a) => a.id);
check("column order rewritten", savedColumn.join(",") === desiredOrder.join(","),
  `${savedColumn.join(",")} vs ${desiredOrder.join(",")}`);

const inThreeDays = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
const inThirtyDays = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
appsRepo.updateApplicationDetails(app.id, {
  notes: "Recruiter: Ana. Referred by Paolo.",
  followUpDate: inThreeDays,
  sentResumeDocId: resumeDoc.id,
  sentCoverDocId: coverDoc.id,
});
// A far-future follow-up must stay out of the dashboard's 7-day window.
appsRepo.updateApplicationDetails(extraApps[0].id, { followUpDate: inThirtyDays });
const detailed = appsRepo.getApplication(app.id)!;
check("notes saved", detailed.notes.includes("Paolo"));
check("follow-up saved", detailed.followUpDate === inThreeDays);
check("sent doc recorded", detailed.sentResumeDocId === resumeDoc.id);

console.log("\n8. Dashboard stats");
const stats = appsRepo.dashboardStats(profile.id);
check("counts by status", stats.countsByStatus.interview === 1 && stats.countsByStatus.saved === 2,
  JSON.stringify(stats.countsByStatus));
check("total applications", stats.totalApplications === 3, `${stats.totalApplications}`);
check("applied count", stats.applied === 1, `${stats.applied}`);
check("response rate computed", stats.responseRate === 100, `${stats.responseRate}%`);
check("12 weekly buckets", stats.weeklyCounts.length === 12);
check("this week counted", stats.weeklyCounts.at(-1)?.count === 1, `${stats.weeklyCounts.at(-1)?.count}`);
check("due follow-up surfaced", stats.upcomingFollowUps.some((f) => f.applicationId === app.id),
  `${stats.upcomingFollowUps.length} due`);
check("far-future follow-up excluded",
  !stats.upcomingFollowUps.some((f) => f.applicationId === extraApps[0].id));

activityRepo.logActivity(profile.id, "verify", "flow verification run", job.id);
check("activity log", activityRepo.recentActivity(profile.id).length >= 1);

console.log("\n9. Cascade delete");
const jobIdBefore = job.id;
profiles.deleteProfile(profile.id);
check("job removed with profile", jobsRepo.getJob(jobIdBefore) === null);
check("resume removed with profile", resumesRepo.getResume(resume.id) === null);
check("document removed with profile", docsRepo.getDocument(resumeDoc.id) === null);
check("application removed with profile", appsRepo.getApplication(app.id) === null);

// Generated files are intentionally left on disk; clean up this run's dir.
const genDir = resolveStoragePath(`generated/${profile.id}`);
if (fs.existsSync(genDir)) fs.rmSync(genDir, { recursive: true, force: true });
const upDir = resolveStoragePath(`uploads/resumes/${profile.id}`);
if (fs.existsSync(upDir)) fs.rmSync(upDir, { recursive: true, force: true });

getDb().close();
console.log(`\n${failures === 0 ? "ALL FLOW CHECKS PASSED" : `${failures} FLOW CHECK(S) FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);
