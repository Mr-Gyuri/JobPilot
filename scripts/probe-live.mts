/**
 * Calls every job-search adapter against its REAL endpoint using a deliberately
 * invalid credential. No real key is used and nothing is saved.
 *
 * This is the one thing the offline suite cannot check: that the host resolves,
 * the path and scheme are right, the auth header is in the shape the provider
 * expects, and a rejection comes back as a readable message. A valid key is the
 * only remaining unknown — response mapping is covered offline against recorded
 * payloads.
 *
 *   node --import ./scripts/alias-hook.mjs scripts/probe-live.mts
 */
import { BotProtectionError, type SourceAdapter } from "@/lib/sources/adapter";
import { adzunaAdapter } from "@/lib/sources/adzuna";
import { careerjetAdapter } from "@/lib/sources/careerjet";
import { jobicyAdapter } from "@/lib/sources/jobicy";
import { joobleAdapter } from "@/lib/sources/jooble";
import { jsearchAdapter } from "@/lib/sources/jsearch";
import { remotiveAdapter } from "@/lib/sources/remotive";
import type { SearchParams } from "@/lib/types";

const FAKE = "jobpilot-live-probe-invalid-key";

const params: SearchParams = {
  keywords: "software engineer",
  location: "Philippines",
  remoteOnly: false,
  datePosted: "any",
  jobType: "",
  page: 1,
};

// An invalid key must be REJECTED (proving the request reached the API), not
// answered with a transport error (proving it did not).
const REJECTED = /invalid|unauthor|not subscribed|api key|auth|forbidden|quota|expired/i;

interface Case {
  label: string;
  adapter: SourceAdapter;
  keys: Record<string, string>;
  /** Keyless sources have no auth to reject — the pass condition is real data. */
  keyless?: boolean;
}

const cases: Case[] = [
  { label: "jsearch via RapidAPI", adapter: jsearchAdapter, keys: { RAPIDAPI_KEY: FAKE } },
  { label: "jsearch direct", adapter: jsearchAdapter, keys: { OPENWEBNINJA_API_KEY: FAKE } },
  { label: "adzuna", adapter: adzunaAdapter, keys: { ADZUNA_APP_ID: FAKE, ADZUNA_APP_KEY: FAKE } },
  { label: "careerjet v4", adapter: careerjetAdapter, keys: { CAREERJET_API_KEY: FAKE } },
  { label: "jooble", adapter: joobleAdapter, keys: { JOOBLE_API_KEY: FAKE } },
  { label: "jobicy (keyless)", adapter: jobicyAdapter, keys: {}, keyless: true },
  { label: "remotive (keyless)", adapter: remotiveAdapter, keys: {}, keyless: true },
];

let reachable = 0;
let blocked = 0;
let broken = 0;

for (const { label, adapter, keys, keyless } of cases) {
  process.stdout.write(`\n${label}\n`);
  try {
    const jobs = await adapter.search(params, keys);
    if (keyless) {
      // No auth to reject; real data coming back is the proof of reachability.
      process.stdout.write(`  [REACHABLE] returned ${jobs.length} live job(s), no key needed\n`);
      reachable++;
      continue;
    }
    // An invalid key returning data would mean auth is not being enforced.
    process.stdout.write(`  [??] returned ${jobs.length} job(s) with an invalid key\n`);
    broken++;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (err instanceof BotProtectionError) {
      process.stdout.write(`  [BLOCKED] bot-protection challenge — browser link only\n`);
      blocked++;
    } else if (REJECTED.test(message)) {
      process.stdout.write(`  [REACHABLE] API rejected the fake key: ${message}\n`);
      reachable++;
    } else {
      process.stdout.write(`  [BROKEN] did not reach the API: ${message}\n`);
      broken++;
    }
  }
}

process.stdout.write(
  `\n${reachable} reachable · ${blocked} blocked by bot protection · ${broken} broken\n`
);
process.stdout.write(
  broken === 0
    ? "Every adapter that can be reached from this network reaches its API.\n"
    : "At least one adapter cannot reach its API — see [BROKEN] above.\n"
);
process.exit(broken === 0 ? 0 : 1);
