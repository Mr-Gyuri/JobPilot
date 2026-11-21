/**
 * Preloaded via --import ahead of every verification script so they run against
 * a throwaway database and storage tree instead of the real ones.
 *
 * This is not a nicety. The suites create and delete profiles (which cascades to
 * resumes, jobs and applications) and clear every saved API key to test source
 * gating. Pointed at the real data directory, `npm run verify` silently destroys
 * whatever the user had saved.
 *
 * The directory is created fresh per run and left on disk afterwards so a failed
 * run can be inspected; it lives under the OS temp dir, not the project.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = path.join(os.tmpdir(), "jobpilot-verify", String(process.pid));
const dataDir = path.join(root, "data");
const storageDir = path.join(root, "storage");

fs.rmSync(root, { recursive: true, force: true });
fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(storageDir, { recursive: true });

process.env.JOBPILOT_DATA_DIR = dataDir;
process.env.JOBPILOT_STORAGE_DIR = storageDir;

// Any real key in the environment would leak into assertions about which
// sources are configured, so the suites start from a known-empty state.
for (const key of [
  "ANTHROPIC_API_KEY",
  "RAPIDAPI_KEY",
  "OPENWEBNINJA_API_KEY",
  "ADZUNA_APP_ID",
  "ADZUNA_APP_KEY",
  "JOOBLE_API_KEY",
  "CAREERJET_API_KEY",
]) {
  delete process.env[key];
}

console.log(`[test-env] sandboxed data + storage under ${root}`);
