import type { MergedJob, NormalizedJob, SourceRef } from "@/lib/types";

// Cross-source deduplication. The same posting shows up on several boards with
// slightly different titles ("Sr. React Developer (URGENT!)" vs "Senior React
// Developer"), so we do an exact pass on normalized keys, then a fuzzy pass
// within cheap company-letter blocks. Zero dependencies.

const TITLE_NOISE = new Set([
  "urgent", "hiring", "apply", "now", "wfh", "remote", "new", "asap", "immediate",
]);

// Boards abbreviate seniority and role words inconsistently ("Sr. React Dev"
// vs "Senior React Developer"), which otherwise defeats token comparison.
const TITLE_SYNONYMS: Record<string, string> = {
  sr: "senior", snr: "senior", jr: "junior", jnr: "junior",
  dev: "developer", devs: "developer", eng: "engineer", engr: "engineer",
  mgr: "manager", mgmt: "management", admin: "administrator", asst: "assistant",
  assoc: "associate", spec: "specialist", coord: "coordinator", dir: "director",
  exec: "executive", tech: "technician", acct: "accountant", ii: "2", iii: "3",
};

const COMPANY_SUFFIXES = new Set([
  "inc", "corp", "corporation", "co", "ltd", "llc", "opc", "phils",
  "philippines", "international", "group", "solutions", "services",
]);

function normTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, " ") // parentheticals: "(remote)", "[urgent]"
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((t) => t && !TITLE_NOISE.has(t))
    .map((t) => TITLE_SYNONYMS[t] ?? t)
    .join(" ");
}

function normCompany(company: string): string {
  const tokens = company
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter(Boolean);
  const filtered = tokens.filter((t) => !COMPANY_SUFFIXES.has(t));
  // Keep something comparable when the name is all suffixes ("Philippines Group").
  return (filtered.length > 0 ? filtered : tokens).join(" ");
}

function normCity(location: string): string {
  const first = (location.split(",")[0] ?? "").trim().toLowerCase();
  return first === "" || first === "remote" ? "" : first;
}

function tokenJaccard(a: string, b: string): number {
  const setA = new Set(a.split(" ").filter(Boolean));
  const setB = new Set(b.split(" ").filter(Boolean));
  if (setA.size === 0 && setB.size === 0) return 1;
  let intersection = 0;
  for (const token of setA) if (setB.has(token)) intersection++;
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/** Iterative two-row Levenshtein, returned as similarity in [0, 1]. */
function levenshteinSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let curr = new Array<number>(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return 1 - prev[b.length] / maxLen;
}

interface Cluster {
  title: string;
  company: string;
  city: string;
  members: NormalizedJob[];
}

function isDuplicate(a: Cluster, b: Cluster): boolean {
  return (
    tokenJaccard(a.title, b.title) >= 0.85 &&
    levenshteinSimilarity(a.company, b.company) >= 0.9 &&
    (a.city === b.city || a.city === "" || b.city === "")
  );
}

/** Earlier postedAt wins; missing dates sort last. */
function byEarliestPosted(a: NormalizedJob, b: NormalizedJob): number {
  const ta = a.postedAt ? Date.parse(a.postedAt) : NaN;
  const tb = b.postedAt ? Date.parse(b.postedAt) : NaN;
  return (Number.isNaN(ta) ? Infinity : ta) - (Number.isNaN(tb) ? Infinity : tb);
}

function pickCanonical(members: NormalizedJob[]): NormalizedJob {
  return [...members].sort((a, b) => {
    const lenDiff = (b.descriptionSnippet?.length ?? 0) - (a.descriptionSnippet?.length ?? 0);
    return lenDiff !== 0 ? lenDiff : byEarliestPosted(a, b);
  })[0];
}

function mergeCluster(members: NormalizedJob[]): MergedJob {
  const canonical = pickCanonical(members);

  const sources: SourceRef[] = [];
  const seenRefs = new Set<string>();
  for (const m of members) {
    const refKey = `${m.source}|${m.url}`;
    if (seenRefs.has(refKey)) continue;
    seenRefs.add(refKey);
    sources.push({ source: m.source, publisher: m.sourcePublisher, url: m.url });
  }

  // Salary fields travel together — mixing min from one source with currency
  // from another would fabricate figures nobody posted.
  const salarySource = members.find(
    (m) => m.salaryMin != null || m.salaryMax != null || m.salaryText
  );
  const postedSource = members.find((m) => m.postedAt);

  return {
    ...canonical,
    salaryMin: salarySource?.salaryMin,
    salaryMax: salarySource?.salaryMax,
    salaryCurrency: salarySource?.salaryCurrency,
    salaryPeriod: salarySource?.salaryPeriod,
    salaryText: salarySource?.salaryText,
    salaryIsEstimate: salarySource?.salaryIsEstimate,
    postedAt: postedSource?.postedAt,
    sources,
    duplicateCount: members.length - 1,
  };
}

export function dedupeJobs(jobs: NormalizedJob[]): {
  merged: MergedJob[];
  duplicatesMerged: number;
} {
  // Pass 1 — exact grouping on normalized title|company|city.
  const exact = new Map<string, Cluster>();
  for (const job of jobs) {
    const title = normTitle(job.title);
    const company = normCompany(job.company);
    const city = normCity(job.location);
    const key = `${title}|${company}|${city}`;
    const cluster = exact.get(key);
    if (cluster) {
      cluster.members.push(job);
    } else {
      exact.set(key, { title, company, city, members: [job] });
    }
  }

  // Pass 2 — fuzzy merge of clusters, blocked by first letter of the
  // normalized company so we only compare plausible pairs.
  const blocks = new Map<string, Cluster[]>();
  const final: Cluster[] = [];
  for (const cluster of exact.values()) {
    const blockKey = cluster.company.charAt(0);
    const block = blocks.get(blockKey) ?? [];
    const match = block.find((existing) => isDuplicate(existing, cluster));
    if (match) {
      match.members.push(...cluster.members);
      if (match.city === "") match.city = cluster.city; // tighten for later comparisons
    } else {
      block.push(cluster);
      blocks.set(blockKey, block);
      final.push(cluster);
    }
  }

  const merged = final.map((cluster) => mergeCluster(cluster.members));
  // postedAt desc, missing dates last.
  merged.sort((a, b) => {
    const ta = a.postedAt ? Date.parse(a.postedAt) : NaN;
    const tb = b.postedAt ? Date.parse(b.postedAt) : NaN;
    const va = Number.isNaN(ta) ? -Infinity : ta;
    const vb = Number.isNaN(tb) ? -Infinity : tb;
    return va === vb ? 0 : vb - va;
  });

  return { merged, duplicatesMerged: jobs.length - merged.length };
}
